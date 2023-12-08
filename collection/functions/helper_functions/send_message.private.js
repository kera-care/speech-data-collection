const { post } = require("axios")

/**
 * Sends a whatsapp message.
 * @param context Twilio client context.
 * @param {string} recipient Recipient phone number including country code, with or without the '+' sign.
 * @param {string} content Text to send or link to download the media, depending on the value of isText.
 * @param {boolean} isText Whether content is plain text or a link to download media.
 * @return {Promise<void>}
 */
exports.sendMessage = async (recipient, content, isText) => {
  try {
    const varsHelper = require("./vars_helper.private");

    const url = "https://graph.facebook.com/v18.0/" + varsHelper.getVar("whatsapp-number-id") + "/messages";
    let message
    if (isText){
      message = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": recipient,
        "type": "text",
        "text": {
          "body": content
        }
      }
    } else {  //how to know the audio has been correctly downloaded ?
      message = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": recipient,
        "type": "audio",
        "audio": {
          "link" : content
        }
      }
    }

    const verify_token = process.env.SYSTEM_ADMIN_TOKEN;
    console.log(`Sending whatsapp request: ${JSON.stringify(message)}`);
    await post(url, message, {
      headers: {
        Authorization: `Bearer ${verify_token}`,
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        console.log("Success:", response.data);
      })
      .catch((error) => {
        console.error("Error:", error.response.data);
      });
    console.log(`Done sending whatsapp request: ${JSON.stringify(message)}\n----------------`);
  } catch (e) {
    console.log(e);
    throw e;
  }
};



