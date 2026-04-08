import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQueries,
  parseGoogleResults,
  extractCompanyFromUrl,
  extractCompanyFromTitle,
  deduplicatePostings,
} from './serp-scanner.js';

describe('buildQueries', () => {
  const templates = {
    platforms: {
      greenhouse: { site_filter: 'site:boards.greenhouse.io' },
      lever: { site_filter: 'site:jobs.lever.co' },
    },
    archetypes: {
      revops: {
        label: 'A — RevOps Leader',
        keywords: ['revenue operations', 'sales operations'],
      },
      solutions: {
        label: 'B — Solutions Architect',
        keywords: ['solutions architect'],
      },
    },
  };

  it('builds correct SERP queries from archetype x platform matrix', () => {
    const queries = buildQueries(templates);

    // Check that a specific expected query exists
    const match = queries.find(
      (q) =>
        q.query === '"revenue operations" site:boards.greenhouse.io' &&
        q.archetype === 'revops' &&
        q.platform === 'greenhouse' &&
        q.keyword === 'revenue operations'
    );
    assert.ok(match, 'expected query not found');
  });

  it('produces correct cartesian product count', () => {
    const queries = buildQueries(templates);
    // 2 archetypes: revops has 2 keywords, solutions has 1 = 3 keywords total
    // 2 platforms
    // 3 * 2 = 6
    assert.equal(queries.length, 6);
  });
});

describe('extractCompanyFromUrl', () => {
  it('handles Greenhouse URLs', () => {
    assert.equal(
      extractCompanyFromUrl('https://boards.greenhouse.io/acme-corp/jobs/123'),
      'acme corp'
    );
  });

  it('handles Lever URLs', () => {
    assert.equal(
      extractCompanyFromUrl('https://jobs.lever.co/stripe/abc-123'),
      'stripe'
    );
  });

  it('handles Ashby URLs', () => {
    assert.equal(
      extractCompanyFromUrl('https://jobs.ashbyhq.com/notion/job-456'),
      'notion'
    );
  });

  it('handles Workday URLs', () => {
    assert.equal(
      extractCompanyFromUrl('https://salesforce.myworkdayjobs.com/en-US/jobs/123'),
      'salesforce'
    );
  });

  it('handles Wellfound URLs', () => {
    assert.equal(
      extractCompanyFromUrl('https://wellfound.com/company/linear/jobs/456'),
      'linear'
    );
  });

  it('returns null for unknown patterns', () => {
    assert.equal(extractCompanyFromUrl('https://example.com/jobs/123'), null);
    assert.equal(extractCompanyFromUrl('https://google.com/search?q=test'), null);
  });
});

describe('extractCompanyFromTitle', () => {
  it('handles "Role at Company" pattern', () => {
    assert.equal(extractCompanyFromTitle('Software Engineer at Stripe'), 'Stripe');
  });

  it('handles "Company is hiring" pattern', () => {
    assert.equal(
      extractCompanyFromTitle('Notion is hiring a Product Manager'),
      'Notion'
    );
  });

  it('handles "Role - Company" pattern', () => {
    assert.equal(
      extractCompanyFromTitle('Data Analyst - Airbnb'),
      'Airbnb'
    );
  });

  it('returns null if no match', () => {
    assert.equal(extractCompanyFromTitle('Some random title'), null);
  });
});

describe('deduplicatePostings', () => {
  it('removes duplicates by company+title+location', () => {
    const postings = [
      { company: 'Stripe', title: 'SWE', location: 'SF', url: 'a' },
      { company: 'stripe', title: 'SWE', location: 'sf', url: 'b' },
      { company: 'Notion', title: 'PM', location: 'NYC', url: 'c' },
    ];
    const result = deduplicatePostings(postings);
    assert.equal(result.length, 2);
    // Keeps first occurrence
    assert.equal(result[0].url, 'a');
    assert.equal(result[1].url, 'c');
  });

  it('keeps all unique postings', () => {
    const postings = [
      { company: 'A', title: 'X', location: '1', url: 'u1' },
      { company: 'B', title: 'Y', location: '2', url: 'u2' },
    ];
    const result = deduplicatePostings(postings);
    assert.equal(result.length, 2);
  });
});

describe('parseGoogleResults', () => {
  it('parses standard Google result divs', () => {
    const html = `
      <html><body>
        <div class="g">
          <a href="https://boards.greenhouse.io/acme/jobs/1"><h3>SWE at Acme</h3></a>
          <div class="VwiC3b">Great opportunity at Acme Corp</div>
        </div>
        <div class="g">
          <a href="https://jobs.lever.co/stripe/abc"><h3>PM at Stripe</h3></a>
          <div class="VwiC3b">Join the Stripe team</div>
        </div>
      </body></html>
    `;
    const results = parseGoogleResults(html);
    assert.equal(results.length, 2);
    assert.equal(results[0].url, 'https://boards.greenhouse.io/acme/jobs/1');
    assert.equal(results[0].title, 'SWE at Acme');
    assert.equal(results[1].url, 'https://jobs.lever.co/stripe/abc');
  });

  it('filters out google.com links', () => {
    const html = `
      <html><body>
        <div class="g">
          <a href="https://google.com/something"><h3>Google link</h3></a>
          <div class="VwiC3b">A google result</div>
        </div>
        <div class="g">
          <a href="https://boards.greenhouse.io/acme/jobs/1"><h3>Real job</h3></a>
          <div class="VwiC3b">Real snippet</div>
        </div>
      </body></html>
    `;
    const results = parseGoogleResults(html);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'Real job');
  });

  it('handles Google redirect URLs by extracting q param', () => {
    const html = `
      <html><body>
        <div class="g">
          <a href="https://www.google.com/url?q=https://jobs.lever.co/stripe/abc&sa=U"><h3>PM at Stripe</h3></a>
          <div class="VwiC3b">Stripe role</div>
        </div>
      </body></html>
    `;
    const results = parseGoogleResults(html);
    assert.equal(results.length, 1);
    assert.equal(results[0].url, 'https://jobs.lever.co/stripe/abc');
  });
});
