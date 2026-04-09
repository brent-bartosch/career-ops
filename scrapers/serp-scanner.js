/**
 * serp-scanner.js — SERP scanning engine
 *
 * Builds Google search queries from a YAML template matrix,
 * fetches SERPs, parses results with cheerio, extracts company
 * names from ATS URL patterns, and deduplicates postings.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import yaml from 'js-yaml';
import { readFile } from 'fs/promises';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Build the cartesian product of archetypes x keywords x platforms.
 * @param {{ platforms: Object, archetypes: Object }} templates
 * @returns {Array<{ query: string, archetype: string, platform: string, keyword: string }>}
 */
export function buildQueries(templates) {
  const { platforms, archetypes } = templates;
  const queries = [];

  for (const [archetypeKey, archetype] of Object.entries(archetypes)) {
    for (const keyword of archetype.keywords) {
      for (const [platformKey, platform] of Object.entries(platforms)) {
        queries.push({
          query: `"${keyword}" ${platform.site_filter}`,
          archetype: archetypeKey,
          platform: platformKey,
          keyword,
        });
      }
    }
  }

  return queries;
}

/**
 * Parse Google SERP HTML and extract results.
 * @param {string} html
 * @returns {Array<{ url: string, title: string, snippet: string }>}
 */
export function parseGoogleResults(html) {
  const $ = cheerio.load(html);
  const results = [];

  // Standard selectors for Google result blocks
  const selectors = ['div.g', 'div[data-sokoban-container]'];
  const selector = selectors.join(', ');

  $(selector).each((_, el) => {
    const $el = $(el);
    const anchor = $el.find('a').first();
    let url = anchor.attr('href') || '';
    const title = $el.find('h3').first().text().trim();
    const snippet = $el.find('.VwiC3b, .st, .lEBKkf').first().text().trim();

    if (!url || !title) return;

    // Handle Google redirect URLs — extract the actual destination
    if (url.includes('google.com/url')) {
      try {
        const parsed = new URL(url);
        const q = parsed.searchParams.get('q');
        if (q) {
          url = q;
        } else {
          return; // Can't extract real URL, skip
        }
      } catch {
        return;
      }
    }

    // Filter out google.com links
    try {
      const host = new URL(url).hostname;
      if (host.includes('google.com')) return;
    } catch {
      return;
    }

    results.push({ url, title, snippet });
  });

  // Fallback: if standard parsing found nothing, look for bare ATS links
  if (results.length === 0) {
    const atsPatterns = [
      'boards.greenhouse.io',
      'jobs.lever.co',
      'jobs.ashbyhq.com',
      'myworkdayjobs.com',
      'wellfound.com',
    ];

    $('a[href]').each((_, el) => {
      let href = $(el).attr('href') || '';

      // Handle Google redirect URLs
      if (href.includes('google.com/url')) {
        try {
          const parsed = new URL(href);
          const q = parsed.searchParams.get('q');
          if (q) href = q;
          else return;
        } catch {
          return;
        }
      }

      const matchesAts = atsPatterns.some((p) => href.includes(p));
      if (!matchesAts) return;

      try {
        const host = new URL(href).hostname;
        if (host.includes('google.com')) return;
      } catch {
        return;
      }

      const title = $(el).text().trim() || '';
      results.push({ url: href, title, snippet: '' });
    });
  }

  return results;
}

/**
 * Extract company name from ATS URL patterns.
 * @param {string} url
 * @returns {string|null}
 */
