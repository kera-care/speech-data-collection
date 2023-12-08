const fs = require("fs");
const path = require("path");
const got = require("got");
const mm = require("music-metadata");
const fetch = require("node-fetch");
const { finished } = require("node:stream/promises");

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
  const filePath = path.resolve(`${PUBLIC_DIR}/${participantRef.id}/${promptId}.ogg`);
  const stream = fs.createWriteStream(path.resolve(filePath));
  let tooShort = false;
  get(mediaUrl, {
    responseType: "stream", // Set responseType to 'stream' to handle binary data
    headers: {
      Authorization: `Bearer ${verify_token}`,
    },
  })
    .then(async (response) => {
      console.log("Tryna write the stream now");
      // Pipe the response stream to a file
      audioStream = response.data;
      let duration = await extractDuration(audioStream);

      // Notify the user if the message duration is too short.
      if (duration < minLength) {
        tooShort = true;
      } else {
        audioStream.pipe(stream);
        await finished(stream);
        console.log("streaming is done; closing it");
        stream.close();
        console.log("Should be good now");

        try {
          console.log("Adding response: Uploading to storage");
          const bucket = firebaseHelper.getStorageBucket();

          try {
            var uploadedFile = await uploadToRemoteDirectory(promptId, participantRef.id, filePath, bucket);
          } catch (error) {
            console.error("Error uploading file to storage");
            throw error;
          }

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
    })
    .catch((error) => {
      console.error("Error 1:", error);
    });
};

/**
 * Uploads to the correct directory in the storage bucket.
 * @param {string} promptId ID of the prompt being responded to.
 * @param {string} participantId ID of the responding participant.
 * @param {string} mediaUrl URL of the audio file containing the response.
 * @param {Bucket} bucket GCP storage bucket being saved to.
 * @returns {File} The uploaded google-cloud storage File object.
 */
async function uploadToRemoteDirectory(promptId, participantId, filePath, bucket) {
  console.log("Uploading response audio");
  const destinationPath = "responses/" + promptId + "/" + participantId + ".ogg";

  // Upload to storage bucketat responses/{promptId}/{participantId}.
  try {
    uploadRep = await bucket.upload(filePath, {
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
