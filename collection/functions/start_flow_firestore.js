//? improve the vars file with the column names ? so that it's easier to maintain code, and it's default
//TODO: adapt file documentation
//TODO: Don't forget to add the prompt/response IDs to the corresponding arrays in the participant doc when used
//TODO: check all missing async/await
const { FieldValue } = require("firebase-admin/firestore");
const promptHelper = require(Runtime.getFunctions()["messaging/send_prompt"].path);
const varsHelper = require(Runtime.getFunctions()["vars_helper"].path);
const transcriptionHelper = require(Runtime.getFunctions()["transcription"].path);

/**
 * Main entrypoint for Waxal workflow.
 * @param {object} context contains Twilio client context.
 * @param {object} event contains information about the user-triggered event.
 * @param callback event callback handler.
 */
exports.handler = async (context, event, callback) => {
  // Strip non-numeric characters from phone number.
  let participantPhone = event["From"].replace(/^\D+/g, "");
  try {
    let path = Runtime.getFunctions()["google_firebase_helper"].path;
    let helper = require(path);
    const participantRef = await helper.getParticipantDocRef(participantPhone, true);

    participantRef
      .get()
      .then(async (participantSnapshot) => {
        if (!participantSnapshot.exists) {
          console.log("Participant not registered");
          let audio = varsHelper.getVar("not-registered-audio");
          await promptHelper.sendPrompt(context, participantPhone, audio, false);
        } else {
          let participantData = participantSnapshot.data();
          console.log(`Participant status is ${participantData["status"]}`);

          if (participantData["status"] === "Consented") {
            // Send consent audio for first timers.
            console.log(`Sending consent message for participantData type: ${participantData["Type"]}`);
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
            console.log("Sending next prompt");
            await handleSendPrompt(context, participantData);
          }

          // If status is completed, send the completion audio.
          // This can either be the state at entry or after {@link handlePromptResponse}.
          if (participantData["status"] === "Completed") {
            console.log("Sending closing message");
            // Send the closing message for completed users.
            let surveyCompletedAudio = varsHelper.getVar("survey-completed-audio");
            await promptHelper.sendPrompt(context, participantPhone, surveyCompletedAudio, false);
          }

          console.log("Saving changes to the participant document in the firestore.");
          participantRef.update(participantData);
        }
      })
      .catch(async (e) => {
        console.log(e);
        console.log("----------------\n Error while fetching the document, not related to the doc existence)");
        await promptHelper.sendPrompt(context, participantPhone, varsHelper.getVar("error-message-audio"), false);
      });
  } catch (initError) {
    console.log(initError);
    console.log("----------------\nThis is probably an error with the helper functions declaration");
    await promptHelper.sendPrompt(context, participantPhone, varsHelper.getVar("error-message-audio"), false);
  }

  return callback(null, event); //? return or not return ?
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
  let lastPromptId = participantData["used_prompts"][participantData["used_prompts"].length - 1];

  if (participantData["type"] === "Transcriber") {
    // Notify the user if they send a message that doesn't contain text.
    if (!body) {
      let msg = varsHelper.getVar("transcription-instructions");
      console.log("User did not include transcription text");
      await promptHelper.sendPrompt(context, participantData["phone"], msg, true);
      return;
    }
    await transcriptionHelper.addTranscription(participantRef, participantData, lastPromptId, body); 
  } else {
    // Notify the user if they send a message that doesn't contain audio.
    if (!mediaUrl) {
      let audio = varsHelper.getVar("voice-note-required-audio");
      console.log("User did not include voice note");
      await promptHelper.sendPrompt(context, participantData["phone"], audio, false);
      return;
    }
    let uploadPath = Runtime.getFunctions()["upload_voice"].path;
    let uploadHelper = require(uploadPath);
    await uploadHelper.uploadVoice(context, lastPromptId, mediaUrl, participantData); //! Come back when dealing with storage
  }

  // Mark completed if this response is the final one, else mark ready.
  participantData["answered"] += 1;
  participantData["status"] =
    participantData["answered"] + 1 >= participantData["number_questions"] ? "Completed" : "Ready";

  console.log(`Set participant status to ${participantData["status"]}`);

  if (participantData["status"] !== "Completed") {
    // Send next prompt.
    console.log("User not yet done. Sending next prompt");
    await handleSendPrompt(context, participantData);
  } else {
    console.log("User has completed all prompts");
  }
}

function updateParticipantAfterResponse(participantData) {
  return;
}

/**
 * Handles the case where the user is ready for the next prompt.
 * @param {object} context contains Twilio client context.
 * @param {object} participantData the current participant data.
 */
async function handleSendPrompt(context, participantData) {
  const promptFetchHelper = require(Runtime.getFunctions()["prompt_fetch_firestore"].path);

  const isTranscription = participantData["type"] === "Transcriber";

  let fetchedPrompt = isTranscription
    ? await transcriptionHelper.getNextPrompt(participantData["transcribed_responses"], participantData["language"])
    : await promptFetchHelper.getNextPrompt(participantData["used_prompts"]);

  let positionString = `${fetchedPrompt["position"]}/${participantData["number_questions"]}`;

  console.log(`Sending ${fetchedPrompt["type"]} prompt ${fetchedPrompt["content"]}`);
  await promptHelper.sendPrompt(context, participantData["phone"], positionString, true);
  await promptHelper.sendPrompt(
    context,
    participantData["phone"],
    fetchedPrompt["content"],
    fetchedPrompt["type"] === "Text"
  );

  let usedIDsArrayName = isTranscription ? "transcribed_responses" : "used_prompts";
  participantData[usedIDsArrayName].push(fetchedPrompt["id"]);
  participantData["status"] = "Prompted";

  console.log(`Setting participant status to "Prompted"`);
}
