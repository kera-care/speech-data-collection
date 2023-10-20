const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldPath, FieldValue, Filter } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
//+ check how to use dotenv
// Your web app's Firebase configuration //! this is temporary, will then be edited out
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBxY9M0NJT0o1UOWMaGWDkG-tV3WjLLytg",
  authDomain: "waxal-kera.firebaseapp.com",
  projectId: "waxal-kera",
  storageBucket: "waxal-kera.appspot.com",
  messagingSenderId: "58578486226",
  appId: "1:58578486226:web:cc5b5524ff63433631fe0b",
};

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
const storage = getStorage(app);

exports.getParticipantsCollectionRef = async () => {
  // console.log(`Fetching participants collection`);
  return db.collection("participants");
};

exports.getResponsesCollectionRef = async () => {
  //console.log(`Fetching responses collection`);
  return db.collection("responses");
};

exports.getTranscriptionsCollectionRef = async () => {
  //console.log(`Fetching transcriptions collection`);
  return db.collection("transcriptions");
};

exports.getPromptsCollectionRef = async () => {
  //console.log(`Fetching prompts collection`);
  return db.collection("prompts");
};

exports.getParticipantDocRef = async (participantId, isParticipantPhone = false) => {
  try {
    if (!isParticipantPhone) {
      return getParticipantsCollectionRef().doc(participantId);
    } else {
      const querySnapshot = await getParticipantsCollectionRef().where("phone", "==", participantId).get();

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

exports.getResponseDocRef = async (responseId) => {
  try {
    return getResponsesCollectionRef().doc(responseId);
  } catch (error) {
    throw error;
  }
};

exports.getStorageBucket = async () => {
  try {
    return storage.bucket();
  } catch (e) {
    throw e;
  }
};

exports.updateParticipantAfterResponse = async (participantRef, participantData) => {
  console.log("Applying change to participant data");
  participantRef
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
exports.addParticipantResponse = async (participantRef, promptId, dlLink, duration) => {
  const varsHelper = require(Runtime.getFunctions()["vars_helper"].path);
  console.log("Adding response to sheet");
  const responsesCol = await getResponsesCollectionRef();
  const promptCol = await getPromptsCollectionRef();
  const language = varsHelper.getVar("speech-language");

  responsesCol
    .add({
      storage_link: dlLink,
      duration: duration,
      language: language,
      participant_path: participantRef.path,
      prompt_path: promptCol.doc(promptId).path,
      response_date: new Date().toISOString(),
      transcription_counts: {
        [`${language}`]: 1,
      },
      status: "New",
    })
    .then()
    .catch((error) => {
      console.error("Error adding response:", error);
    });
};
