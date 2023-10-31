const { credential } = require("firebase-admin");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldPath, FieldValue, Filter } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const serviceAccount = require("../assets/service_account_key.private.json");

const app = initializeApp({
  credential: credential.cert(serviceAccount),
  projectId: "waxal-kera",
  storageBucket: "waxal-kera.appspot.com",
});
const db = getFirestore(app);
const storage = getStorage(app);

exports.getParticipantsCollectionRef = () => {
  // console.log(`Fetching participants collection`);
  try {
    return db.collection("participants");
  } catch (error) {
    throw error;
  }
};

exports.getResponsesCollectionRef = () => {
  //console.log(`Fetching responses collection`);
  try {
    return db.collection("responses");
  } catch (error) {
    throw error;
  }
};

exports.getTranscriptionsCollectionRef = () => {
  //console.log(`Fetching transcriptions collection`);
  try {
    return db.collection("transcriptions");
  } catch (error) {
    throw error;
  }
};

exports.getPromptsCollectionRef = () => {
  //console.log(`Fetching prompts collection`);
  try {
    return db.collection("prompts");
  } catch (error) {
    throw error;
  }
};

exports.getParticipantDocRef = async (participantId, isParticipantPhone) => {
  try {
    partColRef = this.getParticipantsCollectionRef();
    if (!isParticipantPhone) {
      return partColRef.doc(participantId);
    } else {
      const querySnapshot = await partColRef.where("phone", "==", participantId).get();

      if (querySnapshot.size === 1) {
        const docRef = querySnapshot.docs[0].ref;
        return docRef;
      } else if (querySnapshot.size === 0) {
        throw new Error("Document not found with the specified phone number");
      } else {
        throw new Error("Multiple documents found with the same phone number");
      }
    }
  } catch (error) {
    throw error;
  }
};

exports.getResponseDocRef = (responseId) => {
  try {
    return this.getResponsesCollectionRef().doc(responseId);
  } catch (error) {
    throw error;
  }
};

exports.getStorageBucket = () => {
  try {
    return storage.bucket();
  } catch (e) {
    throw e;
  }
};

exports.getWriteBatch = () => {
  try {
    return db.batch();
  } catch (error) {
    throw error;
  }
};

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

/**
 * Update Response and Participant tables after uploading media.
 * @param {string} participantRef Reference to the firestore participant item.
 * @param {object} participantData Full participant object.
 * @param {string} promptId ID of the prompt being responded to.
 * @param {string} bucket GCP storage bucket name.
 * @param {number} duration Duration in seconds of the audio response.
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
      participant_path: participantRef.path,
      prompt_path: promptCol.doc(promptId).path,
      response_date: new Date().toISOString(),
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

exports.addParticipant = async (name, phone, language, status, number_questions, number_transcriptions, type) => {
  partColRef = this.getParticipantsCollectionRef();

  part = {
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
    creation_date: new Date().toISOString(),
  };

  await partColRef
    .add(part)
    .then()
    .catch((error) => {
      console.error("Error adding participant:", error);
    });
};
