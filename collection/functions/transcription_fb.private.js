const { FieldPath, FieldValue } = require("firebase-admin/firestore");
const varsHelper = require(Runtime.getFunctions()["vars_helper"].path);
const firebase_helper = require(Runtime.getFunctions()["google_firebase_helper"].path);

/**
 * Add a new transcription row.
 * @param participantRef Ref to the participant document in the firestore DB.
 * @param participantData current participant data
 * @param responseId ID of response being transcribed.
 * @param text Full text of transcription.
 * @return {Promise<void>}
 */
exports.addTranscription = async (participantRef, participantData, responseId, text) => {
  try {
    const transcriptionsCol = await firebase_helper.getTranscriptionCollectionRef();
    const responsesCol = await firebase_helper.getResponsesCollectionRef();
    const language = varsHelper.getVar("transcription-language");

    // Add transcription row.
    console.log("Adding transcription document to database");
    const docRef = await transcriptionsCol.add({
      creation_date: new Date().toISOString(),
      transcriber_path: participantRef.path,
      target_language: language,
      text: text,
      status: "New",
      response_path: await responsesCol.doc(responseId).path,
    });
    console.log("Transcription document successfully added");

    participantData["transcribed_responses"].push(docRef.id); // Passed by reference

    console.log("Updating transcription count in the response document");
    await responsesCol.doc(responseId).update({
      [`transcription_counts.${language}`]: FieldValue.increment(1),
    });
    console.log("Response document successfully updated");
  } catch (error) {
    console.error("An error occurred:", error);
  }
};


/**
 * Fetch the next available prompt, filtering out any that have already been
 * responded to or that have reached their limit of transcriptions.
 * @param participantKey ID of participant to be prompted.
 * @param language The language transcriptions are expected in.
 * @return {Promise<{position: number, content: *, id: *, type: *}>}
 */
exports.getNextPrompt = async (transcribedResponses, language) => {
  try {
    // Identify and get unused prompts.
    const respColRef = await firebase_helper.getResponsesCollectionRef();
    const notTranscribedRespsQuerySnapshot = await respColRef
      .where(FieldPath.documentId(), "not-in", transcribedResponses)
      .where(`transcription_counts.${language}`, "<", parseInt(varsHelper.getVar("transcriptions-per-response")))
      .get();

    const matchingResponses = [];
    notTranscribedRespsQuerySnapshot.forEach((respDocSnapshot) => {
      matchingResponses.push(respDocSnapshot);
    });

    if (matchingResponses.length > 0) {
      const randomIndex = Math.floor(Math.random() * matchingResponses.length);
      const randomResponse = matchingResponses[randomIndex];

      return {
        type: "audio",
        content: randomResponse.get("storage_link"),
        id: randomResponse.id,
        position: transcribedResponses.length + 1,
      };
    } else {
      throw new Error("All available prompts have been seen by this user. Please add more to continue");
    }
  } catch (error) {
    throw error;
  }
};
