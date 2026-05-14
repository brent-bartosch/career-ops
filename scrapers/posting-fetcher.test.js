import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseJobDescription } from './posting-fetcher.js';

describe('parseJobDescription', () => {
  it('extracts text content from Greenhouse-style HTML', () => {
    const html = `
      <html><body>
        <nav>Navigation stuff</nav>
        <div id="content">
          <h2>About the Role</h2>
          <p>We are looking for a Senior Engineer to join our platform team.</p>
          <h2>Requirements</h2>
          <ul>
            <li>5+ years of experience</li>
            <li>Strong background in distributed systems</li>
            <li>Excellent communication skills</li>
          </ul>
          <h2>Benefits</h2>
          <p>Competitive salary and equity package.</p>
        </div>
        <footer>Footer stuff</footer>
      </body></html>
    `;
    const result = parseJobDescription(html);
    assert.ok(result.text.includes('Senior Engineer'));
    assert.ok(result.text.includes('5+ years of experience'));
    assert.ok(result.text.includes('distributed systems'));
    assert.ok(!result.text.includes('Navigation stuff'));
    assert.ok(!result.text.includes('Footer stuff'));
  });

  it('extracts location when available', () => {
    const html = `
      <html><body>
        <div class="location">Remote - US</div>
        <div id="content">
          <p>This is a job description with enough text to pass the minimum character threshold for content selection.</p>
        </div>
      </body></html>
    `;
    const result = parseJobDescription(html);
    assert.equal(result.location, 'Remote - US');
  });

  it('returns empty text for empty HTML string', () => {
    const result = parseJobDescription('');
    assert.equal(result.text, '');
    assert.equal(result.location, null);
  });
});
