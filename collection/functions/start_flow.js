//? improve the vars file with the column names ? so that it's easier to maintain code, and it's default
//NOTE: uploaded files are downloadable till 2099
//TODO: Check callback positioning
  //TODO: (maybe related) how to detect errors on Twilio's side ? eg. the request is sent to Twilio but the user doesn't get the prompt
//TODO: normalize strings (all uppers, all lowers, etc... ?)
//? Idea: store responses with ID "promptID_partID", translations with "promptID_partID_random", transcriptions with "promptID_partID_random_random" ?
//TODO: rework language
//TODO: move addTranscription/Translation to firebase helper

const { DocumentReference, Timestamp } = require("firebase-admin/firestore");
const { ParticipantData } = require("./typedefs.private");

const promptHelper = require(Runtime.getFunctions()["messaging/send_prompt"].path);
const varsHelper = require(Runtime.getFunctions()["vars_helper"].path);
const transcriptionHelper = require(Runtime.getFunctions()["transcription"].path);
const firebaseHelper = require(Runtime.getFunctions()["google_firebase_helper"].path);
/**
 * Main entrypoint for Waxal workflow.
 * @param {object} context Contains Twilio client context.
 * @param {object} event Contains information about the user-triggered event.
 * @param callback Event callback handler.
 * @returns {Promise<void>}
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
      let consentForm = varsHelper.getVar("consent-form");
      let consentText = `Please consider registering for the data collection by submitting a response to the following form : ${consentForm}`;
      await promptHelper.sendPrompt(context, participantPhone, audio, false);
      await promptHelper.sendPrompt(context, participantPhone, consentText, true);
    } else {
      const participantData = participantSnapshot.data();
      console.log(`Participant status is ${participantData["status"]}`);

      if (participantData["status"] === 'No') {
        console.log("Participant did not consent in the form");
        let audio = varsHelper.getVar("not-registered-audio");
        let consentForm = varsHelper.getVar("consent-form");
        let consentText = `You didn't consent in taking part in this data collection, please re-submit here if you still want to take part in the data collection : ${consentForm}`;
        await promptHelper.sendPrompt(context, participantPhone, audio, false);
        await promptHelper.sendPrompt(context, participantPhone, consentText, true);
      }
      
      if (participantData["status"] === "Yes, I consent") {
        // Initialize some fields.
        participantData["status"] = "Consented"
        participantData["creation_date"] = Timestamp.now();
        participantData["read_texts"] = 0;
        participantData["translated_audios"] = 0;
        participantData["transcribed_audios"] = 0;
        participantData["nb_texts_to_read"] = parseInt(participantData["nb_texts_to_read"]);
        participantData["nb_audios_to_translate"] = parseInt(participantData["nb_audios_to_translate"]);
        participantData["nb_audios_to_transcribe"] = parseInt(participantData["nb_audios_to_transcribe"]);
        participantData["read_texts"] = [];
        participantData["translated_audios"] = [];
        participantData["transcribed_audios"] = [];

        //Send consent audio for first timers.
        console.log(`Sending consent message for participantData type: ${participantData["type"]}`);
        if (participantData["type"] === "Reader") {
          let audio = varsHelper.getVar("reading-instructions");
          await promptHelper.sendPrompt(context, participantPhone, audio, false);
        } else if (participantData["type"] === "Translater") {
          
        } else if (participantData["type"] === "Transcriber") {
          let text = varsHelper.getVar("transcription-instructions");
          await promptHelper.sendPrompt(context, participantPhone, text, true);
        } else if (participantData["type"] === "Controller") {

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
      // This can either be the state at entry or after a call to `handlePromptResponse`.
      if (participantData["status"] === "Completed") {
        console.log("Sending the closing message");
        const surveyCompletedAudio = varsHelper.getVar("survey-completed-audio");
        await promptHelper.sendPrompt(context, participantPhone, surveyCompletedAudio, false);
      }

      console.log("Saving changes to the participant document in the firestore.");
      await participantRef.update(participantData);
      console.log("Successfully updated participant data in firestore");
    }
    
    console.log("the end");
    return callback(null, event);
  } catch (e) {
    console.error("The following error occured: ", e);
    await promptHelper.sendPrompt(context, participantPhone, varsHelper.getVar("error-message-audio"), false);
    return callback(e);
  }
};

/**
 * Handles the case where the user has been prompted and is expected to send a response.
 * @param {object} context Contains Twilio client context.
 * @param {string} body Text content of participant message.
 * @param {string} mediaUrl The URL (twilio-side) of the received whatsapp message.
 * @param {DocumentReference} participantRef `DocumentReference` instance of the current participant.
 * @param {ParticipantData} participantData The current participant data.
 * @returns {Promise<void>}
 */
