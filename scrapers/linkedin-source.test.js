// scrapers/linkedin-source.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildInputs, chunk, normalizeRecord, passesWorkplaceRule, isExcludedTitle } from './linkedin-source.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'linkedin-jobs-sample.json'), 'utf-8')
)[0];

const CONFIG = {
  defaults: { country: 'US', time_range: 'Past 24 hours', experience_level: '' },
  locations: [
    { label: 'remote_us_ft', location: 'United States', remote: 'Remote', job_type: 'Full-time' },
    { label: 'la_contract', location: 'Los Angeles', remote: '', job_type: 'Contract' },
  ],
  discovery_archetypes: ['gtm_engineer'],
  archetypes: {
    gtm_engineer: { keywords: ['GTM engineer', 'growth engineer'] },
    head_of_gtm: { keywords: ['head of GTM'] }, // not in discovery_archetypes
  },
};

test('buildInputs: cartesian of discovery keywords × locations with defaults applied', () => {
  const inputs = buildInputs(CONFIG);
  // 2 keywords × 2 locations = 4 inputs (head_of_gtm excluded — not in discovery_archetypes)
  assert.equal(inputs.length, 4);
  const first = inputs[0];
  assert.equal(first.keyword, 'GTM engineer');
  assert.equal(first.location, 'United States');
  assert.equal(first.remote, 'Remote');
  assert.equal(first.job_type, 'Full-time');
  assert.equal(first.country, 'US');
  assert.equal(first.time_range, 'Past 24 hours');
  // Bright Data requires these keys present (empty allowed)
  assert.equal(first.company, '');
  assert.equal(first.location_radius, '');
  assert.equal(first.experience_level, '');
  // provenance carried for normalization (stripped before sending)
  assert.equal(first._archetype, 'gtm_engineer');
  assert.equal(first._locationLabel, 'remote_us_ft');
});

test('chunk: splits an array into groups of size n', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 5), []);
});

test('normalizeRecord: maps a Bright Data jobs record to the posting shape', () => {
  const meta = { archetype: 'gtm_engineer', locationLabel: 'remote_us_ft', snapshotId: 'snap-1' };
  const p = normalizeRecord(SAMPLE, meta);
  assert.equal(p.jobId, '4425460450');
  assert.equal(p.title, 'System Administrator - IT Support');
  assert.equal(p.company, 'TAC Security');
  assert.equal(p.url, SAMPLE.url);
  assert.equal(p.platform, 'linkedin');
  assert.ok(p.description.length > 100);          // full JD text present
  assert.ok(p.snippet.length > 0 && p.snippet.length <= 320);
  assert.equal(p.location, 'Chandigarh, India');
  assert.equal(p.employmentType, 'Full-time');
  assert.equal(p.applicants, 52);
  assert.equal(p.seniority, 'Associate');
  assert.equal(p.logo, SAMPLE.company_logo);
  assert.equal(p.companyUrl, SAMPLE.company_url);
  assert.equal(p.posterName, 'Hitesh **');
  assert.equal(p.discoveryArchetype, 'gtm_engineer');
  assert.equal(p.snapshotId, 'snap-1');
  // postedDate prefers the ISO field
  assert.equal(p.postedDate, '2026-06-08T07:21:34.927Z');
});

test('normalizeRecord: applyLink falls back to job url when apply_link is null', () => {
  const p = normalizeRecord({ ...SAMPLE, apply_link: null }, {});
  assert.equal(p.applyLink, SAMPLE.url);
});

test('isExcludedTitle: drops denylisted titles (substring, case-insensitive), keeps GTM roles', () => {
  const deny = ['sales engineer', 'solutions engineer', 'technical solutions engineer'];
  assert.equal(isExcludedTitle('Senior Sales Engineer', deny), true);
  assert.equal(isExcludedTitle('Technical Solutions Engineer, Performance Ads', deny), true);
  assert.equal(isExcludedTitle('AI Solutions Engineer', deny), true);
  assert.equal(isExcludedTitle('GTM Engineer', deny), false);
  assert.equal(isExcludedTitle('Forward Deployed Engineer', deny), false);
  assert.equal(isExcludedTitle('Head of GTM', deny), false);
});

test('passesWorkplaceRule: remote/hybrid/unknown pass; on-site only in LA', () => {
  assert.equal(passesWorkplaceRule({ workplaceType: 'remote', location: 'United States' }), true);
  assert.equal(passesWorkplaceRule({ workplaceType: 'hybrid', location: 'New York, NY' }), true);
  assert.equal(passesWorkplaceRule({ workplaceType: 'unknown', location: 'Austin, TX' }), true);
  assert.equal(passesWorkplaceRule({ workplaceType: 'onsite', location: 'San Francisco, CA' }), false);
  assert.equal(passesWorkplaceRule({ workplaceType: 'onsite', location: 'Los Angeles, CA' }), true);
  assert.equal(passesWorkplaceRule({ workplaceType: 'onsite', location: 'Greater Los Angeles' }), true);
});
