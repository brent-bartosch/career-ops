import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintDraft, RULES } from './voice-lint.js';

test('lintDraft: passes a clean draft', () => {
  const body = 'Doug — your stack (HubSpot + Sybill + QuotaPath + Equals) says you bought in on AI-in-the-workflow, not AI-in-the-margins. Wired that exact shape at a $30M B2B SaaS: API-direct HubSpot, 8-stage pipeline engine, ICP scoring across 7 cohorts, LLM-drafted rep activity feeding CRM without manual entry. HubSpot-native and engineering-first — same problem space the JD describes. Could we chat this week?\n\nBest, Brent';
  const result = lintDraft(body);
  assert.equal(result.pass, true, JSON.stringify(result));
});

test('lintDraft: rejects emoji', () => {
  const body = 'Doug — your stack rocks 🚀. ' + 'x '.repeat(60);
  const result = lintDraft(body);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some(f => /emoji/i.test(f)));
});

test('lintDraft: rejects banned corp-speak', () => {
  const body = 'Doug — I am passionate about leveraging synergies to spearhead cutting-edge solutions. ' + 'x '.repeat(50);
  const result = lintDraft(body);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some(f => /passionate about/i.test(f)));
  assert.ok(result.failures.some(f => /leverag/i.test(f)));
});

test('lintDraft: rejects generic praise openers', () => {
  const body = 'Great post! ' + 'x '.repeat(60);
  const result = lintDraft(body);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some(f => /praise opener/i.test(f)));
});

test('lintDraft: rejects word counts outside 60-80', () => {
  const tooShort = 'x '.repeat(30);
  const r1 = lintDraft(tooShort);
  assert.equal(r1.pass, false);
  assert.ok(r1.failures.some(f => /word count/i.test(f)));

  const tooLong = 'x '.repeat(100);
  const r2 = lintDraft(tooLong);
  assert.equal(r2.pass, false);
  assert.ok(r2.failures.some(f => /word count/i.test(f)));
});

test('lintDraft: requires anchored specificity (number or named tool)', () => {
  const vague = 'Doug — your work is interesting. I build systems for sales teams. Happy to chat. ' + 'x '.repeat(60);
  const result = lintDraft(vague);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some(f => /specificity/i.test(f)));
});

test('lintDraft: accepts named tool as specificity anchor', () => {
  const body = 'Doug — you use HubSpot as system of record. I built a pipeline engine integrated with HubSpot for a B2B SaaS. Happy to chat about the approach this week. ' + 'word '.repeat(30);
  const result = lintDraft(body);
  // must pass specificity + no banned phrases; word count may or may not land in window depending on padding
  assert.equal(result.failures.some(f => /specificity/i.test(f)), false);
});

test('lintDraft: rejects multi-paragraph trailing CTA', () => {
  const body = 'Doug — your HubSpot stack is strong. Built a pipeline engine at a $30M SaaS. Happy to chat.\n\nP.S. Would love to share the writeup.\n\nAlso attached is my portfolio.';
  const result = lintDraft(body);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some(f => /trailing/i.test(f)));
});

test('lintDraft: accepts 2 body paragraphs with signoff on own line', () => {
  const body = 'Doug — your stack (HubSpot + Sybill + QuotaPath + Equals) says you bought in on AI-in-the-workflow, not AI-in-the-margins.\n\nWired that exact shape at a $30M B2B SaaS: API-direct HubSpot, 8-stage pipeline engine, ICP scoring, LLM-drafted rep activity. Could we chat this week?\n\nBest, Brent';
  const result = lintDraft(body);
  // Should NOT fail on trailing-cta — signoff doesn't count as a body paragraph
  assert.equal(result.failures.some(f => /trailing/i.test(f)), false, JSON.stringify(result));
});

test('lintDraft: spearheaded triggers only one banned-phrase failure', () => {
  const body = 'Doug — I spearheaded our GTM at HubSpot. ' + 'x '.repeat(55);
  const result = lintDraft(body);
  const spearFailures = result.failures.filter(f => /spearhead/i.test(f));
  assert.equal(spearFailures.length, 1, JSON.stringify(result));
});

test('RULES exports a readable list', () => {
  assert.ok(Array.isArray(RULES));
  assert.ok(RULES.length >= 6);
});
