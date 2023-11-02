//NOTE: for queries, always create the query first (into some variable) and then get it
const { FieldPath, FieldValue, DocumentReference } = require("firebase-admin/firestore");
const varsHelper = require(Runtime.getFunctions()["vars_helper"].path);
const firebaseHelper = require(Runtime.getFunctions()["google_firebase_helper"].path);

//? should transcriptions be stored like audio responses ? ie. at {responseID}/{partID} ?
/**
 * Adds a new document to the transcription collection and updates the transcription count for the corresponding language in the response document.
 * @param {DocumentReference} participantRef `DocumentReference` for the transcriber.
 * @param {string} responseId ID of the transcribed response.
 * @param {string} text Full transcription of the voice note response.
 * @return {Promise<void>}
 */
exports.addTranscription = async (participantRef, responseId, text) => {
  try {
    const transcriptionsCol = firebaseHelper.getTranscriptionsCollectionRef();
    const responsesCol = firebaseHelper.getResponsesCollectionRef();
    const maxTranscriptions = parseInt(varsHelper.getVar("transcriptions-per-response"));
    const language = varsHelper.getVar("transcription-language"); //TODO: language overhaul
    const writeBatch = firebaseHelper.getWriteBatch();

    const respRef = responsesCol.doc(responseId);
    const transacRef = transcriptionsCol.doc();

    console.log("Adding transcription '", transacRef.id, "' to document to write batch");
    console.log("Adding response '", respRef.id, "' document update to write batch");

    // We verify if adding this transcription makes the transcription count reach the max amount of transcription set per response per language
    const isFullPromise = respRef
      .get()
      .then((respSnapshot) => {
        count = respSnapshot.get(`transcription_counts.${language}.count`);
        return count + 1 >= maxTranscriptions;
      })
      .catch((e) => {
        console.log("Error while reading transcription count");
        throw e;
      });
    const isFull = await isFullPromise;

    // We want either both or none of the actions to be performed so we use a writeBatch
    await writeBatch
      .set(transacRef, {
        creation_date: new Date().toISOString(),
        transcriber_path: participantRef.path,
        target_language: language,
        text: text,
        status: "New",
        response_path: await responsesCol.doc(responseId).path,
      })
      .update(respRef, {
        [`transcription_counts.${language}.count`]: FieldValue.increment(1),
        [`transcription_counts.${language}.isFull`]: isFull,
      })
      .commit()
      .then()
      .catch((e) => {
        console.log("Error committing the write batch");
        throw e;
      });

    console.log("Write batch successfully committed");
  } catch (error) {
    console.error("The following error occurred:", error);
    throw error;
  }
};

/**
 * Fetches from the responses collection a random, unseen transcription prompt for the current participant.
 * @param {array} transcribedResponses IDs of the transcription prompts the participant already transcribed.
 * @param {string} language Language the prompt has to be transcribed to.
 * @returns {Promise<object>} An object containing the link pointing to the file to transcribe, the file type, the transcription prompt ID and the number of seen transcription prompts including the fetched one.
 */
exports.getNextPrompt = async (transcribedResponses, language) => {
  // The way it works, it generates a random document ID, and then fetch the first prompt whose ID is bigger (alphanumerically).
  // It takes the previous one if no higher prompt is available.
  try {
    const respColRef = firebaseHelper.getResponsesCollectionRef();
    const dummyRespId = respColRef.doc().id;

    let querySnapshot;
    let query;

    if (transcribedResponses.length === 0) {
      //Firestore doens't allow 'not-in' operations on empty arrays
      query = respColRef
        .where(`transcription_counts.${language}.isFull`, "==", false) //TODO: change "isFull" to "is_full" for naming consistency
        .orderBy(FieldPath.documentId(), "asc")
        .startAfter(dummyRespId)
        .limit(1);
      querySnapshot = await query.get();

      if (querySnapshot.empty) {
        query = respColRef
          .where(`transcription_counts.${language}.isFull`, "==", false)
          .orderBy(FieldPath.documentId(), "asc")
          .endBefore(dummyRespId)
          .limitToLast(1);
        querySnapshot = await query.get();
      }
    } else {
      // Firestore doesn't allow several inequality 'where' clauses, hence the need for the is_full variable
      query = respColRef
        .where(`transcription_counts.${language}.isFull`, "==", false)
        .orderBy(FieldPath.documentId(), "asc")
        .where(FieldPath.documentId(), "not-in", transcribedResponses)
        .startAfter(dummyRespId)
        .limit(1);
      querySnapshot = await query.get();

      if (querySnapshot.empty) {
        query = respColRef
          .where(`transcription_counts.${language}.isFull`, "==", false)
          .orderBy(FieldPath.documentId(), "asc")
          .where(FieldPath.documentId(), "not-in", transcribedResponses)
          .endBefore(dummyRespId)
          .limitToLast(1);
        querySnapshot = await query.get();
      }
    }

    if (querySnapshot.empty) {
      console.log("All available responses have been seen by this user. Please add more to continue");
      throw new Error("NoMorePromptError");
    } else {
      const randomResponse = querySnapshot.docs[0];
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
