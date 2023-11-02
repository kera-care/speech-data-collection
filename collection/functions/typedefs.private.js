const { Timestamp, DocumentReference } = require("firebase-admin/firestore");

/**
 * Object containing data about an user
 * @typedef {object} ParticipantData
 * @property {number} answered_questions
 * @property {number} answered_transcriptions
 * @property {Timestamp} creation_date
 * @property {string} language
 * @property {string} name
 * @property {number} number_questions
 * @property {number} number_transcriptions
 * @property {string} phone With the country code but without the '+' sign
 * @property {string} status Consented|Ready|Prompted|Completed //TODO: normalize using lowercase everywhere
 * @property {array<string>} transcribed_responses
 * @property {string} type
 * @property {array<string>} used_prompts
 */

/**
 * Object containing data about a prompt
 * @typedef {object} PromptData
 * @property {string} content Link to the file in firebase storage
 * @property {string} type audio|image|text
 */

/**
 * Object containing data about a response
 * @typedef {object} ResponseData
 * @property {number} duration
 * @property {string} language
 * @property {DocumentReference} participant_path
 * @property {DocumentReference} prompt_path
 * @property {Timestamp} response_date  //TODO: change it to creation_date
 * @property {string} status
 * @property {string} storage_link
 * @property {object} transcription_counts ${language}<count, isFull>
 */

/**
 * Object containing data about a transcritpion
 * @typedef {object} TranscriptionData
 * @property {Timestamp} creation_date
 * @property {DocumentReference} transcriber_path //TODO: change it to participant_path
 * @property {DocumentReference} response_path
 * @property {string} status
 * @property {string} target_language 
 * @property {string} text
 */


