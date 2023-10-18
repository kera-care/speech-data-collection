const {backOff} = require("exponential-backoff");

/**
 * Sends a whatsapp message.
 * @param context Twilio client context.
 * @param recipient {string} Recipient phone number including country code.
 * @param content {string} Text to send or link to download the media, depending on the value of isText.
 * @param isText {boolean} Whether content is plain text or a link to download media.
 * @return {Promise<void>}
 */
exports.sendPrompt = async (context, recipient, content, isText) => {
  let varsPath = Runtime.getFunctions()['vars_helper'].path;
  let varsHelper = require(varsPath);
  let whatsappNumber = varsHelper.getVar("whatsapp-number");

  let body = isText ? content : "";
  let mediaUrl = isText ? "" : content;

  let request = {
    to: recipient.startsWith('whatsapp') ? recipient
        : `whatsapp:${recipient.startsWith("+") ? recipient : "+" + recipient}`,
    from: `whatsapp:${whatsappNumber}`,
    body: body,
    mediaUrl: mediaUrl,
  };
  console.log(`Sending whatsapp request: ${JSON.stringify(request)}`);
  await backOff(() => context.getTwilioClient().messages.create(request));
  console.log(`Done sending whatsapp request: ${JSON.stringify(request)}`);
}