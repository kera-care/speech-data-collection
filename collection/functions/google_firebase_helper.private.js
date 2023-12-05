//TODO: Deal with the languages, currently they are defined in the project vars but also in the participant and response data. Normalize it all.
const { credential } = require("firebase-admin");
const { initializeApp } = require("firebase-admin/app");
const {
  getFirestore,
  DocumentReference,
  CollectionReference,
  WriteBatch,
  Timestamp,
} = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { Bucket } = require("@google-cloud/storage");
const serviceAccount = require("../assets/service_account_key.private.json");
const { PromptData, ParticipantData, ResponseData, TranscriptionData } = require("./typedefs.private");

const app = initializeApp({
  credential: credential.cert(serviceAccount),
  projectId: "waxal-speech-data",
  storageBucket: "waxal-speech-data.appspot.com",
});
const db = getFirestore(app);
const storage = getStorage(app);

/**
 * Gets a `CollectionReference` instance that refers to the participant collection.
 * @returns {CollectionReference<ParticipantData>} The `CollectionReference` instance.
 */
exports.getParticipantsCollectionRef = () => {
  try {
    return db.collection("participants");
  } catch (error) {
    throw error;
  }
};

/**
 * Gets a `CollectionReference` instance that refers to the response collection.
 * @returns {CollectionReference<ResponseData>} The `CollectionReference` instance.
 */
exports.getResponsesCollectionRef = () => {
  try {
    return db.collection("responses");
  } catch (error) {
    throw error;
  }
};

/**
 * Gets a `CollectionReference` instance that refers to the prompt collection.
 * @returns {CollectionReference<PromptData>} The `CollectionReference` instance.
 */
exports.getPromptsCollectionRef = () => {
  try {
    return db.collection("prompts");
  } catch (error) {
    throw error;
  }
};

/**
 * Gets a `CollectionReference` instance that refers to the translation collection.
 * @returns {CollectionReference<TranslationData>} The `CollectionReference` instance.
 */
exports.getTranslationsCollectionRef = () => {
  try {
    return db.collection("translations");
  } catch (error) {
    throw error;
  }
};

/**
 * Gets a `CollectionReference` instance that refers to the transcription collection.
 * @returns {CollectionReference<TranscriptionData>} The `CollectionReference` instance.
 */
exports.getTranscriptionsCollectionRef = () => {
  try {
    return db.collection("transcriptions");
  } catch (error) {
    throw error;
  }
};

/**
 * Gets a `DocumentReference` instance that refers to the participant whose message is currently being handled. Asynchronous function if `isParticipantPhone` is set to `true`
 * @param {string} participantId The participant phone number if `isParticipantPhone` is true, the participant document ID otherwise
 * @param {boolean} isParticipantPhone `true` if `participantId` corresponds to the participant phone number, `false` if it's the document ID
 * @returns {Promise<DocumentReference>} A promise with the `DocumentReference`instance.
 */
exports.getParticipantDocRef = async (participantId, isParticipantPhone) => {
  try {
    partColRef = this.getParticipantsCollectionRef();
    if (!isParticipantPhone) {
      return partColRef.doc(participantId);
    } else {
      const phoneNo = participantId.startsWith("+") ? participantId : "+" + participantId;
      const querySnapshot = await partColRef.where("phone", "==", phoneNo).get();

      if (querySnapshot.size === 1) {
        const docRef = querySnapshot.docs[0].ref;
        return docRef;
      } else if (querySnapshot.size === 0) {
        return partColRef.doc(); // Will return 'false' when trying docRef.exists, thus prompting user to register
      } else {
        throw new Error("Multiple documents found with the same phone number");
      }
    }
  } catch (error) {
    throw error;
  }
};
/**
 * Gets a `DocumentReference` instance that refers to the response with the provided ID.
 * @param {string} responseId The document ID of the response we want to retrieve.
 * @returns {DocumentReference} The `DocumentReference` instance.
 */
exports.getResponseDocRef = (responseId) => {
  try {
    return this.getResponsesCollectionRef().doc(responseId);
  } catch (error) {
    throw error;
  }
};