async function handlePromptResponse(context, body, mediaUrl, participantRef, participantData) {
  if (participantData["type"] === "Reader") { //TODO add "Reader" depedencies
    // Notify the user if they send a message that doesn't contain audio.
    if (!mediaUrl) {
      let audio = varsHelper.getVar("voice-note-required-audio");
      console.log("User did not include voice note");
      await promptHelper.sendPrompt(context, participantData["phone"], audio, false);
      return;
    }

    const lastPromptId = participantData["read_texts"][participantData["read_texts"].length - 1];
    const uploadHelper = require(Runtime.getFunctions()["upload_voice"].path);
    tooShort = await uploadHelper.uploadVoice(lastPromptId, mediaUrl, participantRef, participantData["type"]);

    // Mark completed if this response is the final one, else mark ready.
    participantData["read_texts"] += 1;
    participantData["status"] =
      participantData["read_texts"] >= participantData["nb_texts_to_read"] ? "Completed" : "Ready";

    if (tooShort) {
      let tooShortAudio = varsHelper.getVar("voice-note-too-short-audio");
      await promptHelper.sendPrompt(context, participantData["phone"], tooShortAudio, false);
      return;
    }
  } else if (participantData["type"] === "Translater") {
    if (!mediaUrl) {
      let audio = varsHelper.getVar("voice-note-required-audio");
      console.log("User did not include voice note");
      await promptHelper.sendPrompt(context, participantData["phone"], audio, false);
      return;
    }

    const lastAudioId = participantData["used_audios"][participantData["used_audios"].length - 1];
    const uploadHelper = require(Runtime.getFunctions()["upload_voice"].path);
    tooShort = await uploadHelper.uploadVoice(lastAudioId, mediaUrl, participantRef, participantData["type"]);

    // Mark completed if this response is the final one, else mark ready.
    participantData["translated_audios"] += 1;
    participantData["status"] =
      participantData["translated_audios"] >= participantData["nb_audios_to_translate"] ? "Completed" : "Ready";

    if (tooShort) {
      let tooShortAudio = varsHelper.getVar("voice-note-too-short-audio");
      await promptHelper.sendPrompt(context, participantData["phone"], tooShortAudio, false);
      return;
    }

  } else if (participantData["type"] === "Transcriber") {
    // Notify the user if they send a message that doesn't contain text.
    if (!body) {
      const msg = varsHelper.getVar("transcription-instructions");
      console.log("User did not include transcription text");
      await promptHelper.sendPrompt(context, participantData["phone"], msg, true);
      return;
    }

    const lastRespTranscribedId =
      participantData["transcribed_audios"][participantData["transcribed_audios"].length - 1];
    await transcriptionHelper.addTranscription(participantRef, lastRespTranscribedId, body);

    // Mark completed if this response is the final one, else mark ready.
    participantData["transcribed_audios"] += 1;
    participantData["status"] =
      participantData["transcribed_audios"] >= participantData["nb_audios_to_transcribe"] ? "Completed" : "Ready";
  } else if (participantData["type"] === "Controller") {
    //TODO
  }

  console.log(`Participant status now is: ${participantData["status"]}`);
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
 * @param {object} context Contains Twilio client context.
 * @param {ParticipantData} participantData The current participant data.
 * @returns {Promise<void>}
 */
async function handleSendPrompt(context, participantData) {
  const promptFetchHelper = require(Runtime.getFunctions()["prompt_fetch"].path);
  const isTranscription = participantData["type"] === "Transcriber";

  try {
    var fetchedPrompt = isTranscription
      ? await transcriptionHelper.getNextPrompt(participantData["transcribed_audios"], participantData["language"])
      : await promptFetchHelper.getNextPrompt(participantData["read_texts"]);
  } catch (e) {
    if (e.message === "NoMorePromptError") {
      return;
    } else {
      throw e;
    }
  }

  const positionString = isTranscription
    ? `${fetchedPrompt["position"]}/${participantData["nb_audios_to_transcribe"]}`
    : `${fetchedPrompt["position"]}/${participantData["nb_texts_to_read"]}`;

  console.log(`Sending ${fetchedPrompt["type"]} prompt ${fetchedPrompt["id"]}`);
  await promptHelper.sendPrompt(context, participantData["phone"], positionString, true);
  await promptHelper.sendPrompt(
    context,
    participantData["phone"],
    fetchedPrompt["content"], //Either the media URL or the full text
    fetchedPrompt["type"] === "text"
  );

  // Add the prompt/response ID to the used array in participant data.
  const usedIDsArrayName = isTranscription ? "transcribed_audios" : "read_texts";
  participantData[usedIDsArrayName].push(fetchedPrompt["id"]);
  participantData["status"] = "Prompted";

  console.log(`Setting participant status to "Prompted"`);
}
