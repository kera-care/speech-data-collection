const { FieldPath } = require("firebase-admin/firestore");
const firebase_helper = require(Runtime.getFunctions()["google_firebase_helper"].path);
/**
 * Fetches a random, unseen prompt for the given participant.
 * @param {array} usedPrompts Prompts the participant already answered to.
 * @returns An object with a random prompt data, the prompt ID and the number of seen prompts including the fetched one.
 */
exports.getNextPrompt = async (usedPrompts) => {
  // Find unused prompts
  const promptsColRef = firebase_helper.getPromptsCollectionRef();
  const unusedPromptsQuery = promptsColRef.where(FieldPath.documentId(), "not-in", usedPrompts);

  unusedPromptsQuery
    .get()
    .then((querySnapshot) => {
      const matchingPrompts = [];
      querySnapshot.forEach((promptDocSnapshot) => {
        matchingPrompts.push(promptDocSnapshot);
      });

      // Pick a random index among the unused prompts.
      if (matchingPrompts.length > 0) {
        const randomIndex = Math.floor(Math.random() * matchingPrompts.length);
        const randomPrompt = matchingPrompts[randomIndex];

        return {
          ...randomPrompt.data(), //type: ... , content: ...
          id: randomPrompt.id,
          position: usedPrompts.size + 1,
        };
      } else {
        throw "All available prompts have been seen by this user. Please add more to continue";
      }
    })
    .catch((error) => {
      console.error(error);
    });
};
