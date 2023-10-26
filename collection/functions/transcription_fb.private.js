const { FieldPath, FieldValue } = require("firebase-admin/firestore");
const varsHelper = require(Runtime.getFunctions()["vars_helper"].path);
const firebaseHelper = require(Runtime.getFunctions()["google_firebase_helper"].path);

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
    const transcriptionsCol = firebaseHelper.getTranscriptionCollectionRef();
    const responsesCol = firebaseHelper.getResponsesCollectionRef();
    const language = varsHelper.getVar("transcription-language");

    // Add transcription.
    writeBatch = firebaseHelper.getWriteBatch();
    console.log("Adding transcription document to write batch");
    console.log("Adding response document update to write batch");

    docRef = transcriptionsCol.doc();
    await writeBatch
      .set(docRef, {
        creation_date: new Date().toISOString(),
        transcriber_path: participantRef.path,
        target_language: language,
        text: text,
        status: "New",
        response_path: await responsesCol.doc(responseId).path,
      })
      .update(responsesCol.doc(responseId), { [`transcription_counts.${language}`]: FieldValue.increment(1) })
      .commit()
      .then()
      .catch((e) => {
        console.log("Error committing the write batch");
        throw e;
      });

    console.log("Write batch successfully committed");
    participantData["transcribed_responses"].push(docRef.id); // Passed by reference
  } catch (error) {
    console.error("The following error occurred:", error);
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
    const respColRef = firebaseHelper.getResponsesCollectionRef();
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
      console.log("All available prompts have been seen by this user. Please add more to continue");
      throw new Error("NoMorePromptError");
    }
  } catch (error) {
    throw error;
  }
};
