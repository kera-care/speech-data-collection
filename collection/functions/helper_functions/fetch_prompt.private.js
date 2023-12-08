const { FieldPath } = require("firebase-admin/firestore");
const firebaseHelper = require("./firebase.private");

/**
 * Fetches a random, unseen prompt for the current participant.
 * @param {array} usedPrompts IDs of prompts the participant already answered to.
 * @returns {Promise<object>} An object with a random prompt data, the prompt ID and the number of seen prompts including the fetched one.
 */
exports.getNextPrompt = async (usedPrompts) => {
  // The way it works, it generates a random document ID, and then fetch the first prompt whose ID is bigger (alphanumerically). 
  // It takes the previous one if no higher prompt is available.
  
  const promptsRef = await firebaseHelper.getPromptsCollectionRef();
  const prompt = await promptsRef.doc("000").get()

  return {
          ...prompt.data(), // content and type
          id: prompt.id,
          position: usedPrompts.length + 1,
        };

  // try {
  //   const promptsColRef = firebase_helper.getPromptsCollectionRef();
  //   const dummyPromptId = promptsColRef.doc().id;

  //   let querySnapshot;
  //   if (usedPrompts.length === 0) { //Firestore doens't allow 'not-in' operations on empty arrays
  //     query = promptsColRef.orderBy(FieldPath.documentId(), "asc").startAfter(dummyPromptId).limit(1); 
  //     querySnapshot = await query.get();

  //     if (querySnapshot.empty) {
  //       query = promptsColRef.orderBy(FieldPath.documentId(), "asc").endBefore(dummyPromptId).limitToLast(1);
  //       querySnapshot = await query.get();
  //     }
  //   } else {
  //     query = promptsColRef
  //       .orderBy(FieldPath.documentId(), "asc")
  //       .where(FieldPath.documentId(), "not-in", usedPrompts)
  //       .startAfter(dummyPromptId)
  //       .limit(1);
  //     querySnapshot = await query.get();

  //     if (querySnapshot.empty) {
  //       query = promptsColRef
  //         .orderBy(FieldPath.documentId(), "asc")
  //         .where(FieldPath.documentId(), "not-in", usedPrompts)
  //         .endBefore(dummyPromptId)
  //         .limitToLast(1);
  //       querySnapshot = await query.get();
  //     }
  //   }

  //   if (querySnapshot.empty) {
  //     console.log("All available prompts have been seen by this user. Please add more to continue");
  //     throw new Error("NoMorePromptError");
  //   } else {
  //     const randomPrompt = querySnapshot.docs[0];
  //     return {
  //       ...randomPrompt.data(), // content and type
  //       id: randomPrompt.id,
  //       position: usedPrompts.length + 1,
  //     };
  //   }
  // } catch (error) {
  //   throw error;
  // }
};
