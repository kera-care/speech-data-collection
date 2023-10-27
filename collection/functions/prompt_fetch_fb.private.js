const { FieldPath } = require("firebase-admin/firestore");
const firebase_helper = require(Runtime.getFunctions()["google_firebase_helper"].path);
/**
 * Fetches a random, unseen prompt for the given participant.
 * @param {array} usedPrompts Prompts the participant already answered to.
 * @returns An object with a random prompt data, the prompt ID and the number of seen prompts including the fetched one.
 */
exports.getNextPrompt = async (usedPrompts) => {
  try {
    const promptsColRef = firebase_helper.getPromptsCollectionRef();

    const dummyPromptId =
      usedPrompts.length > 5 ? usedPrompts[Math.floor(Math.random() * usedPrompts.length)] : promptsColRef.doc().id;

    let querySnapshot;

    if (usedPrompts.length === 0) {
      querySnapshot = await promptsColRef
        .orderBy(FieldPath.documentId(), "asc")
        .startAfter(dummyPromptId)
        .limit(1)
        .get();
    } else {
      querySnapshot = await promptsColRef
        .orderBy(FieldPath.documentId(), "asc")
        .where(FieldPath.documentId(), "not-in", usedPrompts)
        .startAfter(dummyPromptId)
        .limit(1)
        .get();

      if (querySnapshot.empty) {
        querySnapshot = await promptsColRef
          .orderBy(FieldPath.documentId(), "desc")
          .where(FieldPath.documentId(), "not-in", usedPrompts)
          .startAfter(dummyPromptId)
          .limit(1)
          .get();
      }
    }

    if (querySnapshot.empty) {
      console.log("All available prompts have been seen by this user. Please add more to continue");
      throw new Error("NoMorePromptsError");
    } else {
      const randomPrompt = querySnapshot.docs[0];
      return {
        ...randomPrompt.data(),
        id: randomPrompt.id,
        position: usedPrompts.length + 1,
      };
    }
  } catch (error) {
    throw error; // Propagate the error to the caller
  }
};
