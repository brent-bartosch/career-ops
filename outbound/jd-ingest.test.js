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

test('parseJD: stack contains only named tools, not responsibility bullets', () => {
  const jd = `Company is the platform.
Responsibilities:
• Own the GTM Systems Architecture
• Build pipeline automation
Required:
• 3+ years in Revenue Operations
• Deep HubSpot experience
`.repeat(3);
  const p = parseJD(jd, { fallbackCompany: 'Company', fallbackTitle: 'Mgr', fallbackLocation: 'Austin, TX' });
  // stack should include HubSpot (named tool) but NOT the bullet lines
  assert.ok(p.stack.some(s => /HubSpot/i.test(s)), 'stack includes HubSpot');
  assert.ok(!p.stack.some(s => /GTM Systems Architecture/i.test(s)), 'stack excludes responsibility bullets');
  assert.ok(!p.stack.some(s => /years in Revenue Operations/i.test(s)), 'stack excludes requirement bullets');
});

test('parseJD: 3+ years requirement preserves the leading digit', () => {
  const jd = `Company is the platform.
Required:
• 3+ years in Revenue Operations
• 5+ years Salesforce admin
`.repeat(3);
  const p = parseJD(jd, { fallbackCompany: 'X', fallbackTitle: 'Y', fallbackLocation: 'Z' });
  const hasIntactThreeYears = p.required.some(r => /^3\+ years/.test(r));
  const hasIntactFiveYears = p.required.some(r => /^5\+ years/.test(r));
  assert.ok(hasIntactThreeYears, `required should include "3+ years..." verbatim. Got: ${JSON.stringify(p.required)}`);
  assert.ok(hasIntactFiveYears, `required should include "5+ years..." verbatim. Got: ${JSON.stringify(p.required)}`);
});

test('parseJD: title fallback strips bullet prefix from matched line', () => {
  const jd = `At StartupX, we are hiring.

• Senior GTM Engineer role
• Remote-friendly

Required:
• 3+ years
Preferred:
• SQL
Responsibilities:
• Own the stack
`.repeat(3);
  const p = parseJD(jd, { fallbackLocation: 'Remote' });
  // No fallbackTitle provided — triggers the second fallback path
  assert.ok(!p.title.startsWith('•'), `title should not begin with bullet. Got: ${JSON.stringify(p.title)}`);
  assert.match(p.title, /Senior GTM Engineer/i);
});

test('parseJD: company name picks up "At Company, we..." phrasing', () => {
  const jd = `At Delightree, we are hiring a GTM Engineer.

Required:
• 3+ years
Preferred:
• SQL
Responsibilities:
• Own the stack
`.repeat(3);
  const p = parseJD(jd, { fallbackTitle: 'GTM Engineer', fallbackLocation: 'Remote' });
  // No fallbackCompany — exercise the "At X, we..." regex
  assert.equal(p.company_name, 'Delightree');
});

test('parseJD: location regex requires comma, avoids "Service SF" false positive', () => {
  const jd = `Company is the platform. We do Customer Service SF work and also have US Remote positions.

Required:
• 3+ years
Preferred:
• SQL
Responsibilities:
• Own the stack
`.repeat(3);
  const p = parseJD(jd, { fallbackCompany: 'X', fallbackTitle: 'Y' });
  // No fallbackLocation — test the regex
  // Should NOT match "Service SF" or "US Remote" as locations
  assert.notEqual(p.location, 'Service SF');
  assert.notEqual(p.location, 'Customer Service SF');
  // Should land on 'Unknown' since no proper "City, ST" or "based in X" exists
  assert.equal(p.location, 'Unknown');
});
