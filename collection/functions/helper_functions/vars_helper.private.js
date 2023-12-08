const fs = require("fs");
const path = require("path");

/**
 * Fetches variable values from {@link assets/vars.private.json}
 * @param {string} varName Name of the var to be fetched.
 * @return {string} Value of the requested variable.
 */
exports.getVar = (varName) => {
  const filePath = path.resolve(__dirname, '../assets/vars.private.json');
  return JSON.parse(fs.readFileSync(filePath).toString())[varName];
};

/**
 * Fetches collection field name values from {@link assets/vars.private.json}.
 * 
 * This function is there in case one would want to use different field names in Firestore.
 * @param {string} collection Name of the collection whose field name we have to retrieve.
 * @param {string} field Name of the field to be fetched.
 * @return {string} Value of the requested variable.
 */
function getFieldName(collection, field) {
  let collections = this.getVar("document-fields");
  return collections[collection][field]
};

/**
 * Fetches a field name from {@link `assets/vars.private.json`} for the participant documents
 * @param {string} field Name of the field to be fetched.
 * @return {string} Value of the requested variable.
 */
exports.getParticipantField = (field) => {
  return getFieldName("participants", field);
};

/**
 * Fetches a field name from {@link `assets/vars.private.json`} for the response documents
 * @param {string} field Name of the field to be fetched.
 * @return {string} Value of the requested variable.
 */
exports.getResponseField = (field) => {
  return getFieldName("responses", field);
};

/**
 * Fetches a field name from {@link `assets/vars.private.json`} for the transcription documents
 * @param {string} field Name of the field to be fetched.
 * @return {string} Value of the requested variable.
 */
exports.getTranscriptionField = (field) => {
  return getFieldName("transcriptions", field);
};

/**
 * Fetches a field name from {@link `assets/vars.private.json`} for the prompt documents
 * @param {string} field Name of the field to be fetched.
 * @return {string} Value of the requested variable.
 */
exports.getPromptField = (field) => {
  return getFieldName("prompts", field);
};