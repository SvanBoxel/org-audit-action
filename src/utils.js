const os = require("os");

function JSONtoCSV(json) {
  var keys = Object.keys(json[0]);
  var csv = keys.join(",") + os.EOL;
  json.forEach(record => {
    keys.forEach((key, i) => {
      csv += record[key];
      if (i != keys.length - 1) {
        csv += ",";
      }
    });
    csv += os.EOL;
  });
  return csv;
}

module.exports = {
  JSONtoCSV
};
