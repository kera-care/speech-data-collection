const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldPath, FieldValue, Filter } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage")

// Your web app's Firebase configuration //! this is temporary, will then be edited out
const firebaseConfig = {
  apiKey: "AIzaSyBxY9M0NJT0o1UOWMaGWDkG-tV3WjLLytg",
  authDomain: "waxal-kera.firebaseapp.com",
  projectId: "waxal-kera",
  storageBucket: "waxal-kera.appspot.com",
  messagingSenderId: "58578486226",
  appId: "1:58578486226:web:cc5b5524ff63433631fe0b"
};

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
const storage = getStorage(app)


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
