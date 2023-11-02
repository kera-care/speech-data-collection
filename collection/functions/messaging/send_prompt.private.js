const { backOff } = require("exponential-backoff");

/**
 * Sends a whatsapp message.
 * @param context Twilio client context.
 * @param {string} recipient Recipient phone number including country code, with or without the '+' sign.
 * @param {string} content Text to send or link to download the media, depending on the value of isText.
 * @param {boolean} isText Whether content is plain text or a link to download media.
 * @return {Promise<void>}
 */
exports.sendPrompt = async (context, recipient, content, isText) => {
  try {
    let varsPath = Runtime.getFunctions()["vars_helper"].path;
    let varsHelper = require(varsPath);
    let whatsappNumber = varsHelper.getVar("whatsapp-number");

    let body = isText ? content : "";
    let mediaUrl = isText ? undefined : content;

    let request = {
      to: recipient.startsWith("whatsapp")
        ? recipient
        : `whatsapp:${recipient.startsWith("+") ? recipient : "+" + recipient}`,
      from: `whatsapp:${whatsappNumber}`,
      body: body,
      mediaUrl: mediaUrl,
    };
    console.log(`Sending whatsapp request: ${JSON.stringify(request)}`);
    await backOff(() => context.getTwilioClient().messages.create(request));
    console.log(`Done sending whatsapp request: ${JSON.stringify(request)}\n----------------`);
  } catch (e) {
    console.log(e);
    throw e;
  }
};
