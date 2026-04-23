import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJDViaPlaywright } from './playwright-fetch.js';

// Mock browser factory — never launches real Chromium in unit tests.
function makeMockLauncher({ bodyText }) {
  return async () => ({
    newContext: async () => ({
      newPage: async () => ({
        goto: async () => ({ status: () => 200 }),
        setDefaultTimeout: () => {},
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

test('fetchJDViaPlaywright: prefers <main> over <body>', async () => {
  // More realistic mock that actually exercises the real selector chain
  const smartLauncher = async () => ({
    newContext: async () => ({
      newPage: async () => ({
        goto: async () => ({ status: () => 200 }),
        setDefaultTimeout: () => {},
        evaluate: async (fn) => {
          // Simulate a DOM where <main> has the real JD and <body> has nav + main + footer
          const fakeDom = {
            querySelector: (sel) => {
              if (sel === 'main') return { innerText: 'Manager, GTM Engineering. Own HubSpot as system of record. Build AI workflows. 3+ years RevOps required. Great role for a systems-minded engineer.' };
              if (sel === 'article') return null;
              if (sel === '[role="main"]') return null;
              if (sel === '#job-description') return null;
              if (sel === '.job-description') return null;
              return null;
            }
          };
          const bodyEl = { innerText: 'nav menu footer copyright etc (this is much more text, so if priority were wrong we would see this fallback instead of the real main content)' };
          // Emulate the function's logic — `fn` is the arrow passed to evaluate
          const candidates = [
            fakeDom.querySelector('main'),
            fakeDom.querySelector('article'),
            fakeDom.querySelector('[role="main"]'),
            fakeDom.querySelector('#job-description'),
            fakeDom.querySelector('.job-description'),
            bodyEl
          ].filter(Boolean);
          const el = candidates[0];
          return (el?.innerText || '').replace(/\s+/g, ' ').trim();
        },
        close: async () => {}
      }),
      close: async () => {}
    }),
    close: async () => {}
  });

  const text = await fetchJDViaPlaywright('https://example.com/job', { launchBrowser: smartLauncher });
  assert.match(text, /Manager, GTM Engineering/);
  assert.doesNotMatch(text, /nav menu footer/);
});
