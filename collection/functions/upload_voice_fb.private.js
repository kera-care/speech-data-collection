const fs = require("fs");
const path = require("path");
const got = require("got");
const mm = require("music-metadata");
const fetch = require("node-fetch");
const { DocumentReference } = require("firebase-admin/firestore");
const { Bucket, File } = require("@google-cloud/storage");

const tmp_dir = require("os").tmpdir();
const PUBLIC_DIR = `${tmp_dir}/mms_images`;

const varsHelper = require(Runtime.getFunctions()["vars_helper"].path);
const promptHelper = require(Runtime.getFunctions()["messaging/send_prompt"].path);
const firebaseHelper = require(Runtime.getFunctions()["google_firebase_helper"].path);

// Create a local directory for staging audio files.
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(path.resolve(PUBLIC_DIR));
}

/**
 * Uploads audio file for voice note to Firebase Storage and adds the response to Firestore.
 * @param {*} context Twilio client context.
 * @param {string} promptId ID of the prompt being responded to.
 * @param {string} mediaUrl URL (twilio side) of the audio sent by the user.
 * @param {DocumentReference} participantRef `DocumentReference` for the participant
 * @returns {boolean} Whether the voice note length is too short, in which case we can't proceed.
 */
exports.uploadVoice = async (context, promptId, mediaUrl, participantRef) => {
  const stream = got.stream(mediaUrl);
  let duration = await extractDuration(stream);
  let minLength = parseInt(varsHelper.getVar("min-audio-length-secs"));

  // Notify the user if the message duration is too short.
  if (duration < minLength) {
    return true;
  } else {
    try {
      console.log("Adding response: Uploading to storage");
      const bucket = firebaseHelper.getStorageBucket();

      try {
        var uploadedFile = await uploadToDirectory(promptId, participantRef.id, mediaUrl, bucket);
      } catch (error) {
        console.error("Error uploading file to storage");
        throw error;
      }

      let dlLink;
      try {
        dlLink = await uploadedFile.getSignedUrl({
          action: "read",
          expires: "2099-01-01", // Hardcoded, is there a better way to deal with this ?
        })[0];
      } catch (e) {
        console.error("Error getting the file download link");
        throw e;
      }

      try {
        await firebaseHelper.addResponse(participantRef, promptId, dlLink, duration);
        return false;
      } catch (e) {
        // Can't use a writeBatch for firestore and storage together, so we delete the stored file in case we coulnd't add the response document to firestore
        console.error("Error adding new response. The uploaded audio will be deleted.");
        await uploadedFile.delete();
        throw e;
      }
    } catch (error) {
      console.error("The following error occurred:", error);
      throw error;
    }
  }
};

/**
 * Uploads to the correct directory in the storage bucket.
 * @param {string} promptId ID of the prompt being responded to.
 * @param {string} participantId ID of the responding participant.
 * @param {string} mediaUrl URL of the audio file containing the response.
 * @param {Bucket} bucket GCP storage bucket being saved to.
 * @returns {File} The uploaded google-cloud storage File object.
 */
async function uploadToDirectory(promptId, participantId, mediaUrl, bucket) {
  console.log("Uploading response audio");
  const fullPath = path.resolve(`${PUBLIC_DIR}/${participantId}`);
  const fileStream = fs.createWriteStream(fullPath);
  const destinationPath = "responses/" + promptId + "/" + participantId + ".ogg";

  // First write to a local file because uploading directly to storage from URL is not supported.
  const response = await fetch(mediaUrl);
  response.body.pipe(fileStream);

  // Upload to storage bucketat responses/{promptId}/{participantId}.
  try {
    uploadRep = await bucket.upload(fullPath, {
      destination: destinationPath,
      gzip: true,
      metadata: {
        cacheControl: "public, max-age=31536000",
      },
    });
    return uploadRep[0];
  } catch (e) {
    throw e;
  }
}

/**
 * Extracts duration from an audio stream.
 * @param {*} stream audio stream.
 * @returns Stream length in seconds.
 */
async function extractDuration(stream) {
  let duration = 0;
  try {
    const metadata = await mm.parseStream(stream);
    duration = metadata.format.duration;
  } catch (err) {
    console.error(err);
  }
  return duration;
}
