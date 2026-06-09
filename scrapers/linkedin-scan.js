#!/usr/bin/env node
// scrapers/linkedin-scan.js
/**
 * LinkedIn GTM daily scan orchestrator.
 *
 * Flow: load config → auth → ensure tabs → reconcile prior/orphan snapshots →
 * trigger new discover chunks (ledger records each snapshot_id BEFORE fetch) →
 * reconcile again → for each batch: normalize + score + dedup + append rows.
 *
 * Run: node scrapers/linkedin-scan.js [--no-trigger] [--no-classify]
 *   --no-trigger : reconcile/recover only, do not trigger new jobs
 *   --no-classify: skip the LLM classification step (faster/cheaper dry runs)
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { google } from 'googleapis';
import { config as loadEnv } from 'dotenv';

import { getAuthClient } from './sheets-auth.js';
import { LinkedInJobsClient } from './linkedin-jobs-client.js';
import { buildInputs, toApiInput, chunk, normalizeRecord } from './linkedin-source.js';
import { reconcile, adoptOrphans } from './snapshot-ledger.js';
import {
  MAIN_TAB, RUNS_TAB, MAIN_HEADERS, RUNS_HEADERS,
  ensureTab, readExistingJobIds, appendPostings, makeLedgerStore, dedupeNew, dedupeByRole,
} from './linkedin-sheets.js';
import { matchArchetypes } from '../scoring/archetype-matcher.js';
import { scoreIntent } from '../scoring/intent-scorer.js';
import { classifyPosting } from '../scoring/llm-classifier.js';
import { parsePostedDate } from '../scoring/parse-posted-date.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
loadEnv({ path: join(ROOT, '.env') });

const args = process.argv.slice(2);
const noTrigger = args.includes('--no-trigger');
const noClassify = args.includes('--no-classify');
const CLASSIFY_MIN_INTENT = 20;
const TRIGGER_DELAY_MS = 1500; // pace triggers to avoid bursting Bright Data rate limits

async function main() {
  // 1. Config + secrets
  const config = yaml.load(readFileSync(join(__dirname, 'linkedin-queries.yml'), 'utf-8'));
  const apiKey = process.env.BRIGHT_DATA_API_KEY || process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) throw new Error('BRIGHT_DATA_API_KEY (or BRIGHTDATA_API_KEY) is required');
  const spreadsheetId = process.env.LINKEDIN_SHEET_ID;
  if (!spreadsheetId) throw new Error('LINKEDIN_SHEET_ID is required');
  const openRouterKey = process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY;

  const client = new LinkedInJobsClient({ apiKey, datasetId: config.dataset_id });

  // 2. Auth + sheets client + tabs
  const authClient = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  await ensureTab(sheets, spreadsheetId, MAIN_TAB, MAIN_HEADERS);
  await ensureTab(sheets, spreadsheetId, RUNS_TAB, RUNS_HEADERS);
  const store = makeLedgerStore(sheets, spreadsheetId);

  // 3. onRecords: normalize → score → dedup → append (shared by all reconcile passes)
  let totalAppended = 0;
  const onRecords = async (records, snapshotId) => {
    const existingIds = await readExistingJobIds(sheets, spreadsheetId);
    const postings = [];
    for (const r of records) {
      const p = normalizeRecord(r, { snapshotId });
      p.postedDateISO = parsePostedDate(p.postedDate);
      p.archetypes = matchArchetypes({ title: p.title, snippet: p.snippet });
      const { score } = scoreIntent(p);
      p.intentScore = score;
      postings.push(p);
    }
    // dedup (vs sheet + intra-batch) before the expensive LLM step
    const deduped = dedupeNew(postings, existingIds);
    // relevance gate: drop fuzzy-keyword noise, collapse repeated roles
    const gated = config.require_archetype_match === false
      ? deduped
      : deduped.filter(p => (p.archetypes || []).length > 0);
    const fresh = dedupeByRole(gated);
    const droppedNoise = deduped.length - gated.length;
    const droppedRepeat = gated.length - fresh.length;

    if (!noClassify && openRouterKey) {
      for (const p of fresh) {
        if ((p.intentScore || 0) < CLASSIFY_MIN_INTENT) continue;
        try {
          const c = await classifyPosting(p, { apiKey: openRouterKey });
          if (c) Object.assign(p, { country: c.country, employmentType: c.employmentType, duration: c.duration, roleFit: c.roleFit, fitScore: c.fitScore, fitReason: c.fitReason, dealBreakers: c.dealBreakers });
        } catch (err) {
          console.warn(`classify failed for ${p.company} — ${err.message}`); // keep posting, intent-only
        }
      }
    }
    const n = await appendPostings(sheets, spreadsheetId, fresh);
    totalAppended += n;
    console.log(`  snapshot ${snapshotId}: ${records.length} records → ${n} new rows (dropped ${droppedNoise} off-target, ${droppedRepeat} repeat roles)`);
  };

  const now = new Date().toISOString();

  // 4. Reconcile-first: recover anything pending + adopt orphans, then fetch
  await adoptOrphans({ store, client, triggerTime: now });
  await reconcile({ store, client, onRecords });

  // 5. Trigger new discover chunks (record snapshot_id BEFORE fetching)
  if (!noTrigger) {
    const inputs = buildInputs(config);
    const chunks = chunk(inputs, config.chunk_size || 5);
    console.log(`Triggering ${chunks.length} chunks (${inputs.length} inputs)...`);
    for (let i = 0; i < chunks.length; i++) {
      const group = chunks[i];
      const summary = group.map(g => `${g._archetype}/${g._locationLabel}:${g.keyword}`).join(' ; ').slice(0, 240);
      try {
        const snapshotId = await client.trigger(group.map(toApiInput));
        await store.append({ snapshot_id: snapshotId, trigger_time: now, inputs_summary: summary, status: 'triggered', rows_captured: '', error: '' });
        console.log(`  triggered ${snapshotId} (${group.length} inputs)`);
      } catch (err) {
        console.error(`  trigger failed for [${summary}]: ${err.message}`);
        // Auth/quota rejection won't fix itself across the next 15 triggers —
        // stop hammering Bright Data and fail loud with a clear cause.
        if (/rejected \((401|403)\)|missing or invalid/i.test(err.message)) {
          throw new Error(`Bright Data auth/quota rejection — aborting after ${i} of ${chunks.length} triggers. Check BRIGHT_DATA_API_KEY validity and account credits. (${err.message})`);
        }
      }
      // Pace triggers so a full matrix doesn't burst Bright Data's rate limits.
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, TRIGGER_DELAY_MS));
    }
    // 6. Reconcile the freshly-triggered snapshots (poll until ready, then fetch)
    await pollUntilSettled({ store, client, onRecords });
  }

  console.log(`\nDone. ${totalAppended} new postings appended to the sheet.`);
}

/**
 * Repeatedly reconcile until no rows remain in 'triggered'/'ready', or the
 * deadline passes (the next daily run will recover anything left).
 */
async function pollUntilSettled({ store, client, onRecords, intervalMs = 5000, deadlineMs = 1800000 }) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    await reconcile({ store, client, onRecords });
    const rows = await store.read();
    const pending = rows.filter(r => r.status === 'triggered' || r.status === 'ready');
    if (pending.length === 0) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  console.warn('pollUntilSettled: deadline reached; pending snapshots will be recovered next run.');
}

main().catch(err => { console.error('LinkedIn scan failed:', err.message); process.exit(1); });
