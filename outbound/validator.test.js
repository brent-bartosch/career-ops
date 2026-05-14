import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, STAGE_SCHEMAS } from './validator.js';

test('validate: stage 1 rejects short raw_text', () => {
  const result = validate('jd-ingest', {
    raw_text: 'short',
    title: 'Mgr',
    company_name: 'Acme',
    location: 'Denver, CO',
    stack: ['HubSpot'],
    required: ['3+ years'],
    preferred: ['SQL'],
    responsibilities: ['Own RevOps']
  });
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'jd-ingest');
  assert.match(result.errors[0], /raw_text/i);
});

test('validate: stage 1 accepts complete JD', () => {
  const raw = 'x'.repeat(600);
  const result = validate('jd-ingest', {
    raw_text: raw,
    title: 'Manager, GTM Engineering',
    company_name: 'Delightree',
    location: 'Denver, CO',
    stack: ['HubSpot', 'Sybill'],
    required: ['3+ years'],
    preferred: ['SQL'],
    responsibilities: ['Own HubSpot']
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validate: stage 2 requires 3+ customers and recent news', () => {
  const result = validate('company-research', {
    product_description: 'x'.repeat(250),
    icp: 'franchise ops',
    funding_stage: 'Series B',
    last_round: { date: '2025-12-03', amount: '$38M' },
    customers: ['A', 'B'], // only 2
    news: [{ title: 'x', date: '2025-11-01', url: 'https://x', summary: 'x' }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /customers/i.test(e)));
});

test('validate: stage 3 requires 3+ candidates', () => {
  const result = validate('target-id', {
    candidates: [{ name: 'x', title: 'VP', seniority: 'vp', apollo_person_id: '1', rank_reason: 'x' }]
  });
  assert.equal(result.ok, false);
});

test('validate: stage 4 requires 3+ recent activity items', () => {
  const result = validate('enrichment', {
    name: 'Doug', title: 'Head of Growth',
    email: 'd@x.com', email_status: 'verified',
    linkedin_url: 'https://linkedin.com/in/d',
    tenure_at_company_months: 14,
    prior_roles: [{ company: 'A', title: 'Dir' }, { company: 'B', title: 'VP' }],
    recent_activity: [{ type: 'post', url: 'https://x', text_snippet: 'x', date: '2026-04-01', topic_tags: [] }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /recent_activity/i.test(e)));
});

test('validate: stage 4 warns (not fails) on guessed email', () => {
  const result = validate('enrichment', {
    name: 'Doug', title: 'x',
    email: 'd@x.com', email_status: 'guessed',
    linkedin_url: 'https://linkedin.com/in/d',
    tenure_at_company_months: 14,
    prior_roles: [{}, {}],
    recent_activity: [{}, {}, {}]
  });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some(w => /guessed/i.test(w)));
});

test('validate: stage 5 requires 2+ proofs', () => {
  const result = validate('proof-match', {
    proofs: [{ jd_bullet: 'x', proof_text: 'y', source_file: 'z', specificity_score: 1 }]
  });
  assert.equal(result.ok, false);
});

test('validate: stage 6 requires exactly 3 variants, each <=80 words', () => {
  const result = validate('draft', {
    drafts: [
      { subject: 's', body: 'one two three', word_count: 3, anchor_type: 'a', anchor_source_url: 'u' },
      { subject: 's', body: 'x'.repeat(81 * 4), word_count: 85, anchor_type: 'b', anchor_source_url: 'u' },
      { subject: 's', body: 'three', word_count: 3, anchor_type: 'c', anchor_source_url: 'u' }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /80 words/i.test(e)));
});

test('validate: unknown stage throws', () => {
  assert.throws(() => validate('bogus', {}), /unknown stage/i);
});

test('validate: stage 2 rejects stale funding round (>36 months)', () => {
  const oldDate = new Date(Date.now() - 37 * 30.44 * 86400000).toISOString().slice(0, 10);
  const result = validate('company-research', {
    product_description: 'x'.repeat(250),
    icp: 'franchise ops',
    funding_stage: 'Series A',
    last_round: { date: oldDate, amount: '$5M' },
    customers: ['A', 'B', 'C'],
    news: [{ title: 'recent', date: new Date().toISOString().slice(0, 10), url: 'https://x', summary: 'x' }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /last_round/i.test(e)));
});

test('validate: stage 2 rejects when all news items are >12 months old', () => {
  const oldNewsDate = new Date(Date.now() - 13 * 30.44 * 86400000).toISOString().slice(0, 10);
  const result = validate('company-research', {
    product_description: 'x'.repeat(250),
    icp: 'franchise ops',
    funding_stage: 'Series A',
    last_round: { date: new Date().toISOString().slice(0, 10), amount: '$5M' },
    customers: ['A', 'B', 'C'],
    news: [{ title: 'old', date: oldNewsDate, url: 'https://x', summary: 'x' }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /news/i.test(e)));
});