/**
 * Gets a reference to the project default Cloud Storage bucket.
 * @returns {Bucket} A bucket instance as defined in the @google-cloud/storage package.
 */
exports.getStorageBucket = () => {
  try {
    return storage.bucket();
  } catch (e) {
    throw e;
  }
};

/**
 * Creates and gets a write batch, used for performing multiple writes as a single atomic operation.
 * @returns {WriteBatch} The `WriteBatch` instance
 */
exports.getWriteBatch = () => {
  try {
    return db.batch();
  } catch (error) {
    throw error;
  }
};

/**
 * Updates corresponding in the participant document the fields mentioned in `participantData`.
 * @param {DocumentReference} participantRef `DocumentReference`for the participant to update.
 * @param {ParticipantData} participantData Field/value pairs to update in the document.
 * @returns {Promise<void>}
 */
exports.updateParticipantAfterResponse = async (participantRef, participantData) => {
  console.log("Applying change to participant data");
  await participantRef
    .update(participantData)
    .then(() => {
      console.log("Successfully updated participant data in firestore");
    })
    .catch((err) => {
      console.error("Error while updating participant data", err);
    });
};

/** //TODO: Max response count
 * Creates and adds to the Firestore Database data about the response.
 * @param {DocumentReference} participantRef `DocumentReference` of the participant who gave this response.
 * @param {string} promptId Document ID of the prompt corresponding to the response.
 * @param {string} dlLink Link pointing to the file in Firebase Storage.
 * @param {number} duration Duration in seconds of the response.
 * @returns {Promise<Void>}
 */
exports.addResponse = async (participantRef, promptId, dlLink, duration) => {
  const varsHelper = require(Runtime.getFunctions()["vars_helper"].path);
  console.log("Adding response to firestore collection");
  const responsesCol = this.getResponsesCollectionRef();
  const promptCol = this.getPromptsCollectionRef();
  const language = varsHelper.getVar("speech-language");

  await responsesCol
    .add({
      storage_link: dlLink,
      duration: duration,
      language: language,
      participant_path: participantRef,
      prompt_path: promptCol.doc(promptId),
      creation_date: Timestamp.now(),
      transcription_counts: {
        [`${language}`]: {
          count: 0,
          isFull: false,
        },
      },
      status: "New",
    })
    .then()
    .catch((error) => {
      console.error("Error adding response:", error);
    });
};

//? Should a participant have several languages ? In case they can/want to answer in several languages. --> Would need careful implementation to know in what language the responses are
//+ Currently not used.
//! Deprecated
/**
 * Creates and adds to the Firestore Database a new participant data.
 * @param {string} name Participant's name
 * @param {string} phone Participant's phone number with country code but without '+' sign.
 * @param {string} language Participant's language
 * @param {string} status Participant's status
 * @param {number} number_questions Number of prompts the participant will have to respond to.
 * @param {number} number_transcriptions Number of voice notes the participant will have to transcribe.
 * @param {string} type Whether the participant is a `Responder` or a `Transcriber`
 * @returns {Promise<Void>}
 */
exports.addParticipant = async (name, phone, language, status, number_questions, number_transcriptions, type) => {
  partColRef = this.getParticipantsCollectionRef();
  console.log("Adding participant to firestore collection");

  await partColRef
    .add({
      name: name,
      phone: phone,
      language: language,
      type: type,
      status: status,
      number_questions: number_questions,
      number_transcriptions: number_transcriptions,
      answered_questions: 0,
      answered_transcriptions: 0,
      transcribed_responses: [],
      used_prompts: [],
      creation_date: Timestamp.now(),
    })
    .then()
    .catch((error) => {
      console.error("Error adding participant:", error);
    });
};

exports.addPrompt = async (type, content) => {
  promptColRef = this.getPromptsCollectionRef();
  await promptColRef
    .add({
      type: type,
      content: content,
    })
    .then()
    .catch((error) => {
      console.error("Error adding prompts:", error);
    });
};


//TODO Check these 2
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