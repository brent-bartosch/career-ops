import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichTarget } from './enrichment.js';

const now = Date.now();
const recent = (d) => new Date(now - d * 86400000).toISOString();

test('enrichTarget: composes Apollo + Bright Data into target.json', async () => {
  const apollo = {
    matchPerson: async () => ({
      email: 'doug@delightree.com',
      email_status: 'verified',
      linkedin_url: 'https://linkedin.com/in/dougegabbard',
      tenure_at_company_months: 14,
      prior_roles: [
        { company: 'Nextbite', title: 'Sr Director' },
        { company: 'Ordermark', title: 'Sr Director' }
      ]
    })
  };
  const brightData = {
    getProfile: async () => ({ name: 'Doug Gabbard', current_title: 'Head of Growth', about: 'multi-unit GTM', experience: [] }),
    getActivity: async () => [
      { type: 'post', url: 'https://li/1', text_snippet: 'on scaling franchise revenue', date: recent(5), topic_tags: ['gtm'] },
      { type: 'comment', url: 'https://li/2', text_snippet: 'HubSpot admin debt is real', date: recent(15), topic_tags: ['revops'] },
      { type: 'post', url: 'https://li/3', text_snippet: 'Sybill transformed our call review loop', date: recent(30), topic_tags: ['ai'] }
    ]
  };

  const candidate = { name: 'Doug Gabbard', title: 'Head of Growth', seniority: 'head', apollo_person_id: '1', linkedin_url: 'https://linkedin.com/in/dougegabbard' };
  const result = await enrichTarget({ candidate, apolloClient: apollo, brightDataClient: brightData });

  assert.equal(result.ok, true);
  assert.equal(result.data.email, 'doug@delightree.com');
  assert.equal(result.data.email_status, 'verified');
  assert.equal(result.data.recent_activity.length, 3);
});

test('enrichTarget: warns but proceeds on guessed email', async () => {
  const apollo = {
    matchPerson: async () => ({
      email: 'd@x.com', email_status: 'guessed',
      linkedin_url: 'https://linkedin.com/in/d',
      tenure_at_company_months: 10,
      prior_roles: [{ company: 'A', title: 'A' }, { company: 'B', title: 'B' }]
    })
  };
  const brightData = {
    getProfile: async () => ({ name: 'D', current_title: 't', about: 'x', experience: [] }),
    getActivity: async () => [
      { type: 'post', url: 'u1', text_snippet: 'x', date: recent(10), topic_tags: [] },
      { type: 'post', url: 'u2', text_snippet: 'y', date: recent(20), topic_tags: [] },
      { type: 'post', url: 'u3', text_snippet: 'z', date: recent(30), topic_tags: [] }
    ]
  };
  const candidate = { name: 'D', title: 't', apollo_person_id: '1', linkedin_url: 'https://linkedin.com/in/d' };
  const result = await enrichTarget({ candidate, apolloClient: apollo, brightDataClient: brightData });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some(w => /guessed/i.test(w)));
});

test('enrichTarget: hard-stops when < 3 posts/comments in 90 days', async () => {
  const apollo = {
    matchPerson: async () => ({
      email: 'd@x.com', email_status: 'verified',
      linkedin_url: 'https://linkedin.com/in/d',
      tenure_at_company_months: 10,
      prior_roles: [{}, {}]
    })
  };
  const brightData = {
    getProfile: async () => ({ name: 'D', current_title: 't', about: '', experience: [] }),
    getActivity: async () => [
      { type: 'post', url: 'u1', text_snippet: 'x', date: recent(10), topic_tags: [] }
    ]
  };
  const candidate = { name: 'D', title: 't', apollo_person_id: '1', linkedin_url: 'https://linkedin.com/in/d' };
  const result = await enrichTarget({ candidate, apolloClient: apollo, brightDataClient: brightData });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /no LinkedIn activity|low-signal/i.test(e)));
});

test('enrichTarget: hard-stops when no email returned', async () => {
  const apollo = {
    matchPerson: async () => ({ email: null, email_status: 'unknown', linkedin_url: 'https://linkedin.com/in/d', tenure_at_company_months: 5, prior_roles: [{}, {}] })
  };
  const brightData = { getProfile: async () => ({}), getActivity: async () => [{}, {}, {}] };
  const candidate = { name: 'X', title: 'Y', apollo_person_id: '1', linkedin_url: 'x' };
  const result = await enrichTarget({ candidate, apolloClient: apollo, brightDataClient: brightData });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /deliverable email/i.test(e)));
});

test('enrichTarget: hard-stops early when apollo_person_id missing', async () => {
  const apollo = { matchPerson: async () => { throw new Error('should not be called'); } };
  const brightData = { getProfile: async () => { throw new Error('should not be called'); }, getActivity: async () => { throw new Error('should not be called'); } };
  const candidate = { name: 'X', title: 'Y', linkedin_url: 'https://li/x' }; // no apollo_person_id
  const result = await enrichTarget({ candidate, apolloClient: apollo, brightDataClient: brightData });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /apollo_person_id/i.test(e)));
});

test('enrichTarget: no-email guard fires BEFORE Bright Data (no wasted API calls)', async () => {
  let brightCalls = 0;
  const apollo = {
    matchPerson: async () => ({ email: null, email_status: 'unknown', linkedin_url: 'https://li/x', tenure_at_company_months: 5, prior_roles: [] })
  };
  const brightData = {
    getProfile: async () => { brightCalls++; return {}; },
    getActivity: async () => { brightCalls++; return []; }
  };
  const candidate = { name: 'X', title: 'Y', apollo_person_id: '1', linkedin_url: 'https://li/x' };
  const result = await enrichTarget({ candidate, apolloClient: apollo, brightDataClient: brightData });
  assert.equal(result.ok, false);
  assert.equal(brightCalls, 0, 'Bright Data must not be called when email is missing');
});

test('enrichTarget: profile fetch failure surfaces profile-specific error', async () => {
  const apollo = {
    matchPerson: async () => ({ email: 'x@y.com', email_status: 'verified', linkedin_url: 'https://li/x', tenure_at_company_months: 5, prior_roles: [{}, {}] })
  };
  const brightData = {
    getProfile: async () => { throw new Error('profile scrape 503'); },
    getActivity: async () => [{}, {}, {}]
  };
  const candidate = { name: 'X', title: 'Y', apollo_person_id: '1', linkedin_url: 'https://li/x' };
  const result = await enrichTarget({ candidate, apolloClient: apollo, brightDataClient: brightData });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /profile fetch failed.*503/i.test(e)));
});

test('enrichTarget: activity fetch failure surfaces activity-specific error', async () => {
  const apollo = {
    matchPerson: async () => ({ email: 'x@y.com', email_status: 'verified', linkedin_url: 'https://li/x', tenure_at_company_months: 5, prior_roles: [{}, {}] })
  };
  const brightData = {
    getProfile: async () => ({ name: 'X', current_title: 'Y', about: '', experience: [] }),
    getActivity: async () => { throw new Error('activity scrape timeout'); }
  };
  const candidate = { name: 'X', title: 'Y', apollo_person_id: '1', linkedin_url: 'https://li/x' };
  const result = await enrichTarget({ candidate, apolloClient: apollo, brightDataClient: brightData });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /activity fetch failed.*timeout/i.test(e)));
});
