const fs = require('fs');

/**
 * Fetches variable values from {@link assets/vars.private.json}
 * @param {string} varName Name of the var to be fetched.
 * @return {string} Value of the requested variable.
 */
exports.getVar = (varName) => {
  return JSON.parse(
      fs.readFileSync(
          Runtime.getAssets()["/vars.json"].path).toString())[varName];
}
