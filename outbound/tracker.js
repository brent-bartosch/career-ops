/**
 * Stage 7 helper: write a TSV tracker addition for a sent outreach.
 *
 * Follows CLAUDE.md's canonical column order (status BEFORE score).
 * One file per addition at {additionsDir}/{num}-{slug}.tsv.
 * `merge-tracker.mjs` folds these into data/applications.md.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export function buildNote({ target, touch, date }) {
  const label = touch === 1 ? 'T0' : (touch === 2 ? 'T+3' : 'T+7');
  return `Outbound → ${target.name} (${target.title}). ${label} sent ${date}.`;
}

function sanitize(s) {
  return String(s ?? '').replace(/\t/g, ' ').replace(/\n/g, ' ');
}

export async function writeTrackerAddition({
  additionsDir, num, date, company, role, status, score, pdf, reportLink, note
}) {
  await mkdir(additionsDir, { recursive: true });
  const pdfCell = pdf ? '✅' : '❌';
  const reportCell = `[${num}](${reportLink})`;
  const line = [num, date, sanitize(company), sanitize(role), sanitize(status), score, pdfCell, reportCell, sanitize(note)].join('\t');
  const slug = (company || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const path = join(additionsDir, `${num}-${slug}.tsv`);
  await writeFile(path, line + '\n', 'utf8');
  return path;
}
