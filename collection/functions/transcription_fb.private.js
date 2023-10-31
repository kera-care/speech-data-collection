//NOTE: for queries, always create the query first (into some variable) and then get it
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
    const transcriptionsCol = firebaseHelper.getTranscriptionsCollectionRef();
    const responsesCol = firebaseHelper.getResponsesCollectionRef();
    const maxTranscriptions = parseInt(varsHelper.getVar("transcriptions-per-response"));
    const language = varsHelper.getVar("transcription-language");

    // Add transcription.
    writeBatch = firebaseHelper.getWriteBatch();
    console.log("Adding transcription document to write batch");
    console.log("Adding response document update to write batch");

    transacRef = transcriptionsCol.doc();
    respRef = responsesCol.doc(responseId)

    const isFullPromise = respColRef
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
    const dummyRespId =
      transcribedResponses.length > 5
        ? transcribedResponses[Math.floor(Math.random() * transcribedResponses.length)]
        : respColRef.doc().id;

    let querySnapshot;
    let query;

    if (transcribedResponses.length === 0) {
      query = respColRef
        .where(`transcription_counts.${language}.isFull`, "==", false) //TODO: change "isFull" to "is_full" for naming consistency
        .orderBy(FieldPath.documentId(), "asc")
        .startAfter(dummyRespId)
        .limit(1);
      querySnapshot = await query.get();

      if (querySnapshot.empty) {
        query = respColRef
          .where(`transcription_counts.${language}.isFull`, "==", false)
          .orderBy(FieldPath.documentId(), "desc")
          .startAfter(dummyRespId)
          .limit(1);
        querySnapshot = await query.get();
      }
    } else {
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
          .orderBy(FieldPath.documentId(), "desc")
          .where(FieldPath.documentId(), "not-in", transcribedResponses)
          .startAfter(dummyRespId)
          .limit(1);
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
