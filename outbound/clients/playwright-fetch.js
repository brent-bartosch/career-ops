/**
 * Playwright-based JD fallback fetcher.
 *
 * Used by jd-ingest.js when WebFetch returns 403, an empty body, or a bot wall.
 * Reuses the headless Chromium pattern from generate-pdf.mjs.
 */

import { chromium } from 'playwright';

export async function fetchJDViaPlaywright(url, { launchBrowser = chromium.launch.bind(chromium), timeoutMs = 30000 } = {}) {
  const browser = await launchBrowser({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await ctx.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    // Heuristic: prefer <main>, <article>, or the largest text block.
    const innerText = await page.evaluate(() => {
      const candidates = [
        document.querySelector('main'),
        document.querySelector('article'),
        document.querySelector('[role="main"]'),
        document.querySelector('#job-description'),
        document.querySelector('.job-description'),
        document.body
      ].filter(Boolean);
      const el = candidates[0];
      return (el?.innerText || '').replace(/\s+/g, ' ').trim();
    });

    if (!innerText || innerText.length < 50) {
      throw new Error(`Playwright fetch returned empty/no content body for ${url}`);
    }
    return innerText;
  } finally {
    await ctx.close();
    await browser.close();
  }
}
