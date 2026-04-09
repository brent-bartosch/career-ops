#!/usr/bin/env node
/**
 * Push hopper postings to Google Sheets.
 *
 * Creates a new sheet or updates an existing one.
 * Preserves user-added columns (Status, Notes, Priority) on re-push.
 *
 * Usage:
 *   node scrapers/push-to-sheets.js                    # Create new sheet
 *   node scrapers/push-to-sheets.js --sheet-id=<ID>    # Update existing sheet
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

loadEnv({ path: join(ROOT, '.env') });

const POSTINGS_FILE = join(ROOT, 'data', 'hopper', 'postings.json');
const SHEET_CONFIG_FILE = join(ROOT, 'data', 'hopper', 'sheet-config.json');

// Columns we push (system-managed)
const SYSTEM_HEADERS = [
  'Intent Score',
  'Company',
  'Title',
  'Archetypes',
  'Platform',
  'Posted',
  'URL',
];

// Columns the user manages (never overwritten)
const USER_HEADERS = [
  'Status',       // thumbs up / thumbs down / reject / applied
  'Priority',     // 1-5 or high/med/low
  'Notes',
];

async function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth.getClient();
}

async function createSheet(sheets, title) {
  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{
        properties: {
          title: 'Postings',
          gridProperties: { frozenRowCount: 1 },
        },
      }],
    },
  });
  return res.data.spreadsheetId;
}

function postingToRow(p) {
  return [
    p.intentScore || 0,
    p.company || '',
    (p.title || '').substring(0, 120),
    (p.archetypes || []).join(' | ') || 'unclassified',
    p.platform || '',
    p.postedDate || '',
    p.url || '',
  ];
}

async function main() {
  const args = process.argv.slice(2);
  const sheetIdArg = args.find(a => a.startsWith('--sheet-id='));

  // Load postings
  if (!existsSync(POSTINGS_FILE)) {
    console.error('No postings found. Run npm run scan first.');
    process.exit(1);
  }
  const postings = JSON.parse(readFileSync(POSTINGS_FILE, 'utf-8'));
  console.log(`Loaded ${postings.length} postings from hopper`);

  // Auth
  const authClient = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  // Get or create spreadsheet
  let spreadsheetId;

  if (sheetIdArg) {
    spreadsheetId = sheetIdArg.split('=')[1];
  } else if (existsSync(SHEET_CONFIG_FILE)) {
    const config = JSON.parse(readFileSync(SHEET_CONFIG_FILE, 'utf-8'));
    spreadsheetId = config.spreadsheetId;
    console.log(`Using existing sheet: ${spreadsheetId}`);
  } else {
    // Create new sheet
    const title = `Career-Ops Hopper — ${new Date().toISOString().split('T')[0]}`;
    spreadsheetId = await createSheet(sheets, title);
    console.log(`Created new sheet: ${spreadsheetId}`);

    // Save config
    writeFileSync(SHEET_CONFIG_FILE, JSON.stringify({ spreadsheetId }, null, 2));
  }

  // Read existing user data (Status, Priority, Notes) keyed by URL
  const userData = {};
  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Postings!A:J',
    });
    const rows = existing.data.values || [];
    if (rows.length > 1) {
      const headers = rows[0];
      const urlIdx = headers.indexOf('URL');
      const statusIdx = headers.indexOf('Status');
      const priorityIdx = headers.indexOf('Priority');
      const notesIdx = headers.indexOf('Notes');

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const url = row[urlIdx];
        if (url) {
          userData[url] = {
            status: statusIdx >= 0 ? (row[statusIdx] || '') : '',
            priority: priorityIdx >= 0 ? (row[priorityIdx] || '') : '',
            notes: notesIdx >= 0 ? (row[notesIdx] || '') : '',
          };
        }
      }
      console.log(`Preserved user data for ${Object.keys(userData).length} postings`);
    }
  } catch {
    // Sheet is empty or doesn't exist yet — that's fine
  }

  // Build rows: system data + preserved user data
  const allHeaders = [...SYSTEM_HEADERS, ...USER_HEADERS];
  const dataRows = postings.map(p => {
    const systemRow = postingToRow(p);
    const existing = userData[p.url] || {};
    return [
      ...systemRow,
      existing.status || '',
      existing.priority || '',
      existing.notes || '',
    ];
  });

  // Clear and write
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: 'Postings!A:J',
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Postings!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [allHeaders, ...dataRows],
    },
  });

  // Format: bold header row, auto-resize, URL column as hyperlinks
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Bold header
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
              },
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        // Auto-resize columns
        {
          autoResizeDimensions: {
            dimensions: { sheetId: 0, dimension: 'COLUMNS', startIndex: 0, endIndex: 10 },
          },
        },
        // Add data validation for Status column (dropdown)
        {
          setDataValidation: {
            range: { sheetId: 0, startRowIndex: 1, startColumnIndex: 7, endColumnIndex: 8 },
            rule: {
              condition: {
                type: 'ONE_OF_LIST',
                values: [
                  { userEnteredValue: '' },
                  { userEnteredValue: 'interested' },
                  { userEnteredValue: 'applied' },
                  { userEnteredValue: 'rejected' },
                  { userEnteredValue: 'interviewing' },
                ],
              },
              showCustomUi: true,
              strict: false,
            },
          },
        },
        // Add data validation for Priority column (dropdown)
        {
          setDataValidation: {
            range: { sheetId: 0, startRowIndex: 1, startColumnIndex: 8, endColumnIndex: 9 },
            rule: {
              condition: {
                type: 'ONE_OF_LIST',
                values: [
                  { userEnteredValue: '' },
                  { userEnteredValue: 'high' },
                  { userEnteredValue: 'medium' },
                  { userEnteredValue: 'low' },
                ],
              },
              showCustomUi: true,
              strict: false,
            },
          },
        },
      ],
    },
  });

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  console.log(`\nDone! ${dataRows.length} postings pushed.`);
  console.log(`Sheet: ${sheetUrl}`);
}

main().catch(err => {
  console.error('Failed:', err.message);
  if (err.message.includes('Could not load the default credentials')) {
    console.error('\nRun: gcloud auth application-default login');
  }
  process.exit(1);
});
