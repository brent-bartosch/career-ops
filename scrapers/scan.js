#!/usr/bin/env node
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runScan, loadTemplates, buildQueries } from './serp-scanner.js';
import { fetchPosting } from './posting-fetcher.js';
import { matchArchetypes } from '../scoring/archetype-matcher.js';
import { scoreIntent } from '../scoring/intent-scorer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const HOPPER_DIR = join(ROOT, 'data', 'hopper');
const TEMPLATES_PATH = join(__dirname, 'query-templates.yml');
const POSTINGS_FILE = join(HOPPER_DIR, 'postings.json');

// Parse CLI args
const args = process.argv.slice(2);
const estimateOnly = args.includes('--estimate');
const skipFetch = args.includes('--skip-fetch');
const platformArg = args.find(a => a.startsWith('--platforms='));
const platforms = platformArg ? platformArg.split('=')[1].split(',') : null;

async function main() {
  console.log('='.repeat(60));
  console.log('  CAREER-OPS SCAN');
  console.log('='.repeat(60));

  // Ensure output dir exists
  if (!existsSync(HOPPER_DIR)) {
    mkdirSync(HOPPER_DIR, { recursive: true });
  }

  // Load existing postings for merge
  let existingPostings = [];
  if (existsSync(POSTINGS_FILE)) {
    existingPostings = JSON.parse(readFileSync(POSTINGS_FILE, 'utf-8'));
    console.log(`\nExisting hopper: ${existingPostings.length} postings`);
  }

  if (estimateOnly) {
    const templates = await loadTemplates(TEMPLATES_PATH);
    const filteredTemplates = { ...templates };
    if (platforms) {
      const filtered = {};
      for (const p of platforms) {
        if (templates.platforms[p]) filtered[p] = templates.platforms[p];
      }
      filteredTemplates.platforms = filtered;
    }
    const queries = buildQueries(filteredTemplates);
    console.log(`\nWould run ${queries.length} SERP queries`);
    console.log(`Estimated time: ~${Math.ceil(queries.length * 5 / 60)} minutes`);
    return;
  }

  // Run SERP scan
  console.log('\n--- SERP Scanning ---\n');
  const newPostings = await runScan(TEMPLATES_PATH, { platforms });

  // Fetch full JD text for new postings (unless --skip-fetch)
  if (!skipFetch) {
    console.log('\n--- Fetching Full Job Descriptions ---\n');
    for (let i = 0; i < newPostings.length; i++) {
      const posting = newPostings[i];
      console.log(`[${i + 1}/${newPostings.length}] ${posting.company || 'unknown'} - ${posting.title?.substring(0, 50)}`);

      const result = await fetchPosting(posting.url);
      if (result.success) {
        posting.description = result.text;
        posting.location = result.location || posting.location || null;
        console.log(`  OK (${result.text.length} chars)`);
      } else {
        posting.description = '';
        console.log(`  SKIP: ${result.error}`);
      }

      // Rate limiting
      if (i < newPostings.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  // Score and classify all new postings
  console.log('\n--- Scoring ---\n');
  for (const posting of newPostings) {
    posting.archetypes = matchArchetypes(posting);
    const { score, factors } = scoreIntent(posting);
    posting.intentScore = score;
    posting.scoreFactors = factors;
  }

  // Merge with existing (dedupe by URL)
  const existingUrls = new Set(existingPostings.map(p => p.url));
  const genuinelyNew = newPostings.filter(p => !existingUrls.has(p.url));

  const merged = [...existingPostings, ...genuinelyNew];

  // Sort by score descending
  merged.sort((a, b) => (b.intentScore || 0) - (a.intentScore || 0));

  // Save
  writeFileSync(POSTINGS_FILE, JSON.stringify(merged, null, 2));

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('  SCAN COMPLETE');
  console.log('='.repeat(60));
  console.log(`\n  New postings found: ${genuinelyNew.length}`);
  console.log(`  Total in hopper: ${merged.length}`);

  // Archetype breakdown
  const archetypeCounts = { revops_gtm_leader: 0, solutions_architect: 0, marketing_ops: 0, unclassified: 0 };
  for (const p of merged) {
    if (!p.archetypes || p.archetypes.length === 0) {
      archetypeCounts.unclassified++;
    } else {
      for (const arch of p.archetypes) {
        archetypeCounts[arch] = (archetypeCounts[arch] || 0) + 1;
      }
    }
  }
  console.log('\n  By archetype:');
  for (const [arch, count] of Object.entries(archetypeCounts)) {
    console.log(`    ${arch}: ${count}`);
  }

  // Top 10
  console.log('\n  Top 10 by intent score:');
  merged.slice(0, 10).forEach((p, i) => {
    console.log(`    ${i + 1}. [${p.intentScore}] ${p.company || '?'} — ${p.title?.substring(0, 50)}`);
    console.log(`       Archetypes: ${(p.archetypes || []).join(', ') || 'none'}`);
  });
}

main().catch(err => {
  console.error('Scan failed:', err.message);
  process.exit(1);
});
