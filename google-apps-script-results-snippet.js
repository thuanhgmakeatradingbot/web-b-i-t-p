/*
 * COPY THESE HELPERS INTO THE GOOGLE APPS SCRIPT PROJECT THAT SAVES RESULTS.
 *
 * 1. In doGet(e), before other handling, add:
 *    if (String(e.parameter.action || '') === 'results') {
 *      return handleResultsGet_(e);
 *    }
 *
 * 2. In doPost(e), parse JSON once:
 *    var data = JSON.parse(e.postData.contents || '{}');
 *    if (!resultsAuthorized_(data.secret)) {
 *      return resultsJson_({ status: 'error', message: 'Unauthorized.' });
 *    }
 *    if (data.action === 'deleteResults') {
 *      return handleResultsDelete_(data);
 *    }
 *    Then keep the existing submission-saving code and reuse `data`.
 *
 * 3. In Apps Script > Project Settings > Script Properties, add:
 *    RESULTS_SECRET = the same value configured on Vercel.
 *
 * 4. Deploy a new Web App version after saving.
 */

var RESULTS_SHEET_NAME_ = 'Kết quả';

function resultsJson_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function resultsSecret_() {
  return String(
    PropertiesService.getScriptProperties().getProperty('RESULTS_SECRET') || ''
  );
}

function resultsAuthorized_(provided) {
  var expected = resultsSecret_();
  return expected && String(provided || '') === expected;
}

function resultsSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(RESULTS_SHEET_NAME_) || spreadsheet.getActiveSheet();
}

function handleResultsGet_(e) {
  if (!resultsAuthorized_(e && e.parameter && e.parameter.secret)) {
    return resultsJson_({ status: 'error', message: 'Unauthorized.' });
  }

  var sheet = resultsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return resultsJson_({ status: 'success', rows: [] });
  }

  var values = sheet.getRange(2, 1, lastRow - 1, 15).getDisplayValues();
  var rows = values.map(function(row, index) {
    return {
      rowNumber: index + 2,
      timestamp: row[0],
      name: row[1],
      class: row[2],
      subject: row[3],
      exam: row[4],
      correct: row[5],
      wrong: row[6],
      score: row[7],
      answers: row[8],
      explanations: row[9],
      images: row[10],
      essays: row[11],
      correctAnswers: row[12],
      fullscreenExitCount: row[14] || '0'
    };
  });

  return resultsJson_({ status: 'success', rows: rows });
}

function handleResultsDelete_(data) {
  if (!resultsAuthorized_(data && data.secret)) {
    return resultsJson_({ status: 'error', message: 'Unauthorized.' });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = resultsSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return resultsJson_({ status: 'success', deleted: 0 });
    }

    if (data.scope === 'all') {
      var total = lastRow - 1;
      sheet.deleteRows(2, total);
      return resultsJson_({ status: 'success', deleted: total });
    }

    var seen = {};
    var rows = (data.rowNumbers || [])
      .map(function(value) { return Number(value); })
      .filter(function(rowNumber) {
        if (rowNumber < 2 || rowNumber > lastRow || rowNumber % 1 !== 0 || seen[rowNumber]) {
          return false;
        }
        seen[rowNumber] = true;
        return true;
      })
      .sort(function(a, b) { return b - a; });

    rows.forEach(function(rowNumber) {
      sheet.deleteRow(rowNumber);
    });
    return resultsJson_({ status: 'success', deleted: rows.length });
  } finally {
    lock.releaseLock();
  }
}
