// ============================================================
// Google Apps Script — paste this into Extensions > Apps Script
// in your Google Sheet, then deploy as a Web App.
// ============================================================

const SHEET_NAME = 'Sheet1';

function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();

  const scores = data
    .map(row => ({ name: row[0], score: row[1], date: row[2] }))
    .filter(r => r.name && r.score)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return ContentService
    .createTextOutput(JSON.stringify({ scores }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { name, score } = body;

    if (!name || score === undefined) {
      return ContentService
        .createTextOutput(JSON.stringify({ error: 'Missing name or score' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    sheet.appendRow([name, score, new Date().toISOString()]);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
