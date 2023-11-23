const fs = require("fs");
const csv = require("csv-parser");
const firebaseHelper = require("./functions/google_firebase_helper.private");

//addCSVtoFB()
addTXTtoFB()

async function addCSVToFB() {
  const fileToImport = "./list_health_questions.csv"
  const dataArray = [];

  fs.createReadStream(fileToImport)
    .pipe(csv())
    .on("data", (row) => {
      dataArray.push(row["Questions"]);
    })
    .on("end", async () => {
      console.log("CSV file successfully processed, adding next to database.");

      for (let i = 0; i < dataArray.length; i++) {
        await firebaseHelper.addPrompt("text", dataArray[i]);

        if (i % 10 === 0) {
          const percentage = (i / dataArray.length) * 100;
          console.log(`(csv) Added prompt ${i}/${dataArray.length} (${percentage.toFixed(2)}%)`);
        }
      }

      console.log("Done adding all csv prompts");
    });
}

async function addTXTtoFB(){
  const filePath = "./all_peopleAlsoAsk_question_v1.txt";

  const fileContents = fs.readFileSync(filePath, 'utf-8');
  const lines = fileContents.split('\n');

  for (let i = 0; i < lines.length; i++) {
    await firebaseHelper.addPrompt("text", lines[i]);

    if (i % 10 === 0) {
      const percentage = (i / lines.length) * 100;
      console.log(`(txt) Added prompt ${i}/${lines.length} (${percentage.toFixed(2)}%)`);
    }
  }

  console.log("Done adding all txt prompts");

}
