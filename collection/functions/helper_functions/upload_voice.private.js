const fs = require("fs");
const path = require("path");
const mm = require("music-metadata");
const { get } = require("axios");

const { DocumentReference } = require("firebase-admin/firestore");
const { Bucket, File } = require("@google-cloud/storage");

const tmp_dir = require("os").tmpdir();
const PUBLIC_DIR = `${tmp_dir}/mms_images`;

const varsHelper = require("./vars_helper.private");
const promptHelper = require("./send_message.private");
const firebaseHelper = require("./firebase.private");

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
exports.uploadVoice = async (promptId, mediaUrl, participantRef) => {
  const minLength = parseInt(varsHelper.getVar("min-audio-length-secs"));
  let tooShort = false;
  const accessToken = process.env.SYSTEM_ADMIN_TOKEN;

  try {
    const response = await get(mediaUrl, {
      responseType: "arraybuffer", // Set responseType to 'stream' to handle binary data
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    let duration = await extractDuration(response.data);

    // Notify the user if the message duration is too short.
    if (duration < minLength) {
      tooShort = true;
    } else {
      try {
        console.log("Uploading voice note to bucket.")
        const fileBuffer = Buffer.from(response.data, "binary");
        const bucket = firebaseHelper.getStorageBucket();
        const uploadedFile = bucket.file("responses/" + promptId + "/" + participantRef.id + ".ogg");
        //? add gzip & max-age options somewhere around here? "gzip: true, metadata: {cacheControl: "public, max-age=31536000"},"
        uploadedFile.save(fileBuffer, {
          contentType: response.headers["content-type"], // Set the content-type based on the response headers
        });

        let dlLink;
        try {
          // This returns an array with the URL as its first and only element
          urlArray = await uploadedFile.getSignedUrl({
            action: "read",
            expires: "2099-01-01", // Hardcoded, is there a better way to deal with this ?
          });
          dlLink = urlArray[0];
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
        throw error;
      }
    }
  } catch (error) {
    console.error("Error 1:", error);
  }
};

/**
 * Extracts duration from an audio array buffer.
 * @param {*} buffer audio array buffer.
 * @returns audio file length in seconds.
 */
async function extractDuration(buffer) {
  let duration = 0;
  try {
    const metadata = await mm.parseBuffer(buffer);
    duration = metadata.format.duration;
  } catch (err) {
    console.error("extract duration error:", err);
  }
  return duration;
}
