// scrapers/linkedin-source.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInputs, chunk } from './linkedin-source.js';

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
