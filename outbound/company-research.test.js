import { test } from 'node:test';
import assert from 'node:assert/strict';
import { researchCompany } from './company-research.js';

test('researchCompany: aggregates site + search signals', async () => {
  const webFetcher = async (url) => {
    if (url.includes('delightree.com')) {
      return 'Delightree is an AI-powered platform for franchise operations. Customers: Pizza Express, The Picklr, Sandbox VR, Solidcore. Supports over 2,000 locations globally.';
    }
    return '';
  };
  const webSearcher = async (q) => {
    if (/funding/i.test(q)) return [{ title: 'Delightree raises $38M Series B', url: 'https://tc.com/x', snippet: 'Closed 2025-12-03', date: '2025-12-03' }];
    if (/customers|case study/i.test(q)) return [{ title: 'Case study: Pizza Express', url: 'https://d.com/pe', snippet: 'franchise ops', date: '2025-08-01' }];
    if (/news/i.test(q)) return [{ title: 'Delightree launches Collaborative Tasks', url: 'https://d.com/n', snippet: 'new feature', date: '2026-01-15' }];
    return [];
  };

  const result = await researchCompany({
    company: 'Delightree',
    jd_raw_text: 'The Franchise Operating System for multi-unit brands.',
    webFetcher,
    webSearcher
  });

  assert.equal(result.ok, true);
  assert.ok(result.data.product_description.length >= 200);
  assert.equal(result.data.funding_stage, 'Series B');
  assert.ok(result.data.customers.length >= 3);
  assert.ok(result.data.news.length >= 1);
});

test('researchCompany: hard-stops when < 3 customers findable', async () => {
  const webFetcher = async () => 'Short description.';
  const webSearcher = async (q) => {
    if (/funding/i.test(q)) return [{ title: 'Series A', url: 'x', snippet: '', date: '2025-01-01' }];
    if (/news/i.test(q)) return [{ title: 'Launch', url: 'x', snippet: '', date: '2026-02-01' }];
    return [];
  };
  const result = await researchCompany({
    company: 'Ghost',
    jd_raw_text: 'x',
    webFetcher,
    webSearcher
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /customer/i.test(e)));
});

test('researchCompany: hard-stops when no recent news', async () => {
  const webFetcher = async () => 'x'.repeat(250);
  const webSearcher = async (q) => {
    if (/funding/i.test(q)) return [{ title: 'Series A', url: 'x', snippet: '', date: '2025-01-01' }];
    if (/customers/i.test(q)) return [
      { title: 'A', url: 'a', snippet: '', date: '2024-01-01' },
      { title: 'B', url: 'b', snippet: '', date: '2024-01-01' },
      { title: 'C', url: 'c', snippet: '', date: '2024-01-01' }
    ];
    if (/news/i.test(q)) return [{ title: 'Old', url: 'x', snippet: '', date: '2023-01-01' }];
    return [];
  };
  const result = await researchCompany({ company: 'X', jd_raw_text: 'x', webFetcher, webSearcher });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /news/i.test(e)));
});

test('researchCompany: undated news items are filtered out, not stamped with today', async () => {
  const webFetcher = async () => 'x'.repeat(250);
  const webSearcher = async (q) => {
    if (/funding/i.test(q)) return [{ title: 'Series A', url: 'x', snippet: '', date: '2025-06-01' }];
    if (/customer/i.test(q)) return [
      { title: 'A', url: 'a', snippet: '', date: '2025-06-01' },
      { title: 'B', url: 'b', snippet: '', date: '2025-06-01' },
      { title: 'C', url: 'c', snippet: '', date: '2025-06-01' }
    ];
    if (/news/i.test(q)) return [
      { title: 'Undated news item', url: 'https://x', snippet: '' /* no date */ },
      { title: 'Also undated', url: 'https://y', snippet: '', date: undefined }
    ];
    return [];
  };
  const result = await researchCompany({ company: 'X', jd_raw_text: 'x', webFetcher, webSearcher });
  // With zero dated news items, validator should hard-stop on news freshness
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /news/i.test(e)), `Expected news hard stop. Errors: ${JSON.stringify(result.errors)}`);
});
