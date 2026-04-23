import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApolloClient } from './apollo.js';

function mockFetch(responses) {
  let i = 0;
  return async (url, opts) => {
    const r = responses[i++];
    if (r.throws) throw r.throws;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: new Map(Object.entries(r.headers || {})),
      async json() { return r.body; }
    };
  };
}

test('ApolloClient.searchPeople: returns ranked candidates', async () => {
  const fetchFn = mockFetch([{
    status: 200,
    body: {
      people: [
        { id: '1', name: 'Doug Gabbard', title: 'Head of Growth', seniority: 'head', organization: { name: 'Delightree' }, linkedin_url: 'https://linkedin.com/in/dougegabbard' },
        { id: '2', name: 'Jane Doe', title: 'VP RevOps', seniority: 'vp', organization: { name: 'Delightree' }, linkedin_url: 'https://linkedin.com/in/jane' },
        { id: '3', name: 'John Smith', title: 'Director of Growth Ops', seniority: 'director', organization: { name: 'Delightree' }, linkedin_url: 'https://linkedin.com/in/john' }
      ]
    }
  }]);
  const c = new ApolloClient({ apiKey: 'k', fetchFn });
  const result = await c.searchPeople({ company: 'Delightree', titles: ['Head of Growth', 'VP RevOps', 'Director of Growth Ops'] });
  assert.equal(result.candidates.length, 3);
  assert.equal(result.candidates[0].apollo_person_id, '1');
  assert.ok(result.candidates[0].rank_reason);
});

test('ApolloClient.searchPeople: auth error surfaces clearly', async () => {
  const fetchFn = mockFetch([{ status: 401, body: { error: 'Unauthorized' } }]);
  const c = new ApolloClient({ apiKey: 'bad', fetchFn });
  await assert.rejects(
    () => c.searchPeople({ company: 'x', titles: ['x'] }),
    /APOLLO_API_KEY/
  );
});

test('ApolloClient.searchPeople: rate limit surfaces retry-after', async () => {
  const fetchFn = mockFetch([{ status: 429, headers: { 'retry-after': '30' }, body: {} }]);
  const c = new ApolloClient({ apiKey: 'k', fetchFn });
  await assert.rejects(
    () => c.searchPeople({ company: 'x', titles: ['x'] }),
    /rate limit.*30/i
  );
});

test('ApolloClient.matchPerson: returns email + enrichment', async () => {
  const fetchFn = mockFetch([{
    status: 200,
    body: {
      person: {
        id: '1',
        email: 'doug@delightree.com',
        email_status: 'verified',
        linkedin_url: 'https://linkedin.com/in/dougegabbard',
        employment_history: [
          { organization_name: 'Delightree', title: 'Head of Growth', start_date: '2024-12-01' },
          { organization_name: 'Nextbite', title: 'Sr Director', start_date: '2021-01-01', end_date: '2024-11-30' },
          { organization_name: 'Ordermark', title: 'Sr Director', start_date: '2019-01-01', end_date: '2020-12-31' }
        ]
      }
    }
  }]);
  const c = new ApolloClient({ apiKey: 'k', fetchFn });
  const result = await c.matchPerson({ personId: '1' });
  assert.equal(result.email, 'doug@delightree.com');
  assert.equal(result.email_status, 'verified');
  assert.equal(result.prior_roles.length, 2);
  assert.ok(result.tenure_at_company_months >= 0);
});

test('ApolloClient.matchPerson: null person throws clearly', async () => {
  const fetchFn = mockFetch([{ status: 200, body: { person: null } }]);
  const c = new ApolloClient({ apiKey: 'k', fetchFn });
  await assert.rejects(
    () => c.matchPerson({ personId: 'missing' }),
    /no person found.*missing/i
  );
});

test('ApolloClient.matchPerson: auth error surfaces clearly', async () => {
  const fetchFn = mockFetch([{ status: 401, body: { error: 'Unauthorized' } }]);
  const c = new ApolloClient({ apiKey: 'bad', fetchFn });
  await assert.rejects(
    () => c.matchPerson({ personId: '1' }),
    /APOLLO_API_KEY/
  );
});

test('ApolloClient: rate limit without retry-after header uses default 60', async () => {
  const fetchFn = mockFetch([{ status: 429, headers: {}, body: {} }]);
  const c = new ApolloClient({ apiKey: 'k', fetchFn });
  await assert.rejects(
    () => c.searchPeople({ company: 'x', titles: ['x'] }),
    /rate limit.*60/i
  );
});

test('ApolloClient.matchPerson: empty employment_history → zero tenure, empty prior_roles', async () => {
  const fetchFn = mockFetch([{
    status: 200,
    body: {
      person: {
        id: '1',
        email: 'x@y.com',
        email_status: 'verified',
        linkedin_url: 'https://li/x',
        employment_history: []
      }
    }
  }]);
  const c = new ApolloClient({ apiKey: 'k', fetchFn });
  const result = await c.matchPerson({ personId: '1' });
  assert.equal(result.tenure_at_company_months, 0);
  assert.deepEqual(result.prior_roles, []);
});
