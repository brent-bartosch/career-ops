import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePostedDate } from './parse-posted-date.js';

// Fixed reference date for deterministic tests
const NOW = new Date('2026-04-20T12:00:00.000Z');

describe('parsePostedDate', () => {
  it('parses "N days ago"', () => {
    assert.equal(parsePostedDate('3 days ago', NOW), '2026-04-17');
  });

  it('parses "1 day ago"', () => {
    assert.equal(parsePostedDate('1 day ago', NOW), '2026-04-19');
  });

  it('parses "N hours ago" as today', () => {
    assert.equal(parsePostedDate('6 hours ago', NOW), '2026-04-20');
  });

  it('parses "N minutes ago" as today', () => {
    assert.equal(parsePostedDate('15 minutes ago', NOW), '2026-04-20');
  });

  it('parses "N weeks ago"', () => {
    assert.equal(parsePostedDate('2 weeks ago', NOW), '2026-04-06');
  });

  it('parses "N months ago" as 30-day approximation', () => {
    assert.equal(parsePostedDate('2 months ago', NOW), '2026-02-19');
  });

  it('parses "today"', () => {
    assert.equal(parsePostedDate('today', NOW), '2026-04-20');
  });

  it('parses "yesterday"', () => {
    assert.equal(parsePostedDate('yesterday', NOW), '2026-04-19');
  });

  it('passes through ISO dates', () => {
    assert.equal(parsePostedDate('2026-04-15', NOW), '2026-04-15');
  });

  it('parses absolute date strings like "Apr 15, 2026"', () => {
    assert.equal(parsePostedDate('Apr 15, 2026', NOW), '2026-04-15');
  });

  it('parses absolute date strings like "April 15, 2026"', () => {
    assert.equal(parsePostedDate('April 15, 2026', NOW), '2026-04-15');
  });

  it('returns null for unparseable input', () => {
    assert.equal(parsePostedDate('bananas', NOW), null);
  });

  it('returns null for null/empty input', () => {
    assert.equal(parsePostedDate(null, NOW), null);
    assert.equal(parsePostedDate('', NOW), null);
    assert.equal(parsePostedDate(undefined, NOW), null);
  });

  it('is case-insensitive', () => {
    assert.equal(parsePostedDate('3 DAYS AGO', NOW), '2026-04-17');
    assert.equal(parsePostedDate('Yesterday', NOW), '2026-04-19');
  });
});
