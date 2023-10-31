//? improve the vars file with the column names ? so that it's easier to maintain code, and it's default
//NOTE: uploaded files are downloadable till 2099
//NOTE:
//TODO: adapt file documentation
//TODO: deal with type change, participant registration etc..
//TODO: Check callback positioning
const { FieldValue } = require("firebase-admin/firestore");
const promptHelper = require(Runtime.getFunctions()["messaging/send_prompt"].path);
const varsHelper = require(Runtime.getFunctions()["vars_helper"].path);
const transcriptionHelper = require(Runtime.getFunctions()["transcription_fb"].path);
const firebaseHelper = require(Runtime.getFunctions()["google_firebase_helper"].path);

/**
 * Main entrypoint for Waxal workflow.
 * @param {object} context contains Twilio client context.
 * @param {object} event contains information about the user-triggered event.
 * @param callback event callback handler.
 */
exports.handler = async (context, event, callback) => {
  console.log("this is the beginning");
  // Strip non-numeric characters from the phone number.
  const participantPhone = event["From"].replace(/^\D+/g, "");

  try {
    const participantRef = await firebaseHelper.getParticipantDocRef(participantPhone, true);
    const participantSnapshot = await participantRef.get();

    if (!participantSnapshot.exists) {
      console.log("Participant not registered");
      let audio = varsHelper.getVar("not-registered-audio");
      await promptHelper.sendPrompt(context, participantPhone, audio, false);
    } else {
      const participantData = participantSnapshot.data();
      console.log(`Participant status is ${participantData["status"]}`);

      if (participantData["status"] === "Consented") {
        // Send consent audio for first timers.
        console.log(`Sending consent message for participantData type: ${participantData["type"]}`);
        if (participantData["type"] === "Transcriber") {
          let text = varsHelper.getVar("transcription-instructions");
          await promptHelper.sendPrompt(context, participantPhone, text, true);
        } else {
          let audio = varsHelper.getVar("consent-audio");
          await promptHelper.sendPrompt(context, participantPhone, audio, false);
        }
      }

      if (participantData["status"] === "Prompted") {
        console.log("Processing prompt response");
        // Expect a response for prompted users.
        await handlePromptResponse(context, event["Body"], event["MediaUrl0"], participantRef, participantData);
      } else if (participantData["status"] === "Ready" || participantData["status"] === "Consented") {
        // Send the first image for consented and ready users.
        console.log("Sending the next prompt");
        await handleSendPrompt(context, participantData);
      }

      // If the status is completed, send the completion audio.
      // This can either be the state at entry or after {@link handlePromptResponse}.
      if (participantData["status"] === "Completed") {
        console.log("Sending the closing message");
        // Send the closing message for completed users.
        const surveyCompletedAudio = varsHelper.getVar("survey-completed-audio");
        await promptHelper.sendPrompt(context, participantPhone, surveyCompletedAudio, false);
      }

      console.log("Saving changes to the participant document in the firestore.");
      await participantRef.update(participantData);
      console.log("Successfully updated participant data in firestore");
    }
  } catch (e) {
    console.error(e);
    await promptHelper.sendPrompt(context, participantPhone, varsHelper.getVar("error-message-audio"), false);
  }
  console.log("the end");
  return callback(null, event); //? return or not return?
};

/**
 * Handles the case where the user has been prompted and is expected to send a response.
 * @param {object} context contains Twilio client context.
 * @param {string} body Text content of participant message.
 * @param {string} mediaUrl the URL of the media contained in the participant's message.
 * @param {string} participantRef the reference to the firestore document representing the current user
 * @param {object} participantData the current participant data.
 * @returns
 */
async function handlePromptResponse(context, body, mediaUrl, participantRef, participantData) {
  if (participantData["type"] === "Transcriber") {
    // Notify the user if they send a message that doesn't contain text.
    if (!body) {
      const msg = varsHelper.getVar("transcription-instructions");
      console.log("User did not include transcription text");
      await promptHelper.sendPrompt(context, participantData["phone"], msg, true);
      return;
    }

    const lastRespTranscribedId =
      participantData["transcribed_responses"][participantData["transcribed_responses"].length - 1];
    await transcriptionHelper.addTranscription(participantRef, participantData, lastRespTranscribedId, body);

    // Mark completed if this response is the final one, else mark ready.
    participantData["answered_transcriptions"] += 1;
    participantData["status"] =
      participantData["answered_transcriptions"] >= participantData["number_transcriptions"] ? "Completed" : "Ready";
  } else {
    // Notify the user if they send a message that doesn't contain audio.
    if (!mediaUrl) {
      let audio = varsHelper.getVar("voice-note-required-audio");
      console.log("User did not include voice note");
      await promptHelper.sendPrompt(context, participantData["phone"], audio, false);
      return;
    }

    const lastPromptId = participantData["used_prompts"][participantData["used_prompts"].length - 1];
    const uploadHelper = require(Runtime.getFunctions()["upload_voice_fb"].path);
    notTooShort = await uploadHelper.uploadVoice(context, lastPromptId, mediaUrl, participantRef, participantData);

    // Mark completed if this response is the final one, else mark ready.
    participantData["answered_questions"] += 1;
    participantData["status"] =
      participantData["answered_questions"] >= participantData["number_questions"] ? "Completed" : "Ready";

    if (!notTooShort) {
      return;
    }
  }

  console.log(`Participant status is now : ${participantData["status"]}`);
  console.log("Saving changes to the participant document in the firestore.");
  await participantRef.update(participantData); //? may be redundant but better for data persistence I suppose ?
  console.log("Successfully updated participant data in firestore\n"); 

  if (participantData["status"] !== "Completed") {
    // Send next prompt.
    console.log("User not yet done. Sending next prompt");
    await handleSendPrompt(context, participantData);
  } else {
    console.log("User has completed all prompts");
  }
}

/**
 * Handles the case where the user is ready for the next prompt.
 * @param {object} context contains Twilio client context.
 * @param {object} participantData the current participant data.
 */
async function handleSendPrompt(context, participantData) {
  const promptFetchHelper = require(Runtime.getFunctions()["prompt_fetch_fb"].path);
  const isTranscription = participantData["type"] === "Transcriber";

  try {
    var fetchedPrompt = isTranscription
      ? await transcriptionHelper.getNextPrompt(participantData["transcribed_responses"], participantData["language"])
      : await promptFetchHelper.getNextPrompt(participantData["used_prompts"]);
  } catch (e) {
    if (e.message === "NoMorePromptError") {
      return;
    } else {
      throw e;
    }
  }

  const positionString = isTranscription
    ? `${fetchedPrompt["position"]}/${participantData["number_transcriptions"]}`
    : `${fetchedPrompt["position"]}/${participantData["number_questions"]}`;

  console.log(`Sending ${fetchedPrompt["type"]} prompt ${fetchedPrompt["content"]}`);
  await promptHelper.sendPrompt(context, participantData["phone"], positionString, true);
  await promptHelper.sendPrompt(
    context,
    participantData["phone"],
    fetchedPrompt["content"], //media URL or text
    fetchedPrompt["type"] === "text"
  );

  const usedIDsArrayName = isTranscription ? "transcribed_responses" : "used_prompts";
  participantData[usedIDsArrayName].push(fetchedPrompt["id"]);
  participantData["status"] = "Prompted";

  console.log(`Setting participant status to "Prompted"`);
}
