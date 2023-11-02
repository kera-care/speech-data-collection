const { FieldPath } = require("firebase-admin/firestore");
const firebase_helper = require(Runtime.getFunctions()["google_firebase_helper"].path);

/**
 * Fetches a random, unseen prompt for the current participant.
 * 
 * The random prompt is chosen in the following fashion : 
 * @param {array} usedPrompts Prompts the participant already answered to.
 * @returns {object} An object with a random prompt data, the prompt ID and the number of seen prompts including the fetched one.
 */
exports.getNextPrompt = async (usedPrompts) => {
  try {
    const promptsColRef = firebase_helper.getPromptsCollectionRef();

    const dummyPromptId = promptsColRef.doc().id;

    let querySnapshot;

    if (usedPrompts.length === 0) {
      query = promptsColRef.orderBy(FieldPath.documentId(), "asc").startAfter(dummyPromptId).limit(1);
      querySnapshot = await query.get();

      if (querySnapshot.empty) {
        query = promptsColRef.orderBy(FieldPath.documentId(), "asc").endBefore(dummyPromptId).limitToLast(1);
        querySnapshot = await query.get();
      }
    } else {
      query = promptsColRef
        .orderBy(FieldPath.documentId(), "asc")
        .where(FieldPath.documentId(), "not-in", usedPrompts)
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
        ...randomPrompt.data(),
        id: randomPrompt.id,
        position: usedPrompts.length + 1,
      };
    }
  } catch (error) {
    throw error;
  }
};
