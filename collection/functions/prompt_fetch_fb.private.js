const { FieldPath } = require("firebase-admin/firestore");
const firebase_helper = require(Runtime.getFunctions()["google_firebase_helper"].path);
/**
 * Fetches a random, unseen prompt for the given participant.
 * @param {array} usedPrompts Prompts the participant already answered to.
 * @returns An object with a random prompt data, the prompt ID and the number of seen prompts including the fetched one.
 */
exports.getNextPrompt = async (usedPrompts) => {
  try {
    const promptsColRef = await firebase_helper.getPromptsCollectionRef();
    const unusedPromptsQuerySnapshot = await promptsColRef.where(FieldPath.documentId(), "not-in", usedPrompts).get();

    const matchingPrompts = [];
    unusedPromptsQuerySnapshot.forEach((promptDocSnapshot) => {
      matchingPrompts.push(promptDocSnapshot);
    });

    if (matchingPrompts.length > 0) {
      const randomIndex = Math.floor(Math.random() * matchingPrompts.length);
      const randomPrompt = matchingPrompts[randomIndex];

      return {
        ...randomPrompt.data(),
        id: randomPrompt.id,
        position: usedPrompts.length + 1,
      };
    } else {
      throw new Error("All available prompts have been seen by this user. Please add more to continue");
    }
  } catch (error) {
    throw error; // Propagate the error to the caller
  }
};
