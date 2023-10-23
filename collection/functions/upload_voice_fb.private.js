const fs = require("fs");
const path = require("path");
const got = require("got");
const mm = require("music-metadata");
const fetch = require("node-fetch");

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
 * Uploads audio file for voice note to GCP storage bucket.
 * @param {*} context Twilio client context.
 * @param {string} promptId ID of the prompt being responded to.
 * @param {string} mediaUrl URL of the audio sent by the user.
 * @param {string} participantRef
 * @param {object} participantData ID of the responding participant.
 * @returns a bool indicating whether to continue sending prompts. //? why though? it's not used
 */
exports.uploadVoice = async (context, promptId, mediaUrl, participantRef, participantData) => {
  const stream = got.stream(mediaUrl);
  let duration = await extractDuration(stream);

  let minLength = parseInt(varsHelper.getVar("min-audio-length-secs"));

  // Notify the user if the message duration is too short.
  if (duration < minLength) {
    let tooShortAudio = varsHelper.getVar("voice-note-too-short-audio");
    await promptHelper.sendPrompt(context, participantData["phone"], tooShortAudio, false);
    return false;
  } else {
    console.log("Adding response: Uploading to storage");
    // Upload to GCP storage bucket.
    const bucket = await firebaseHelper.getStorageBucket();
    const uploadedFile = await uploadToDirectory(promptId, participantRef.id, mediaUrl, bucket);
    const dlLink = await uploadedFile.getSignedUrl({
      action: "read",
      expires: "2099-01-01",
    });

    // Update Response and Participant spreadsheets.
    await firebaseHelper.addParticipantResponse(participantRef, promptId, dlLink, duration);

    return participantData["status"] !== "Completed";
  }
};

/**
 * Uploads to directory in the storage bucket.
 * @param {string} promptId ID of the prompt being responded to.
 * @param {string} participantId ID of the responding participant.
 * @param {string} mediaUrl URL of the audio file containing the response.
 * @param {Bucket} bucket GCP storage bucket being saved to.
 */
async function uploadToDirectory(promptId, participantId, mediaUrl, bucket) {
  console.log("Uploading response audio");
  const fullPath = path.resolve(`${PUBLIC_DIR}/${participantId}`);
  const fileStream = fs.createWriteStream(fullPath);
  const destinationPath = "responses/" + promptId + "/" + participantId + ".ogg";
  // First write to a local file.
  const response = await fetch(mediaUrl);
  response.body.pipe(fileStream);

  // Upload to storage bucket/{prompt}/{participant}.
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
