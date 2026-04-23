import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJDViaPlaywright } from './playwright-fetch.js';

// Mock browser factory — never launches real Chromium in unit tests.
function makeMockLauncher({ bodyText, contentType = 'text/html' }) {
  return async () => ({
    newContext: async () => ({
      newPage: async () => ({
        goto: async () => ({ status: () => 200 }),
        content: async () => bodyText,
        evaluate: async (fn) => {
          // Simulate the inner-text extraction path
          return bodyText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        },
        close: async () => {}
      }),
      close: async () => {}
    }),
    close: async () => {}
  });
}

test('fetchJDViaPlaywright: extracts inner text from HTML', async () => {
  const html = '<html><body><main><h1>Manager, GTM Engineering</h1><p>Own HubSpot as system of record. Build AI workflows. 3+ years RevOps required.</p></main></body></html>';
  const text = await fetchJDViaPlaywright('https://example.com/job', {
    launchBrowser: makeMockLauncher({ bodyText: html })
  });
  assert.match(text, /Manager, GTM Engineering/);
  assert.match(text, /HubSpot/);
  assert.ok(text.length >= 50);
});

test('fetchJDViaPlaywright: fails loudly on empty body', async () => {
  await assert.rejects(
    () => fetchJDViaPlaywright('https://example.com/empty', {
      launchBrowser: makeMockLauncher({ bodyText: '' })
    }),
    /empty|no content/i
  );
});
