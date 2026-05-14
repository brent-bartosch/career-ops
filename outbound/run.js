#!/usr/bin/env node
/**
 * outbound/run.js — Orchestrator CLI for the outbound pipeline.
 *
 * Usage:
 *   node outbound/run.js --url <jd-url>               # fresh run
 *   node outbound/run.js --report <num>               # reuse existing evaluation
 *   node outbound/run.js --paste <file.txt> --company "X" --title "Y" --location "Z"
 *   node outbound/run.js --resume <state-file> --target <index>
 *   node outbound/run.js --touch 2 --artifact <outreach/XXX.md>
 *
 * Review gates pause by writing state and printing the review prompt.
 * The mode file (modes/outbound.md) is the interactive Claude layer that
 * surfaces gates to the user.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { parseArgs } from 'node:util';
import { ApolloClient } from './clients/apollo.js';
import { BrightDataClient } from './clients/bright-data.js';
import { fetchJDViaPlaywright } from './clients/playwright-fetch.js';
import { ingestJD } from './jd-ingest.js';
import { researchCompany } from './company-research.js';
import { identifyTargets } from './target-id.js';
import { enrichTarget } from './enrichment.js';
import { matchProofs, loadDigestAndProfile } from './proof-match.js';
import { generateDrafts } from './draft.js';
import { writeArtifact, nextReportNumber } from './artifact.js';
import { writeTrackerAddition, buildNote } from './tracker.js';
import { computeSchedule } from './schedule.js';

let ARGS;
try {
  ARGS = parseArgs({
    options: {
      url:      { type: 'string' },
      report:   { type: 'string' },
      paste:    { type: 'string' },
      company:  { type: 'string' },
      title:    { type: 'string' },
      location: { type: 'string' },
      resume:   { type: 'string' },
      target:   { type: 'string' },
      chosen:   { type: 'string' },
      edits:    { type: 'string' },
      touch:    { type: 'string' },
      artifact: { type: 'string' }
    }
  }).values;
} catch {
  // Unknown flags (e.g. --help) — fall through to halt in main()
  ARGS = {};
}

const OUTREACH_DIR = 'outreach';
const TRACKER_ADDITIONS_DIR = 'batch/tracker-additions';

function halt(errors) {
  console.error('\n' + errors.map(e => '✗ ' + e).join('\n') + '\n');
  process.exit(1);
}

function gate(label, data, stateFile) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(data, null, 2));
  if (stateFile) console.log(`\n# State saved to: ${stateFile}`);
  console.log(`=== END ${label} — awaiting user review ===\n`);
}

async function saveState(state) {
  await mkdir(OUTREACH_DIR, { recursive: true });
  const path = `${OUTREACH_DIR}/.state-${Date.now()}.json`;
  await writeFile(path, JSON.stringify(state, null, 2));
  return path;
}

async function loadState(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function doFreshRun() {
  const source = ARGS.url ? 'url' : (ARGS.paste ? 'paste' : null);
  if (!source) halt(['provide --url, --report, or --paste']);

  const text = ARGS.paste ? await readFile(ARGS.paste, 'utf8') : undefined;
  const webFetcher = async (u) => (await fetch(u).then(r => r.text())).trim();

  // Stage 1 — JD Ingest
  const jd = await ingestJD({
    source,
    text,
    url: ARGS.url,
    company: ARGS.company || '',
    title: ARGS.title || '',
    location: ARGS.location || '',
    webFetcher,
    playwrightFetcher: fetchJDViaPlaywright
  });
  if (!jd.ok) halt(jd.errors);

  // Stage 2 — Company Research
  const webSearcher = async (_q) => {
    // Mode layer (Claude) typically injects real search results via the mode prompt.
    // The CLI-direct path returns empty here; the orchestrator will hard-stop if the user
    // hasn't fed in research. For smoke tests, pass pre-researched data via an env var or --paste.
    return [];
  };
  const company = await researchCompany({
    company: jd.data.company_name,
    jd_raw_text: jd.data.raw_text,
    webFetcher,
    webSearcher
  });
  if (!company.ok) halt(company.errors);

  // Stage 3 — Target ID
  const apollo = new ApolloClient({ apiKey: process.env.APOLLO_API_KEY });
  const targets = await identifyTargets({
    company: jd.data.company_name,
    jdTitle: jd.data.title,
    apolloClient: apollo
  });
  if (!targets.ok) halt(targets.errors);

  // Review Gate 1
  const stateFile = await saveState({
    phase: 'gate1',
    jd: jd.data,
    company: company.data,
    candidates: targets.data.candidates,
    titles_used: targets.data.titles_used
  });
  gate('REVIEW GATE 1 — pick primary target', {
    candidates: targets.data.candidates
  }, stateFile);
  console.log(`To continue: node outbound/run.js --resume ${stateFile} --target <index>`);
  process.exit(0);
}

async function doResume() {
  const state = await loadState(ARGS.resume);
  if (state.phase !== 'gate1') halt([`unexpected state phase: ${state.phase}`]);

  const targetIdx = parseInt(ARGS.target || '0', 10);
  const candidate = state.candidates[targetIdx];
  if (!candidate) halt([`no candidate at index ${targetIdx}`]);

  const apollo = new ApolloClient({ apiKey: process.env.APOLLO_API_KEY });
  const brightData = new BrightDataClient({ apiKey: process.env.BRIGHT_DATA_API_KEY });

  // Stage 4 — Enrichment
  const target = await enrichTarget({ candidate, apolloClient: apollo, brightDataClient: brightData });
  if (!target.ok) halt(target.errors);

  // Stage 5 — Proof Match
  const { digestText, profileText } = await loadDigestAndProfile();
  const proofs = await matchProofs({
    digestText,
    profileText,
    jd: state.jd
  });
  if (!proofs.ok) halt(proofs.errors);

  // Stage 6 — Draft
  const draftResult = await generateDrafts({
    jd: state.jd,
    company: state.company,
    target: target.data,
    proofs: proofs.data.proofs
  });
  if (!draftResult.ok) halt(draftResult.errors);

  // Review Gate 2
  const stateFile = await saveState({
    phase: 'gate2',
    jd: state.jd,
    company: state.company,
    target: target.data,
    proofs: proofs.data.proofs,
    drafts: draftResult.data.drafts,
    candidates: state.candidates,
    titles_used: state.titles_used
  });
  gate('REVIEW GATE 2 — pick variant', {
    drafts: draftResult.data.drafts
  }, stateFile);
  console.log(`To continue: node outbound/run.js --resume ${stateFile} --chosen <A|B|C> [--edits "..."]`);
  process.exit(0);
}

async function main() {
  if (ARGS.resume) return doResume();
  return doFreshRun();
}

main().catch(e => halt([e.message]));
