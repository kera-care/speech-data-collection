const { onDocumentCreated, Change, FirestoreEvent } = require("firebase-functions/v2/firestore");
const varsHelper = require("./helper_functions/vars_helper.private");
const { post } = require("axios");


exports.onFormSubmitted = onDocumentCreated("participants/{userID}", (event) => {
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
      const accessToken = process.env.SYSTEM_ADMIN_TOKEN;
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
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      })
        .then((response) => {
          //console.log("Success:", response);
          //TODO: Update status to Ready
        })
        .catch((error) => {
          console.error("Error:", error.response.data);
        });
    }
  });
  