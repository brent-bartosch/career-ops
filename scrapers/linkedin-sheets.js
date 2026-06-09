// scrapers/linkedin-sheets.js
/**
 * Visual Google Sheet writer for the LinkedIn GTM scan.
 *
 * - Main tab: one row per posting, with =IMAGE logos and =HYPERLINK title/company/apply.
 * - Dedup: by LinkedIn Job ID read from the main tab (the Sheet is source of truth).
 * - `_runs` tab: the snapshot ledger store (see snapshot-ledger.js).
 *
 * Pure helpers (headers, formula builders, row builder, dedup) are exported and
 * unit-tested. The I/O functions (read ids, append rows, ledger store) take an
 * injected googleapis `sheets` client.
 */

export const MAIN_TAB = 'Postings';
export const RUNS_TAB = '_runs';

export const MAIN_HEADERS = [
  'Logo', 'Posted', 'Posted (raw)', 'Company', 'Title', 'Location',
  'Type', 'Salary', 'Applicants', 'Seniority', 'Archetypes', 'Intent',
  'Fit', 'Role Fit', 'Fit Reason', 'Apply', 'Recruiter',
  'Status', 'Priority', 'Notes',          // user columns (preserved)
  'Job ID', 'Snapshot ID', 'Found At',    // provenance
];

export const RUNS_HEADERS = [
  'trigger_time', 'inputs_summary', 'snapshot_id', 'status', 'rows_captured', 'error',
];

export const USER_COLUMNS = ['Status', 'Priority', 'Notes'];

/** =IMAGE(url) or '' when no url. */
export function sheetImage(url) {
  if (!url) return '';
  return `=IMAGE("${String(url).replace(/"/g, '""')}")`;
}

/** =HYPERLINK(url,label); plain label when no url. */
export function sheetHyperlink(url, label) {
  const safeLabel = String(label ?? '').replace(/"/g, '""');
  if (!url) return safeLabel;
  return `=HYPERLINK("${String(url).replace(/"/g, '""')}","${safeLabel}")`;
}

/** Build a sheet row aligned to MAIN_HEADERS. User columns left blank (merged on write). */
export function postingToRow(p) {
  const byHeader = {
    'Logo': sheetImage(p.logo),
    'Posted': p.postedDateISO || p.postedDate || '',
    'Posted (raw)': p.postedRaw || '',
    'Company': sheetHyperlink(p.companyUrl, p.company),
    'Title': sheetHyperlink(p.url, p.title),
    'Location': p.location || '',
    'Type': p.employmentType || '',
    'Salary': p.salary || '',
    'Applicants': p.applicants ?? '',
    'Seniority': p.seniority || '',
    'Archetypes': (p.archetypes || []).join(' | '),
    'Intent': p.intentScore ?? '',
    'Fit': p.fitScore ?? '',
    'Role Fit': p.roleFit || '',
    'Fit Reason': p.fitReason || '',
    'Apply': sheetHyperlink(p.applyLink, 'Apply'),
    'Recruiter': sheetHyperlink(p.posterUrl, p.posterName),
    'Status': '', 'Priority': '', 'Notes': '',
    'Job ID': p.jobId || '',
    'Snapshot ID': p.snapshotId || '',
    'Found At': p.foundAt || '',
  };
  return MAIN_HEADERS.map(h => byHeader[h] ?? '');
}

/** Keep only postings whose jobId is new (vs the sheet AND within the batch). */
export function dedupeNew(postings, existingIds) {
  const seen = new Set(existingIds);
  const fresh = [];
  for (const p of postings) {
    if (!p.jobId || seen.has(p.jobId)) continue;
    seen.add(p.jobId);
    fresh.push(p);
  }
  return fresh;
}

// --- Sheets I/O (injected googleapis `sheets` client) ---

/** Ensure a tab exists with the given headers; create + header it if missing. */
export async function ensureTab(sheets, spreadsheetId, title, headers) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const found = meta.data.sheets.find(s => s.properties.title === title);
  if (!found) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  }
}

/** Read the set of existing Job IDs from the main tab. */
export async function readExistingJobIds(sheets, spreadsheetId) {
  const ids = new Set();
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${MAIN_TAB}!A:${colLetter(MAIN_HEADERS.length)}` });
    const rows = res.data.values || [];
    if (rows.length < 2) return ids;
    const idIdx = rows[0].indexOf('Job ID');
    for (let i = 1; i < rows.length; i++) {
      const v = rows[i][idIdx];
      if (v) ids.add(String(v));
    }
  } catch { /* tab empty/missing */ }
  return ids;
}

/** Append posting rows to the bottom of the main tab (USER_ENTERED so formulas render). */
export async function appendPostings(sheets, spreadsheetId, postings) {
  if (!postings.length) return 0;
  const values = postings.map(postingToRow);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${MAIN_TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
  return values.length;
}

/** A ledger store backed by the _runs tab, matching snapshot-ledger.js's interface. */
export function makeLedgerStore(sheets, spreadsheetId) {
  const range = `${RUNS_TAB}!A:F`;
  return {
    async read() {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      const rows = res.data.values || [];
      return rows.slice(1).map(r => Object.fromEntries(RUNS_HEADERS.map((h, i) => [h, r[i] ?? ''])));
    },
    async append(row) {
      await sheets.spreadsheets.values.append({
        spreadsheetId, range, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [RUNS_HEADERS.map(h => row[h] ?? '')] },
      });
    },
    async update(snapshotId, patch) {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      const rows = res.data.values || [];
      const idIdx = RUNS_HEADERS.indexOf('snapshot_id');
      const rowNum = rows.findIndex((r, i) => i > 0 && r[idIdx] === snapshotId);
      if (rowNum < 1) return;
      const current = Object.fromEntries(RUNS_HEADERS.map((h, i) => [h, rows[rowNum][i] ?? '']));
      const merged = { ...current, ...patch };
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${RUNS_TAB}!A${rowNum + 1}:F${rowNum + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [RUNS_HEADERS.map(h => merged[h] ?? '')] },
      });
    },
  };
}

/** Column letter for a 1-based count (<= 26 cols here). */
export function colLetter(count) {
  return String.fromCharCode(64 + count); // 1→A ... 23→W
}
