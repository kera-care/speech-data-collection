# Waxal in a box

## Overview

<figure>
<img src="https://github.com/Waxal-Multilingual/speech-data/blob/main/docs/flow.png?raw=true" alt="Waxal flow diagram">
<figcaption align = "center"><b>Waxal flow diagram</b></figcaption>
</figure>

### Summary

This package contains a JS library that works in conjunction with Twilio to
perform speech data collection using image/text/audio prompts. The instructions below
detail how to set up your own collection pipeline using the code.

## Before you start

1. Sign up for a [Twilio](https://www.twilio.com/) account.
2. Have available a [Google Firebase](https://firebase.google.com/) project
   with the following:
    * A Firestore database ([documentation](https://firebase.google.com/docs/firestore)).
    * A Cloud Storage for Firebase ([documentation](https://firebase.google.com/docs/storage)).
    * The service account key JSON
      file ([documentation](https://console.cloud.google.com/iam-admin/)) for the service account automatically created with your Firebase project.

## Prepare to run your Waxal server

### Install npm

```console
sudo apt-get install npm
```

### Check out the code

```console
git clone https://github.com/kvnfstn/speech-data-firebase.git
cd speech-data/collection
npm install
```

### Set up variables

#### Environment variables (.env)

1. **ACCOUNT_SID=** {Twilio account SID. Can be found in
   the [Twilio Console](https://console.twilio.com/?frameUrl=/console)}
2. **AUTH_TOKEN=** {Twilio auth token. Can be found in
   the [Twilio Console](https://console.twilio.com/?frameUrl=/console)}

#### Flow variables (collection/assets/vars.private.json)

##### Google Form

* **consent-form**: Link toward the consent form users must complete to register to the data collection.

##### Twilio

* **whatsapp-number**: The Twilio Whatsapp
  Sandbox [phone number](https://console.twilio.com/us1/develop/sms/settings/whatsapp-sandbox?frameUrl=%2Fconsole%2Fsms%2Fwhatsapp%2Fsandbox).

##### Audio Prompts

The following variables define the URLs of audio prompts which are intended to
provide participants with information about the collection process. The links
present in those fields are for illustration purposes only but can be used for
testing.

* **not-registered-audio**: An audio file explaining to a user that they are not
  yet registered for the study and providing instructions about how to get
  registered.

* **voice-note-required-audio**: Participants must reply to text prompts with
  voice notes. If they send a message that doesn't contain audio, this audio
  will be sent to them.

* **voice-note-too-short-audio**: This audio is sent to participants who reply
  with a voice note that is shorter than *min-audio-length-secs*.

* **survey-completed-audio**: This audio is played for a user once they have
  completed the full set of questions.

* **consent-audio**: Participants should consent to the usage of their audio
  before joining the study. This audio will restate their consent and give them
  an opportunity to opt out.

* **error-message-audio**: This audio is played for a user if there is a server error (eg. Quota issue). Users should be
  able to continue from where they left off once the error is resolved.

##### Misc

* **min-audio-length-secs**: Minimum length of audio responses.

* **transcriptions-per-response**: Number of transcriptions per response (per
  language).

* **speech-language**: The language of speech data being collected. Currently,
  speech samples can only be collected for a single language per Waxal server.

* **transcription-language**: The language of transcription data being
  collected. Currently, transcription can only be done in 1 language at a time
  per Waxal server.

* **transcription-instructions**: Text instructions written in *
  transcription-language* instructing users to transcribe received audio.

## Run the Waxal Server

Your Waxal server will be the endpoint called by Twilio when participants reply
to your prompts. You will need to deploy your server in a publicly accessible
way such that Twilio can make RPCs to it. You can either deploy locally with
Twilio's built in [ngrok](https://ngrok.com/) server or deploy directly to the
Twilio server.

### Test your server locally

To start a local server run ```npm start``` from ```speech-data/collection```. Once the server is up, take note of the URL of the `start_flow` function. Example below:

```https://xxx.ngrok.io/start_flow```

### Deploy your server to Twilio

To deploy your server to Twilio, run ```npm run deploy```. Take note of the URL
of the `start_flow` function. Example below:

```https://xxx-prod.twil.io/start_flow```

### Set the webhook URI in Twilio

Once you have a public server URL of the `start_flow` function, visit
the [Twilio Whatsapp Sandbox](https://console.twilio.com/us1/develop/sms/settings/whatsapp-sandbox?frameUrl=%2Fconsole%2Fsms%2Fwhatsapp%2Fsandbox)
page and set the *WHEN A MESSAGE COMES IN* field to that URL. After this point,
you should be ready to test your collection flow.

## Run a data collection study

### Prepare your database and storage

In Firestore, create 4 collections : `participants`, `responses`, `prompts` and `transcriptions`. See the [typedef file](functions/typedefs.private.js) for which fields should be added.

In Storage, create 3 folders: `audio-notification`, `prompts` (with subdirectories `audio` and `image`) and `responses`.

### Register a participant and start sending prompts

#### Invite to join your Twilio sandbox

Sandbox users must explicitly opt in to start receiving messages. On
the [Whatsapp Sandbox Page](https://console.twilio.com/us1/develop/sms/settings/whatsapp-sandbox?frameUrl=%2Fconsole%2Fsms%2Fwhatsapp%2Fsandbox)
, look for your sandbox invitation message under the *Sandbox Participants*
section. It should be something like ```join xxx-xxx```.

For convenience, you can create a Whatsapp API URL that will prepolate the
message in the Participant's Whatsapp app. For example, if your code
is ```join waxal-speech```, and your sandbox phone number is ```+14155238886```
you can send them the URL

```
https://wa.me/+14155238886?text=join%20waxal-speech
```

Once users send the message, they will officially be enrolled and can start the
process by sending **"hi"** to the bot.

<figure>
   <img src="https://github.com/Waxal-Multilingual/speech-data/blob/main/docs/image_prompt.png?raw=true" alt="Example image prompt" style="width:200px;"/>
   <figcaption align = "center"><b>Example image prompt</b></figcaption>
</figure>

#### Automate user registration

In a live study, you may want to automatically register users once they have
completed the consent form. To see an example of this, take a look at
the [example form](https://docs.google.com/forms/d/1V7qz6agNkI4zOAQxksi7mMdFFTIy0lTWBGfRvTSbUw8/edit).

We are using [Zapier](https://zapier.com/app/dashboard?shared_zap=018ba4a5-ff46-7c09-9d4c-ed741a78b2ee) to automatically populate our Firestore participants collection from the consent form. Make sure you adapt both to your use case.

With the Google Form you can also set a confirmation message that provides the correct sandbox registration message template (Under [Settings](https://docs.google.com/forms/d/1V7qz6agNkI4zOAQxksi7mMdFFTIy0lTWBGfRvTSbUw8/edit#settings) -> Presentation -> Confirmation Message)

```
Your consent has been recorded. Please follow the following link on your phone to register: https://wa.me/+14155238886?text=join%20[your_sandbox_code]
```

### Find your audio data

After each response is received, it is stored in the firebase storage default bucket under the folder ```{promptId}/{participantId}```. A document is also entered in the `Responses` collection with a link to the stored file and more data.

### Collect transcriptions of your audio data

Once you have concluded the speech collection phase of your study, you can use
Waxal to crowd-source transcriptions via Whatsapp. To add a transcriber, simply
set their *Type* field to "**Transcriber**". 

In this case, the audio files from the `Responses` collections will be sent to `Transcriber` participants in a uniformly distributed fashion. Text transcription responses will be written to the `Transcriptions` collection.  


<figure>
   <img src="https://github.com/Waxal-Multilingual/speech-data/blob/main/docs/audio_prompt.png?raw=true" alt="Example image prompt" style="width:300px;"/>
   <figcaption align = "center"><b>Example transcription prompt</b></figcaption>
</figure>  