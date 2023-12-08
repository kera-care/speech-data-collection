const { DocumentReference, Timestamp } = require("firebase-admin/firestore");
const { ParticipantData } = require("./helper_functions/typedefs.private");

const messageHelper = require("./helper_functions/send_message.private");
const varsHelper = require("./helper_functions/vars_helper.private");
const transcriptionHelper = require("./helper_functions/transcription.private");
const firebaseHelper = require("./helper_functions/firebase.private");
const uploadHelper = require("./helper_functions/upload_voice.private");
const promptFetchHelper = require("./helper_functions/fetch_prompt.private");

//TODO: change the logic from "text, url" to "content, isText"
exports.logicHandler = async (participantPhone, text, mediaUrl) => {
  console.log("this is the beginning of logic handling");
  try {
    const participantRef = await firebaseHelper.getParticipantDocRef(participantPhone, true);
    const participantSnapshot = await participantRef.get();

    if (!participantSnapshot.exists) {
      console.log("Participant not registered");
      let audio = varsHelper.getVar("not-registered-audio");
      let consentForm = varsHelper.getVar("consent-form");
      let consentText = `Please consider registering for the data collection by submitting a response to the following form : ${consentForm}`;
      await messageHelper.sendMessage(participantPhone, audio, false);
      await messageHelper.sendMessage(participantPhone, consentText, true);
    } else {
      const participantData = participantSnapshot.data();
      console.log(`Participant status is ${participantData["status"]}`);

      if (participantData["status"] === "No") {
        console.log("Participant did not consent in the form");
        let audio = varsHelper.getVar("not-registered-audio");
        let consentForm = varsHelper.getVar("consent-form");
        let consentText = `You didn't consent in taking part in this data collection, please re-submit here if you still want to take part in the data collection : ${consentForm}`;
        await messageHelper.sendMessage(participantPhone, audio, false);
        await messageHelper.sendMessage(participantPhone, consentText, true);
      }

      if (participantData["status"] === "Yes, I consent") {
        // Initialize some fields.
        participantData["status"] = "Consented";
        participantData["creation_date"] = Timestamp.now();
        participantData["answered_questions"] = 0;
        // participantData["answered_transcriptions"] = 0;
        participantData["number_questions"] = parseInt(participantData["number_questions"]);
        // participantData["number_transcriptions"] = parseInt(participantData["number_transcriptions"]);
        participantData["used_prompts"] = [];
        // participantData["transcribed_responses"] = [];
      }

      if (participantData["status"] === "Prompted") {
        console.log("Processing prompt response");
        // Expect a response for prompted users.
        await handlePromptResponse(text, mediaUrl, participantRef, participantData);
      } else if (participantData["status"] === "Ready" || participantData["status"] === "Consented") {
        // Send the first image for consented and ready users.
        console.log("Sending the next prompt");
        await handleSendPrompt(participantData);
      }

      // If the status is completed, send the completion audio.
      // This can either be the state at entry or after a call to `handlePromptResponse`.
      if (participantData["status"] === "Completed") {
        console.log("Sending the closing message");
        const surveyCompletedAudio = varsHelper.getVar("survey-completed-audio");
        await messageHelper.sendMessage(participantPhone, surveyCompletedAudio, false);
      }

      console.log("Saving changes to the participant document in the firestore.");
      await participantRef.update(participantData);
      console.log("Successfully updated participant data in firestore");
    }

    console.log("the end");
    return;
  } catch (e) {
    console.error("The following error occured: ", e);
    await messageHelper.sendMessage(participantPhone, varsHelper.getVar("error-message-audio"), false);
    return;
  }
};

/**
 * Handles the case where the user has been prompted and is expected to send a response.
 * @param {string} body Text content of participant message.
 * @param {string} mediaUrl The URL (twilio-side) of the received whatsapp message.
 * @param {DocumentReference} participantRef `DocumentReference` instance of the current participant.
 * @param {ParticipantData} participantData The current participant data.
 * @returns {Promise<void>}
 */
async function handlePromptResponse(body, mediaUrl, participantRef, participantData) {
  if (participantData["type"] === "Transcriber") {
    // Notify the user if they send a message that doesn't contain text.
    if (!body) {
      const msg = varsHelper.getVar("transcription-instructions");
      console.log("User did not include transcription text");
      await messageHelper.sendMessage(participantData["phone"], msg, true);
      return;
    }

    const lastRespTranscribedId =
      participantData["transcribed_responses"][participantData["transcribed_responses"].length - 1];
    await transcriptionHelper.addTranscription(participantRef, lastRespTranscribedId, body);

    // Mark completed if this response is the final one, else mark ready.
    participantData["answered_transcriptions"] += 1;
    participantData["status"] =
      participantData["answered_transcriptions"] >= participantData["number_transcriptions"] ? "Completed" : "Ready";
  } else {
    // Notify the user if they send a message that doesn't contain audio.
    if (!mediaUrl) {
      let audio = varsHelper.getVar("voice-note-required-audio");
      console.log("User did not include voice note");
      await messageHelper.sendMessage(participantData["phone"], audio, false);
      return;
    }

    const lastPromptId = participantData["used_prompts"][participantData["used_prompts"].length - 1];
    tooShort = await uploadHelper.uploadVoice(lastPromptId, mediaUrl, participantRef);

    // Mark completed if this response is the final one, else mark ready.
    participantData["answered_questions"] += 1;
    participantData["status"] =
      participantData["answered_questions"] >= participantData["number_questions"] ? "Completed" : "Ready";

    if (tooShort) {
      let tooShortAudio = varsHelper.getVar("voice-note-too-short-audio");
      await messageHelper.sendMessage(participantData["phone"], tooShortAudio, false);
      return;
    }
  }

  console.log(`Participant status now is: ${participantData["status"]}`);
  console.log("Saving changes to the participant document in the firestore.");
  await participantRef.update(participantData); //? may be redundant but better for data persistence I suppose ?
  console.log("Successfully updated participant data in firestore\n");

  if (participantData["status"] !== "Completed") {
    // Send next prompt.
    console.log("User not yet done. Sending next prompt");
    await handleSendPrompt(participantData);
  } else {
    console.log("User has completed all prompts");
  }
}

/**
 * Handles the case where the user is ready for the next prompt.
 * @param {ParticipantData} participantData The current participant data.
 * @returns {Promise<void>}
 */
async function handleSendPrompt(participantData) {
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

  console.log(`Sending ${fetchedPrompt["type"]} prompt ${fetchedPrompt["id"]}`);
  await messageHelper.sendMessage(participantData["phone"], positionString, true);
  await messageHelper.sendMessage(
    participantData["phone"],
    fetchedPrompt["content"], //Either the media URL or the full text
    fetchedPrompt["type"] === "text" //TODO: Revert to using the type directly instead of a boolean zzzz
  );

  // Add the prompt/response ID to the used array in participant data.
  const usedIDsArrayName = isTranscription ? "transcribed_responses" : "used_prompts";
  participantData[usedIDsArrayName].push(fetchedPrompt["id"]);
  participantData["status"] = "Prompted";

  console.log(`Setting participant status to "Prompted"`);
}
