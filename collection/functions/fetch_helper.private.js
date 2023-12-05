const { FieldPath } = require("firebase-admin/firestore");
const firebaseHelper = require(Runtime.getFunctions()["google_firebase_helper"].path);

//TODO: the getters could use some modularity, they're all similar enough


/**
 * Fetches a random, unseen prompt for the current participant.
 * @param {array} usedPrompts IDs of prompts the participant already answered to.
 * @returns {Promise<object>} An object with a random prompt data, the prompt ID and the number of seen prompts including the fetched one.
 */
exports.getNextPrompt = async (usedPrompts) => {
  // The way it works, it generates a random document ID, and then fetch the first prompt whose ID is bigger (alphanumerically). 
  // It takes the previous one if no higher prompt is available.
  try {
    const promptsColRef = firebaseHelper.getPromptsCollectionRef();
    const dummyPromptId = promptsColRef.doc().id;

    let querySnapshot;
    if (usedPrompts.length === 0) { //Firestore doens't allow 'not-in' operations on empty arrays
      query = promptsColRef.orderBy(FieldPath.documentId(), "asc").startAfter(dummyPromptId).limit(1); 
      querySnapshot = await query.get();

      if (querySnapshot.empty) {
        query = promptsColRef.orderBy(FieldPath.documentId(), "asc").endBefore(dummyPromptId).limitToLast(1);
        querySnapshot = await query.get();
      }
    } else {
      query = promptsColRef
        .orderBy(FieldPath.documentId(), "asc")
        .where(FieldPath.documentId(), "not-in", usedPrompts) //TODO: add a check on max amount of readings for each prompt
        .startAfter(dummyPromptId)
        .limit(1);
      querySnapshot = await query.get();

      if (querySnapshot.empty) {
        query = promptsColRef
          .orderBy(FieldPath.documentId(), "asc")
          .where(FieldPath.documentId(), "not-in", usedPrompts)
          .endBefore(dummyPromptId)
          .limitToLast(1);
        querySnapshot = await query.get();
      }
    }

    if (querySnapshot.empty) {
      console.log("All available prompts have been seen by this user. Please add more to continue");
      throw new Error("NoMorePromptError");
    } else {
      const randomPrompt = querySnapshot.docs[0];
      return {
        ...randomPrompt.data(), // content and type
        id: randomPrompt.id,
        position: usedPrompts.length + 1, //TODO: this should use the answered_whatever field instead 
      };
    }
  } catch (error) {
    throw error;
  }
};


/**
 * Fetches from the responses collection a random, unseen translation prompt for the current participant.
 * @param {array} translatedAudios IDs of the translation prompts the participant already translated.
 * @param {string} languages Languages the response has to be translated to.
 * @returns {Promise<object>} An object containing the link pointing to the file to translate, the file type, the response ID and the number of seen translation prompts including the fetched one.
 */
exports.getNextResponse = async (translatedAudios, languages) => {
  // The way it works, it generates a random document ID, and then fetch the first response whose ID is bigger (alphanumerically).
  // It takes the previous one if no higher prompt is available.
  try {
    const respColRef = firebaseHelper.getResponsesCollectionRef();
    const dummyRespId = respColRef.doc().id;
    const source_language = languages.filter(item => item !== 'francais')[Math.floor(Math.random() * languages.length)]


    let querySnapshot;
    let query;

    if (translatedAudios.length === 0) {
      //Firestore doens't allow 'not-in' operations on empty arrays
      query = respColRef
        .where(`translation_counts.${source_language}.is_full`, "==", false)
        .orderBy(FieldPath.documentId(), "asc")
        .startAfter(dummyRespId)
        .limit(1);
      querySnapshot = await query.get();

      if (querySnapshot.empty) {
        query = respColRef
          .where(`translation_counts.${source_language}.is_full`, "==", false)
          .orderBy(FieldPath.documentId(), "asc")
          .endBefore(dummyRespId)
          .limitToLast(1);
        querySnapshot = await query.get();
      }
    } else {
      // Firestore doesn't allow several inequality 'where' clauses, hence the need for the is_full variable
      query = respColRef
        .where(`translation_counts.${source_language}.is_full`, "==", false)
        .orderBy(FieldPath.documentId(), "asc")
        .where(FieldPath.documentId(), "not-in", translatedAudios)
        .startAfter(dummyRespId)
        .limit(1);
      querySnapshot = await query.get();

      if (querySnapshot.empty) {
        query = respColRef
          .where(`translation_counts.${source_language}.is_full`, "==", false)
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

/**
 * Fetches from the responses collection a random, unseen transcription prompt for the current participant.
 * @param {array} transcribedResponses IDs of the transcription prompts the participant already transcribed.
 * @param {string} language Language the prompt has to be transcribed to.
 * @returns {Promise<object>} An object containing the link pointing to the file to transcribe, the file type, the transcription prompt ID and the number of seen transcription prompts including the fetched one.
 */
exports.getNextTranslation = async (transcribedResponses, language) => {
  // The way it works, it generates a random document ID, and then fetch the first prompt whose ID is bigger (alphanumerically).
  // It takes the previous one if no higher prompt is available.
  try {
    const translColRef = firebaseHelper.getTranslationsCollectionRef();
    const dummyTranslId = translColRef.doc().id;

    let querySnapshot;
    let query;

    if (transcribedResponses.length === 0) {
      //Firestore doens't allow 'not-in' operations on empty arrays
      query = translColRef
        .where(`transcription_counts.is_full`, "==", false) 
        .orderBy(FieldPath.documentId(), "asc")
        .startAfter(dummyTranslId)
        .limit(1);
      querySnapshot = await query.get();

      if (querySnapshot.empty) {
        query = translColRef
          .where(`transcription_counts.is_full`, "==", false)
          .orderBy(FieldPath.documentId(), "asc")
          .endBefore(dummyTranslId)
          .limitToLast(1);
        querySnapshot = await query.get();
      }
    } else {
      // Firestore doesn't allow several inequality 'where' clauses, hence the need for the is_full variable
      query = translColRef
        .where(`transcription_counts.is_full`, "==", false)
        .orderBy(FieldPath.documentId(), "asc")
        .where(FieldPath.documentId(), "not-in", transcribedResponses)
        .startAfter(dummyTranslId)
        .limit(1);
      querySnapshot = await query.get();

      if (querySnapshot.empty) {
        query = translColRef
          .where(`transcription_counts.is_full`, "==", false)
          .orderBy(FieldPath.documentId(), "asc")
          .where(FieldPath.documentId(), "not-in", transcribedResponses)
          .endBefore(dummyTranslId)
          .limitToLast(1);
        querySnapshot = await query.get();
      }
    }

    if (querySnapshot.empty) {
      console.log("All available responses have been seen by this user. Please add more to continue");
      throw new Error("NoMorePromptError");
    } else {
      const randomTranslation = querySnapshot.docs[0];
      return {
        type: "audio",
        content: randomTranslation.get("storage_link"),
        id: randomTranslation.id,
        position: transcribedResponses.length + 1,
      };
    }
  } catch (error) {
    throw error;
  }
};


exports.getNextControlPair = async () => {
  //TODO
}