export function extractCompanyFromUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const path = parsed.pathname.replace(/^\//, '').split('/');

    // Greenhouse: boards.greenhouse.io/<company>/...
    if (host === 'boards.greenhouse.io' && path[0]) {
      return path[0].replace(/-/g, ' ');
    }

    // Lever: jobs.lever.co/<company>/...
    if (host === 'jobs.lever.co' && path[0]) {
      return path[0].replace(/-/g, ' ');
    }

    // Ashby: jobs.ashbyhq.com/<company>/...
    if (host === 'jobs.ashbyhq.com' && path[0]) {
      return path[0].replace(/-/g, ' ');
    }

    // Workday: <company>.myworkdayjobs.com/...
    if (host.endsWith('.myworkdayjobs.com')) {
      const company = host.replace('.myworkdayjobs.com', '');
      return company.replace(/-/g, ' ');
    }

    // Wellfound: wellfound.com/company/<company>/...
    if (host === 'wellfound.com' && path[0] === 'company' && path[1]) {
      return path[1].replace(/-/g, ' ');
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fallback company extraction from job title strings.
 * Handles: "Role at Company", "Company is hiring", "Role - Company"
 * @param {string} title
 * @returns {string|null}
 */
export function extractCompanyFromTitle(title) {
  if (!title) return null;

  // "Role at Company" — take everything after last " at "
  const atMatch = title.match(/\bat\s+(.+)$/i);
  if (atMatch) return atMatch[1].trim();

  // "Company is hiring ..." — take everything before " is hiring"
  const hiringMatch = title.match(/^(.+?)\s+is\s+hiring/i);
  if (hiringMatch) return hiringMatch[1].trim();

  // "Role - Company" — take everything after last " - "
  const dashMatch = title.match(/\s+-\s+(.+)$/);
  if (dashMatch) return dashMatch[1].trim();

  return null;
}

/**
 * Deduplicate postings by lowercase company|title|location key.
 * Keeps first occurrence.
 * @param {Array<Object>} postings
 * @returns {Array<Object>}
 */
export function deduplicatePostings(postings) {
  const seen = new Set();
  const unique = [];

  for (const posting of postings) {
    const company = (posting.company || '').toLowerCase();
    const title = (posting.title || '').toLowerCase();
    const location = (posting.location || '').toLowerCase();
    const key = `${company}|${title}|${location}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(posting);
    }
  }

  return unique;
}

/**
 * Fetch Google SERP results via Serper API.
 * Returns structured JSON — no HTML parsing needed.
 * @param {string} query
 * @returns {Promise<{ success: boolean, results?: Array<{ url: string, title: string, snippet: string }>, error?: string }>}
 */
export async function fetchSerp(query) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'SERPER_API_KEY not set in environment' };
  }

  try {
    const resp = await axios.post(
      'https://google.serper.dev/search',
      { q: query, num: 20, tbs: 'qdr:m' },
      {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      },
    );

    const organic = resp.data.organic || [];
    const results = organic.map((item) => ({
      url: item.link || '',
      title: item.title || '',
      snippet: item.snippet || '',
      postedDate: item.date || null,
    }));

    return { success: true, results };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Load and parse a YAML template file.
 * @param {string} filePath
 * @returns {Promise<Object>}
 */
export async function loadTemplates(filePath) {
  const raw = await readFile(filePath, 'utf-8');
  return yaml.load(raw);
}

/**
 * Full scan cycle.
 * @param {string} templatesPath - Path to YAML templates file
 * @param {{ delayMs?: number, platforms?: string[] }} options
 * @returns {Promise<Array<Object>>}
 */
export async function runScan(templatesPath, options = {}) {
  const { delayMs = 2000, platforms: allowedPlatforms } = options;

  const templates = await loadTemplates(templatesPath);
  let queries = buildQueries(templates);

  // Filter to requested platforms if specified
  if (allowedPlatforms && allowedPlatforms.length > 0) {
    queries = queries.filter((q) => allowedPlatforms.includes(q.platform));
  }

  const allPostings = [];

  for (const q of queries) {
    const { success, results: serpResults, error } = await fetchSerp(q.query);

    if (!success) {
      console.error(`SERP fetch failed for "${q.query}": ${error}`);
      continue;
    }

    for (const result of serpResults) {
      const company =
        extractCompanyFromUrl(result.url) ||
        extractCompanyFromTitle(result.title);

      allPostings.push({
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        postedDate: result.postedDate,
        company,
        platform: q.platform,
        archetype: q.archetype,
        keyword: q.keyword,
        foundAt: new Date().toISOString(),
      });
    }

    // Delay between requests to avoid triggering Google rate limits
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return deduplicatePostings(allPostings);
}
