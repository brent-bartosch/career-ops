import axios from 'axios';
import * as cheerio from 'cheerio';

const LOCATION_SELECTORS = [
  '.location',
  '[class*="location"]',
  '[data-qa="job-location"]',
  '.posting-categories .sort-by-time',
  '.workplaceTypes',
];

const CONTENT_SELECTORS = [
  '#content',
  '.content-intro',
  '.posting-page',
  '[class*="job-description"]',
  '[class*="jobDescription"]',
  '.section-wrapper',
  'article',
  '.job-post',
  '[data-qa="job-description"]',
  '.ashby-job-posting-brief-description',
];

const REMOVE_ELEMENTS = ['script', 'style', 'nav', 'footer', 'header'];

/**
 * Parse job description text and location from an ATS page's HTML.
 * Works across Greenhouse, Lever, Ashby, and generic pages.
 */
export function parseJobDescription(html) {
  if (!html || !html.trim()) {
    return { text: '', location: null };
  }

  const $ = cheerio.load(html);

  // Remove noise elements
  for (const tag of REMOVE_ELEMENTS) {
    $(tag).remove();
  }

  // Extract location
  let location = null;
  for (const selector of LOCATION_SELECTORS) {
    const el = $(selector).first();
    if (el.length) {
      const loc = el.text().trim();
      if (loc) {
        location = loc;
        break;
      }
    }
  }

  // Try content-specific selectors first
  let text = '';
  for (const selector of CONTENT_SELECTORS) {
    const el = $(selector).first();
    if (el.length) {
      const content = el.text().trim();
      if (content.length > 100) {
        text = content;
        break;
      }
    }
  }

  // Fallback to body text
  if (!text) {
    text = $('body').text().trim();
  }

  // Clean up whitespace: collapse multiple whitespace to single space
  text = text.replace(/\s+/g, ' ').trim();

  return { text, location };
}

/**
 * Fetch a job posting page and extract the description.
 */
export async function fetchPosting(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 15_000,
    });

    const { text, location } = parseJobDescription(response.data);
    return { text, location, success: true };
  } catch (err) {
    return {
      text: '',
      location: null,
      success: false,
      error: err.message,
    };
  }
}
