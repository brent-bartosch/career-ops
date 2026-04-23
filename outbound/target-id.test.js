import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifyTargets, inferTitleFilter } from './target-id.js';

test('inferTitleFilter: maps GTM/RevOps JDs to hiring-manager titles', () => {
  const f1 = inferTitleFilter('Manager, GTM Engineering & Revenue Systems');
  assert.ok(f1.includes('Head of Growth') || f1.includes('VP RevOps'));
  assert.ok(f1.length >= 3);
});

test('identifyTargets: returns 3+ candidates from Apollo', async () => {
  const mockApollo = {
    searchPeople: async () => ({
      candidates: [
        { name: 'Doug', title: 'Head of Growth', seniority: 'head', apollo_person_id: '1', linkedin_url: 'https://li/d', rank_reason: 'head tier' },
        { name: 'Jane', title: 'VP RevOps', seniority: 'vp', apollo_person_id: '2', linkedin_url: 'https://li/j', rank_reason: 'vp tier' },
        { name: 'John', title: 'Director of Growth Ops', seniority: 'director', apollo_person_id: '3', linkedin_url: 'https://li/jo', rank_reason: 'director tier' }
      ]
    })
  };
  const result = await identifyTargets({ company: 'Delightree', jdTitle: 'GTM Engineer', apolloClient: mockApollo });
  assert.equal(result.ok, true);
  assert.ok(result.data.candidates.length >= 3);
});

test('identifyTargets: hard-stops when Apollo returns < 3', async () => {
  const mockApollo = {
    searchPeople: async () => ({ candidates: [{ name: 'x', title: 'y', seniority: 'head', apollo_person_id: '1', linkedin_url: '', rank_reason: 'x' }] })
  };
  const result = await identifyTargets({ company: 'Ghost', jdTitle: 'x', apolloClient: mockApollo });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /broaden title filter/i.test(e)));
});

test('identifyTargets: surfaces Apollo auth error clearly', async () => {
  const mockApollo = {
    searchPeople: async () => { throw new Error('APOLLO_API_KEY missing or invalid'); }
  };
  const result = await identifyTargets({ company: 'x', jdTitle: 'y', apolloClient: mockApollo });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /APOLLO_API_KEY/i.test(e)));
});

test('inferTitleFilter: defaults to GTM for unrecognized JD title', () => {
  const f = inferTitleFilter('Senior Data Engineer');
  // Default branch returns same array as an explicit RevOps match
  assert.deepStrictEqual(f, inferTitleFilter('VP RevOps'));
  assert.ok(f.includes('VP RevOps'));
  assert.ok(f.includes('Head of Growth'));
});
