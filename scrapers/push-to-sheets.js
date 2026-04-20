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
import { parsePostedDate } from '../scoring/parse-posted-date.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

loadEnv({ path: join(ROOT, '.env') });

const POSTINGS_FILE = join(ROOT, 'data', 'hopper', 'postings.json');
const SHEET_CONFIG_FILE = join(ROOT, 'data', 'hopper', 'sheet-config.json');
const SERVICE_ACCOUNT_KEY = join(ROOT, 'credentials', 'sheets-sa.json');

// Columns we push (system-managed)
const SYSTEM_HEADERS = [
  'Posted Date',      // YYYY-MM-DD — sortable
  'Posted',           // original relative string ("3 days ago")
  'Fit Score',        // 0-100 from LLM classifier
  'Role Fit',         // good / partial / poor
  'Employment Type',  // full_time / contract / fractional / contract_to_hire
  'Duration',         // "6 months" / "ongoing" / etc.
  'Intent Score',     // keyword-based intent score
  'Company',
  'Title',
  'Country',          // US / UK / Remote / Unknown
  'Location',         // raw location signal from JD
  'Archetypes',
  'Platform',
  'Fit Reason',
  'Deal Breakers',
  'URL',
];

// Columns the user manages (never overwritten)
const USER_HEADERS = [
  'Status',       // thumbs up / thumbs down / reject / applied
  'Priority',     // 1-5 or high/med/low
  'Notes',
];

// Countries allowed to be pushed to the sheet (everything else filtered out)
const ALLOWED_COUNTRIES = new Set(['US', 'Remote', 'Unknown']);

async function getAuthClient() {
  if (!existsSync(SERVICE_ACCOUNT_KEY)) {
    throw new Error(
      `Service account key not found at ${SERVICE_ACCOUNT_KEY}. ` +
      `Download from GCP console and save there.`
    );
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_KEY,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
  return auth.getClient();
}

async function createSheet(sheets, drive, title, shareWithEmail) {
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
  const spreadsheetId = res.data.spreadsheetId;

  // Share with user as owner (transfers ownership)
  if (shareWithEmail) {
    await drive.permissions.create({
      fileId: spreadsheetId,
      sendNotificationEmail: false,
      requestBody: {
        type: 'user',
        role: 'writer',
        emailAddress: shareWithEmail,
      },
    });
    console.log(`Shared with ${shareWithEmail}`);
  }

  return spreadsheetId;
}

function postingToRow(p) {
  const postedISO = p.postedDateISO || parsePostedDate(p.postedDate) || '';
  return [
    postedISO,
    p.postedDate || '',
    p.fitScore ?? '',
    p.roleFit || '',
    p.employmentType || '',
    p.duration || '',
    p.intentScore || 0,
    p.company || '',
    (p.title || '').substring(0, 120),
    p.country || '',
    p.location || '',
    (p.archetypes || []).join(' | ') || 'unclassified',
    p.platform || '',
    p.fitReason || '',
    (p.dealBreakers || []).join(', '),
    p.url || '',
  ];
}

/**
 * Filter postings for the sheet.
 * Keep: US, Remote (no country specified), Unknown (no classification yet).
 * Drop: UK, France, Germany, Ireland, Canada, etc.
 */
function filterForSheet(postings) {
  return postings.filter(p => {
    // If classified, enforce allowed country list
    if (p.country) return ALLOWED_COUNTRIES.has(p.country);
    // If not yet classified, include (Unknown bucket)
    return true;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const sheetIdArg = args.find(a => a.startsWith('--sheet-id='));

  // Load postings
  if (!existsSync(POSTINGS_FILE)) {
    console.error('No postings found. Run npm run scan first.');
    process.exit(1);
  }
  const allPostings = JSON.parse(readFileSync(POSTINGS_FILE, 'utf-8'));
  const postings = filterForSheet(allPostings);
  console.log(`Loaded ${allPostings.length} postings from hopper`);
  console.log(`After country filter (US/Remote/Unknown): ${postings.length}`);

  // Auth
  const authClient = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const drive = google.drive({ version: 'v3', auth: authClient });
  const userEmail = process.env.SHEETS_USER_EMAIL || 'brent.bartosch@gmail.com';

  // Get or create spreadsheet
  let spreadsheetId;

  if (sheetIdArg) {
    spreadsheetId = sheetIdArg.split('=')[1];
  } else if (existsSync(SHEET_CONFIG_FILE)) {
    const sheetConfig = JSON.parse(readFileSync(SHEET_CONFIG_FILE, 'utf-8'));
    spreadsheetId = sheetConfig.spreadsheetId;
    console.log(`Using existing sheet: ${spreadsheetId}`);
  } else {
    // Create new sheet
    const title = `Career-Ops Hopper — ${new Date().toISOString().split('T')[0]}`;
    spreadsheetId = await createSheet(sheets, drive, title, userEmail);
    console.log(`Created new sheet: ${spreadsheetId}`);

    // Save config
    writeFileSync(SHEET_CONFIG_FILE, JSON.stringify({ spreadsheetId }, null, 2));
  }

  // Get the first sheet tab name and ID (works whether it's "Sheet1", "Postings", or anything)
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const firstSheet = meta.data.sheets[0];
  const sheetName = firstSheet.properties.title;
  const sheetTabId = firstSheet.properties.sheetId;
  const totalCols = SYSTEM_HEADERS.length + USER_HEADERS.length;
  const lastColLetter = String.fromCharCode(65 + totalCols - 1); // A + n-1
  const range = `${sheetName}!A:${lastColLetter}`;

  // Read existing user data (Status, Priority, Notes) keyed by URL
  const userData = {};
  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
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
    range,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
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
            range: { sheetId: sheetTabId, startRowIndex: 0, endRowIndex: 1 },
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
            dimensions: { sheetId: sheetTabId, dimension: 'COLUMNS', startIndex: 0, endIndex: totalCols },
          },
        },
        // Add data validation for Status column (dropdown)
        {
          setDataValidation: {
            range: {
              sheetId: sheetTabId,
              startRowIndex: 1,
              startColumnIndex: SYSTEM_HEADERS.length,
              endColumnIndex: SYSTEM_HEADERS.length + 1,
            },
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
            range: {
              sheetId: sheetTabId,
              startRowIndex: 1,
              startColumnIndex: SYSTEM_HEADERS.length + 1,
              endColumnIndex: SYSTEM_HEADERS.length + 2,
            },
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
