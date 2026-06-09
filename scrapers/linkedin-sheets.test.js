// scrapers/linkedin-sheets.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_HEADERS, postingToRow, sheetImage, sheetHyperlink, dedupeNew } from './linkedin-sheets.js';

test('sheetImage / sheetHyperlink: build formulas and escape quotes', () => {
  assert.equal(sheetImage('http://x/y.png'), '=IMAGE("http://x/y.png")');
  assert.equal(sheetHyperlink('http://x', 'Acme'), '=HYPERLINK("http://x","Acme")');
  // a label containing a quote is escaped by doubling
  assert.equal(sheetHyperlink('http://x', 'A"B'), '=HYPERLINK("http://x","A""B")');
  // empty url → plain label, no formula
  assert.equal(sheetImage(''), '');
  assert.equal(sheetHyperlink('', 'Acme'), 'Acme');
});

test('postingToRow: produces a row aligned to MAIN_HEADERS with visual cells', () => {
  const posting = {
    jobId: '123', title: 'GTM Engineer', company: 'Acme', url: 'http://job/123',
    companyUrl: 'http://acme', logo: 'http://acme/logo.png', applyLink: 'http://apply/123',
    location: 'Los Angeles', employmentType: 'Full-time', salary: '$150k', applicants: 12,
    seniority: 'Mid-Senior', postedDate: '2026-06-08T00:00:00Z', postedRaw: '1 day ago',
    archetypes: ['gtm_engineer'], intentScore: 55, fitScore: 72, roleFit: 'good',
    fitReason: 'API-direct GTM build', posterName: 'Jane', posterUrl: 'http://li/jane',
    snapshotId: 'snap-1',
  };
  const row = postingToRow(posting);
  assert.equal(row.length, MAIN_HEADERS.length);
  assert.equal(row[MAIN_HEADERS.indexOf('Logo')], '=IMAGE("http://acme/logo.png")');
  assert.equal(row[MAIN_HEADERS.indexOf('Company')], '=HYPERLINK("http://acme","Acme")');
  assert.equal(row[MAIN_HEADERS.indexOf('Title')], '=HYPERLINK("http://job/123","GTM Engineer")');
  assert.equal(row[MAIN_HEADERS.indexOf('Apply')], '=HYPERLINK("http://apply/123","Apply")');
  assert.equal(row[MAIN_HEADERS.indexOf('Job ID')], '123');
  assert.equal(row[MAIN_HEADERS.indexOf('Archetypes')], 'gtm_engineer');
});

test('dedupeNew: drops postings whose jobId already exists in the sheet', () => {
  const existingIds = new Set(['123']);
  const postings = [{ jobId: '123' }, { jobId: '456' }, { jobId: '456' }];
  const fresh = dedupeNew(postings, existingIds);
  assert.deepEqual(fresh.map(p => p.jobId), ['456']); // existing + intra-batch dup removed
});
