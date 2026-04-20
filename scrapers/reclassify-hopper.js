#!/usr/bin/env node
/**
 * Retroactively enrich the existing hopper with LLM classifications.
 *
 * Reads data/hopper/postings.json. For each posting missing `roleFit`,
 * calls the classifier and writes the result back. Saves incrementally
 * so an interrupted run doesn't lose work.
 *
 * Usage:
 *   node scrapers/reclassify-hopper.js                  # classify unclassified
 *   node scrapers/reclassify-hopper.js --limit=50       # cap at 50 calls
 *   node scrapers/reclassify-hopper.js --min-intent=30  # override threshold
 *   node scrapers/reclassify-hopper.js --backfill       # re-run classified postings missing newer fields
 *   node scrapers/reclassify-hopper.js --dry-run        # show what would run
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';
import { classifyPosting } from '../scoring/llm-classifier.js';
import { parsePostedDate } from '../scoring/parse-posted-date.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
loadEnv({ path: join(ROOT, '.env') });

const POSTINGS_FILE = join(ROOT, 'data', 'hopper', 'postings.json');
const SAVE_INTERVAL = 20; // write back every N classifications

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (prefix) => {
    const found = args.find(a => a.startsWith(prefix));
    return found ? found.split('=')[1] : null;
  };
  return {
    limit: get('--limit=') ? parseInt(get('--limit='), 10) : null,
    minIntent: get('--min-intent=') ? parseInt(get('--min-intent='), 10) : 20,
    minDescription: get('--min-desc=') ? parseInt(get('--min-desc='), 10) : 0,
    dryRun: args.includes('--dry-run'),
    backfill: args.includes('--backfill'),
  };
}

function isEligible(posting, opts) {
  // Backfill mode: re-run classified postings that are missing newer schema fields
  if (opts.backfill && posting.roleFit && !posting.employmentType) {
    return true;
  }
  if (posting.roleFit) return false; // already classified
  if ((posting.intentScore || 0) < opts.minIntent) return false;
  const contentLen = (posting.description || '').length + (posting.snippet || '').length;
  if (contentLen < opts.minDescription) return false;
  return true;
}

async function main() {
  const opts = parseArgs();

  if (!existsSync(POSTINGS_FILE)) {
    console.error(`Hopper not found: ${POSTINGS_FILE}`);
    process.exit(1);
  }

  const apiKey = process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey && !opts.dryRun) {
    console.error('OPEN_ROUTER_API_KEY not set in .env');
    process.exit(1);
  }

  const postings = JSON.parse(readFileSync(POSTINGS_FILE, 'utf-8'));
  console.log(`Loaded ${postings.length} postings`);

  // Also backfill postedDateISO for everything we can (cheap, no LLM)
  let dateBackfilled = 0;
  for (const p of postings) {
    if (!p.postedDateISO && p.postedDate) {
      const iso = parsePostedDate(p.postedDate);
      if (iso) {
        p.postedDateISO = iso;
        dateBackfilled++;
      }
    }
  }
  if (dateBackfilled > 0) {
    console.log(`Backfilled ${dateBackfilled} postedDateISO values`);
  }

  // Build eligible set
  const eligibleIndexes = [];
  for (let i = 0; i < postings.length; i++) {
    if (isEligible(postings[i], opts)) eligibleIndexes.push(i);
  }

  const toProcess = opts.limit
    ? eligibleIndexes.slice(0, opts.limit)
    : eligibleIndexes;

  console.log(`\nEligible for classification: ${eligibleIndexes.length}`);
  console.log(`Will process: ${toProcess.length}`);
  console.log(`Threshold: intentScore >= ${opts.minIntent}, description >= ${opts.minDescription} chars`);

  if (opts.dryRun) {
    console.log('\nDRY RUN — not calling API.');
    for (const i of toProcess.slice(0, 5)) {
      const p = postings[i];
      console.log(`  [${p.intentScore}] ${p.company} — ${(p.title || '').slice(0, 60)}`);
    }
    if (toProcess.length > 5) console.log(`  ... and ${toProcess.length - 5} more`);
    return;
  }

  if (toProcess.length === 0) {
    if (dateBackfilled > 0) {
      writeFileSync(POSTINGS_FILE, JSON.stringify(postings, null, 2));
      console.log('Saved date backfills.');
    }
    return;
  }

  console.log('\nClassifying...\n');
  let classified = 0;
  let failed = 0;
  let nullResults = 0;
  const startTime = Date.now();

  for (let n = 0; n < toProcess.length; n++) {
    const i = toProcess[n];
    const p = postings[i];
    const label = `[${n + 1}/${toProcess.length}] ${p.company || '?'} — ${(p.title || '').slice(0, 50)}`;

    try {
      const result = await classifyPosting(p, { apiKey });
      if (result) {
        p.country = result.country;
        p.countryConfidence = result.countryConfidence;
        p.employmentType = result.employmentType;
        p.duration = result.duration;
        p.roleFit = result.roleFit;
        p.fitScore = result.fitScore;
        p.fitReason = result.fitReason;
        p.dealBreakers = result.dealBreakers;
        classified++;
        console.log(`${label} — ${result.country} / ${result.roleFit} (${result.fitScore})`);
      } else {
        nullResults++;
        console.log(`${label} — UNPARSEABLE response`);
      }
    } catch (err) {
      failed++;
      console.warn(`${label} — ERROR: ${err.message}`);
      // Backoff on rate limit
      if (err.message.includes('429')) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    // Incremental save
    if ((n + 1) % SAVE_INTERVAL === 0) {
      writeFileSync(POSTINGS_FILE, JSON.stringify(postings, null, 2));
    }
  }

  // Final save
  writeFileSync(POSTINGS_FILE, JSON.stringify(postings, null, 2));

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Classified:    ${classified}`);
  console.log(`Unparseable:   ${nullResults}`);
  console.log(`Errors:        ${failed}`);
  console.log(`Elapsed:       ${elapsed}s`);
}

main().catch(err => {
  console.error('Reclassify failed:', err.message);
  process.exit(1);
});
