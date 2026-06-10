// scrapers/sheets-auth.js
/**
 * Build a Google auth client from EITHER an inline service-account JSON env var
 * (GOOGLE_SERVICE_ACCOUNT_JSON — used on Railway) OR a key file on disk
 * (credentials/sheets-sa.json — used locally).
 */
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEY_FILE = join(__dirname, '..', 'credentials', 'sheets-sa.json');
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];

export async function getAuthClient() {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline) {
    let credentials;
    try { credentials = JSON.parse(inline); }
    catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is set but is not valid JSON'); }
    const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
    return auth.getClient();
  }
  if (existsSync(KEY_FILE)) {
    const auth = new google.auth.GoogleAuth({ keyFile: KEY_FILE, scopes: SCOPES });
    return auth.getClient();
  }
  throw new Error(
    `No Google credentials: set GOOGLE_SERVICE_ACCOUNT_JSON or place a key file at ${KEY_FILE}`
  );
}
