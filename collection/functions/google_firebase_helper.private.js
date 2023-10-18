const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldPath, FieldValue, Filter } = require("firebase-admin/firestore");


const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);



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
