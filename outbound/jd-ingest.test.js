import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJD, ingestJD } from './jd-ingest.js';

const sampleJD = `Job Summary:
Delightree is the Franchise Operating System for modern, multi-unit brands. They are seeking a GTM Engineer to build and scale systems for their go-to-market team, focusing on HubSpot and broader GTM stack.

Responsibilities:
• Own the GTM Systems Architecture
• Own HubSpot and other GTM tooling implementations (e.g., Equals, Sybill, QuotaPath)
• Build Automation & AI-Powered Workflows

Qualifications:
Required:
• 3+ years in Revenue Operations, Sales Operations, or GTM Systems in a B2B SaaS environment
• Deep, hands-on experience building and maintaining HubSpot as a system of record
• Based in Denver, CO.
Preferred:
• Hands-on experience implementing AI workflows or automation tools
• SQL or data architecture experience
`.repeat(2); // ensure > 500 chars

test('parseJD: extracts title, company, stack, required, preferred, location', () => {
  const parsed = parseJD(sampleJD, { fallbackCompany: 'Delightree', fallbackTitle: 'Manager, GTM Engineering & Revenue Systems' });
  assert.equal(parsed.company_name, 'Delightree');
  assert.match(parsed.title, /GTM Engineer/i);
  assert.ok(parsed.stack.some(s => /HubSpot/i.test(s)));
  assert.ok(parsed.required.length >= 1);
  assert.ok(parsed.preferred.length >= 1);
  assert.ok(parsed.responsibilities.length >= 1);
  assert.match(parsed.location, /Denver/i);
});

test('ingestJD: from pasted text + metadata succeeds', async () => {
  const jd = await ingestJD({
    source: 'paste',
    text: sampleJD,
    company: 'Delightree',
    title: 'Manager, GTM Engineering & Revenue Systems',
    location: 'Denver, CO'
  });
  assert.equal(jd.ok, true);
  assert.equal(jd.data.company_name, 'Delightree');
  assert.ok(jd.data.raw_text.length >= 500);
});

test('ingestJD: paste with < 500 chars hard-stops', async () => {
  const jd = await ingestJD({ source: 'paste', text: 'too short', company: 'x', title: 'x', location: 'x' });
  assert.equal(jd.ok, false);
  assert.match(jd.errors[0], /too thin|500/i);
});

test('ingestJD: URL path uses web fetcher then Playwright', async () => {
  let calls = [];
  const webFetcher = async (url) => {
    calls.push(['web', url]);
    throw new Error('403');
  };
  const playwrightFetcher = async (url) => {
    calls.push(['pw', url]);
    return sampleJD;
  };
  const jd = await ingestJD({
    source: 'url',
    url: 'https://ziprecruiter.com/xyz',
    company: 'Delightree',
    title: 'Manager, GTM Engineering',
    location: 'Denver, CO',
    webFetcher,
    playwrightFetcher
  });
  assert.equal(jd.ok, true);
  assert.deepEqual(calls, [['web', 'https://ziprecruiter.com/xyz'], ['pw', 'https://ziprecruiter.com/xyz']]);
});

test('ingestJD: URL — both fetchers fail → hard stop asking for paste', async () => {
  const jd = await ingestJD({
    source: 'url',
    url: 'https://x',
    company: 'x', title: 'x', location: 'x',
    webFetcher: async () => { throw new Error('403'); },
    playwrightFetcher: async () => { throw new Error('empty body'); }
  });
  assert.equal(jd.ok, false);
  assert.match(jd.errors[0], /paste the JD/i);
});
