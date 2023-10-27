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

    const maxTranscriptions = parseInt(varsHelper.getVar("transcriptions-per-response"));
    const dummyRespId =
      transcribedResponses.length > 5
        ? transcribedResponses[Math.floor(Math.random() * transcribedResponses.length)]
        : respColRef.doc().id;

    let querySnapshot = await respColRef
      .orderBy(FieldPath.documentId(), "asc")
      .startAfter(dummyRespId)
      .where(FieldPath.documentId(), "not-in", transcribedResponses)
      .where(`transcription_counts.${language}`, "<", maxTranscriptions)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      querySnapshot = respColRef
        .orderBy(FieldPath.documentId(), "desc")
        .startAfter(dummyRespId)
        .where(FieldPath.documentId(), "not-in", transcribedResponses)
        .where(`transcription_counts.${language}`, "<", maxTranscriptions)
        .limit(1)
        .get();
    }

    if (querySnapshot.empty) {
      console.log("All available responses have been seen by this user. Please add more to continue");
      throw new Error("NoMoreResponsesError");
    } else {
      const randomResponse = querySnapshot.docs[0]
      return {
        type: "audio",
        content: randomResponse.get("storage_link"),
        id: randomResponse.id,
        position: transcribedResponses.length + 1,
      };
    }
  } catch (error) {
    throw error;
  }
};
