// Firebase imports
const { onRequest } = require("firebase-functions/v2/https");
// Various imports
const { get } = require("axios");
const path = require("path");

// Local imports
const logic = require("./logic");

exports.workflow = onRequest(async (req, res) => {
  const verify_token = process.env.VERIFY_WEBHOOK_TOKEN;
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
    const accessToken = process.env.SYSTEM_ADMIN_TOKEN;
    const type = req.body.entry[0].changes[0].value.hasOwnProperty("messages")
      ? req.body.entry[0].changes[0].value.messages[0].type
      : undefined;

    if (type === "text" || type === "button") {
      const participantPhone = req.body.entry[0].changes[0].value.messages[0].from;

      try {
        const message_text =
          type === "text"
            ? req.body.entry[0].changes[0].value.messages[0].text.body
            : req.body.entry[0].changes[0].value.messages[0].button.text;
        await logic.logicHandler(participantPhone, message_text, "");
        res.status(200).send("OK");
      } catch (error) {
        console.error("Unknown text/button error:", error);
        res.sendStatus(500);
      }
    } else if (type === "audio") {
      const participantPhone = req.body.entry[0].changes[0].value.messages[0].from;
      const media_id = req.body.entry[0].changes[0].value.messages[0].audio.id;
      let mediaUrl;

      get("https://graph.facebook.com/v18.0/" + media_id + "/", {
        responseType: "json",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      })
        .then((response) => {
          mediaUrl = response.data.url;
          console.log("URL : ", mediaUrl);

          return logic.logicHandler(participantPhone, "", mediaUrl);
        })
        .then(() => {
          res.status(200).send("OK");
        })
        .catch((error) => {
          console.error("Unknown audio error:", error);
          res.sendStatus(500);
        });
    } else if (typeof type === "undefined") {
      console.log("not a user whatsapp message");
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
