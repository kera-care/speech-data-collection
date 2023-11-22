const fs = require("fs");
const csv = require("csv-parser");
const firebaseHelper = require("./functions/google_firebase_helper.private");
const fileToImport = "./list_health_questions.csv"
const dataArray = [];

fs.createReadStream(fileToImport)
  .pipe(csv())
  .on("data", (row) => {
    dataArray.push(row["Questions"]);
  })
  .on("end", async () => {
    console.log("CSV file successfully processed, adding next to database.");
    addToFB();
  });



async function addToFB() {
  for (let i = 0; i < dataArray.length; i++) {
    await firebaseHelper.addPrompt("text", dataArray[i]);
    
    if (i % 10 === 0){
      const percentage = i/dataArray.length*100
      console.log(`Added prompt ${i}/${dataArray.length} (${percentage.toFixed(2)}%)`)
    }
  }

  console.log("Done adding all prompts");
}
