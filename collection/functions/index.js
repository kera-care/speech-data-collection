// Firebase imports
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const serviceAccount = require("./assets/service_account_key.private.json");
// Various imports
const { post, get } = require("axios");
const path = require("path");
require("dotenv").config({ path: path.resolve("..", ".env") });
const fs = require("fs");

// Local imports
const logic = require("./logic");
const varsHelper = require("./helper_functions/vars_helper.private");

exports.formSubmitted = onDocumentCreated("participants/{userID}", (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    console.log("No data associated with the event"); //TODO: return an exception?
    return;
  }

  const participantData = snapshot.data();
  const phone = participantData.phone.replace(/^\D+/g, "");

  //Check this is the correct call. //TODO change the status word
  if (participantData.status !== "Yes, I consent") {
    return;
  } else {
    const verify_token = process.env.SYSTEM_ADMIN_TOKEN;
    const url = "https://graph.facebook.com/v18.0/" + varsHelper.getVar("whatsapp-number-id") + "/messages";
    const message = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "template",
      template: {
        name: "confirm_user_consent",
        language: {
          code: "fr",
        },
        components: [
          {
            type: "header",
            parameters: [
              {
                type: "video",
                video: {
                  link: "https://firebasestorage.googleapis.com/v0/b/waxal-speech-data.appspot.com/o/audio_notifications%2Finstructions_w_logo.mp4?alt=media&token=4ed9a136-fa2c-48f1-aa81-eca1bfd22a33",
                },
              },
            ],
          },
          {
            type: "body",
            parameters: [],
          },
          {
            type: "button",
            sub_type: "quick_reply",
            index: "0",
            parameters: [
              {
                type: "payload",
                payload: "PAYLOAD",
              },
            ],
          },
        ],
      },
    };

    post(url, message, {
      headers: {
        Authorization: `Bearer ${verify_token}`,
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        //console.log("Success:", response);
        console.log("keys: ", Object.keys(response));
        //TODO: Update status to Ready
      })
      .catch((error) => {
        console.error("Error:", error.response.data);
      });
  }
}); 


exports.workflow = onRequest(async (req, res) => {
  const verify_token = process.env.SYSTEM_ADMIN_TOKEN;
  //Required for the meta app to verify the webhook .
  if (req.method == "GET") {
    // Parse params from the webhook verification request
    let mode = req.query["hub.mode"];
    let token = req.query["hub.verify_token"];
    let challenge = req.query["hub.challenge"];

    // Check if a token and mode were sent
    if (mode && token) {
      // Check the mode and token sent are correct
      if (mode === "subscribe" && token === verify_token) {
        // Respond with 200 OK and challenge token from the request
        console.log("WEBHOOK_VERIFIED");
        res.status(200).send(challenge);
      } else {
        // Responds with '403 Forbidden' if verify tokens do not match
        res.sendStatus(403);
      }
    }
    return;
  } else if (req.method === "POST") {    
    const participantPhone = req.body.entry[0].changes[0].value.messages[0].from;
    const type = req.body.entry[0].changes[0].value.messages[0].type;
    console.log("message", req.body.entry[0].changes[0].value.messages[0]);

    if (type === "text" || type === "button") {
      try {
        const message_text =
          type === "text"
            ? req.body.entry[0].changes[0].value.messages[0].text.body
            : req.body.entry[0].changes[0].value.messages[0].button.text;
        await logic.logicHandler(participantPhone, message_text, "");
        res.status(200).send("OK");
      } catch (error) {
        console.error("Unknown error:", error);
        res.sendStatus(500);
      }
    } else if (type === "audio") {
      const media_id = req.body.entry[0].changes[0].value.messages[0].audio.id;
      let mediaUrl;

      get("https://graph.facebook.com/v18.0/" + media_id, {
        responseType: "json",
        headers: {
          Authorization: `Bearer ${verify_token}`,
          "Content-Type": "application/json",
        },
      })
        .then((response) => {
          mediaUrl = response.data.url;
          console.log("URL : ", url);

          return logic.logicHandler(participantPhone, "", mediaUrl);
        })
        .then(() => {
          res.status(200).send("OK");
        })
        .catch((error) => {
          console.error("Unknown error:", error);
          res.sendStatus(500);
        });
    } else {
      console.log("Unsupported type: you should either send an audio or a text."); //TODO: improve the error handling
      res.status(415);
    }
    return;
  } else {
    console.log("The request method is ", req.method);
    res.status(500).send("Not a POST or GET request.");
    return;
  }
});
