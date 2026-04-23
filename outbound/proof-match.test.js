import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchProofs, splitDigestEntries, scoreMatch } from './proof-match.js';

const fakeDigest = `
# Article Digest

## Trial Conversion Engine (UpKeep)

**Context:** $30M B2B SaaS.
**What I built:** 8-stage pipeline, ICP scoring, routing, enrichment, LLM-drafted rep activity feeding HubSpot.
**Metrics / scale:** 10,300 LOC, 7 ICP cohorts, <$0.04/lead.
**Stack:** Node, HubSpot API, Claude API, OpenRouter.
**Outcome:** Reduced AE manual CRM updates.
**Best used to prove:** HubSpot as system of record, API-direct, AI-driven workflows, ICP scoring, routing, enrichment, rep activity capture.

## CRM Orchestration Layer

**Context:** Multi-CRM integrations.
**What I built:** Direct API to Close, Day.ai, Twenty, QuickBooks.
**Metrics / scale:** 3-day Day.ai build.
**Stack:** Node, direct API.
**Outcome:** No Zapier/Make overhead.
**Best used to prove:** API-direct CRM work, build in-house tooling.
`;

test('splitDigestEntries: parses entries with titles and Best used to prove', () => {
  const entries = splitDigestEntries(fakeDigest);
  assert.equal(entries.length, 2);
  assert.ok(entries[0].title.includes('Trial Conversion Engine'));
  assert.ok(entries[0].proves.includes('HubSpot as system of record'));
});

test('scoreMatch: prioritises entries that mention JD-tool terms', () => {
  const entry = { title: 'x', body: 'HubSpot API-direct', proves: ['HubSpot as system of record'] };
  const bullet = 'Own HubSpot as system of record';
  const score = scoreMatch(entry, bullet);
  assert.ok(score > 0);
});

test('matchProofs: returns ≥2 proof points for JD bullets', async () => {
  const result = await matchProofs({
    digestText: fakeDigest,
    profileText: '',
    jd: {
      required: [
        'Deep, hands-on experience building and maintaining HubSpot as a system of record',
        'Experience building dashboards and reports with BI tools'
      ],
      responsibilities: [
        'Build Automation & AI-Powered Workflows',
        'Own the GTM Systems Architecture'
      ]
    }
  });
  assert.equal(result.ok, true);
  assert.ok(result.data.proofs.length >= 2);
  for (const p of result.data.proofs) {
    assert.ok(p.jd_bullet);
    assert.ok(p.proof_text);
    assert.ok(p.source_file);
    assert.ok(p.specificity_score >= 1);
  }
});

test('matchProofs: hard-stops on empty digest', async () => {
  const result = await matchProofs({ digestText: '', profileText: '', jd: { required: ['x'], responsibilities: ['y'] } });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /article-digest/i.test(e)));
});

test('matchProofs: hard-stops when < 2 matches', async () => {
  const result = await matchProofs({
    digestText: '## Unrelated\n**Best used to prove:** knitting\n',
    profileText: '',
    jd: { required: ['HubSpot', 'Salesforce'], responsibilities: ['AI workflows'] }
  });
  assert.equal(result.ok, false);
});
