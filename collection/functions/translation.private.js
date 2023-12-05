const { FieldPath, FieldValue, DocumentReference, Timestamp } = require("firebase-admin/firestore");
const varsHelper = require(Runtime.getFunctions()["vars_helper"].path);
const firebaseHelper = require(Runtime.getFunctions()["google_firebase_helper"].path);

/**
 * Adds a new document to the trasnlation collection and updates the translation count for the corresponding language in the response document.
 * @param {DocumentReference} participantRef `DocumentReference` for the translater.
 * @param {string} responseId ID of the translated response.
 * @param {string} text Full transcription of the voice note response.
 * @return {Promise<void>}
 */
exports.addTranslation = async (participantRef, responseId, text) => {
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
          creation_date: Timestamp.now(),
          participant_path: participantRef,
          target_language: language,
          text: text,
          status: "New",
          response_path: await responsesCol.doc(responseId),
        })
        .update(respRef, {
          [`transcription_counts.${language}.count`]: FieldValue.increment(1),
          [`transcription_counts.${language}.is_full`]: isFull,
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
 * Fetches from the responses collection a random, unseen translation prompt for the current participant.
 * @param {array} translatedAudios IDs of the translation prompts the participant already translated.
 * @param {string} language Language the prompt has to be translated to.
 * @returns {Promise<object>} An object containing the link pointing to the file to translate, the file type, the translation prompt ID and the number of seen translation prompts including the fetched one.
 */
exports.getNextTranslation = async (translatedAudios, language) => {
    // The way it works, it generates a random document ID, and then fetch the first prompt whose ID is bigger (alphanumerically).
    // It takes the previous one if no higher prompt is available.
    try {
      const respColRef = firebaseHelper.getResponsesCollectionRef();
      const dummyRespId = respColRef.doc().id;
  
      let querySnapshot;
      let query;
  
      if (translatedAudios.length === 0) {
        //Firestore doens't allow 'not-in' operations on empty arrays
        query = respColRef
          .where(`translated_count.${language}.is_full`, "==", false) //TODO: change "isFull" to "is_full" for naming consistency
          .orderBy(FieldPath.documentId(), "asc")
          .startAfter(dummyRespId)
          .limit(1);
        querySnapshot = await query.get();
  
        if (querySnapshot.empty) {
          query = respColRef
            .where(`translated_count.${language}.is_full`, "==", false)
            .orderBy(FieldPath.documentId(), "asc")
            .endBefore(dummyRespId)
            .limitToLast(1);
          querySnapshot = await query.get();
        }
      } else {
        // Firestore doesn't allow several inequality 'where' clauses, hence the need for the is_full variable
        query = respColRef
          .where(`translated_count.${language}.is_full`, "==", false)
          .orderBy(FieldPath.documentId(), "asc")
          .where(FieldPath.documentId(), "not-in", translatedAudios)
          .startAfter(dummyRespId)
          .limit(1);
        querySnapshot = await query.get();
  
        if (querySnapshot.empty) {
          query = respColRef
            .where(`translated_count.${language}.is_full`, "==", false)
            .orderBy(FieldPath.documentId(), "asc")
            .where(FieldPath.documentId(), "not-in", translatedAudios)
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
          position: translatedAudios.length + 1,
        };
      }
    } catch (error) {
      throw error;
    }
  };
  