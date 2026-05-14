import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDrafts, buildPrompts } from './draft.js';

function mockLLM(variantBodies) {
  let i = 0;
  return async (_prompt) => {
    const body = variantBodies[i++];
    return JSON.stringify({
      subject: 'Quick question re: your HubSpot stack',
      body
    });
  };
}

const cleanBody = `Doug — your stack (HubSpot + Sybill + QuotaPath + Equals) tells me you've bought into AI-in-the-workflow thinking. Wired that exact shape at a $30M SaaS: API-direct HubSpot, 8-stage pipeline engine, LLM-drafted rep activity feeding CRM without manual entry. No spreadsheets, no logging overhead — reps just sell. Built in Node, 10,300 LOC. Could we find 20 minutes this week?\n\nBest, Brent`;

test('buildPrompts: produces 3 distinct anchor prompts', () => {
  const prompts = buildPrompts({
    jd: { title: 't', company_name: 'Delightree', required: ['HubSpot'], responsibilities: ['own stack'] },
    company: { product_description: 'x'.repeat(200), customers: ['A', 'B', 'C'], news: [{ title: 'launched Feature X', date: '2026-03-01', url: 'u', summary: 's' }] },
    target: { name: 'Doug', title: 'Head of Growth', recent_activity: [{ type: 'post', url: 'u', text_snippet: 'scaling CS with AI', date: '2026-04-10' }] },
    proofs: [{ jd_bullet: 'HubSpot', proof_text: 'Trial engine — 10,300 LOC', source_file: 'x', specificity_score: 5 }]
  });
  assert.equal(prompts.length, 3);
  assert.match(prompts[0], /customer|ICP/i);
  assert.match(prompts[1], /post|activity/i);
  assert.match(prompts[2], /news|product/i);
});

test('generateDrafts: returns 3 lint-passing variants', async () => {
  const llm = mockLLM([cleanBody, cleanBody, cleanBody]);
  const result = await generateDrafts({
    jd: { title: 't', company_name: 'D', required: ['HubSpot'], responsibilities: ['own stack'] },
    company: { product_description: 'x'.repeat(200), customers: ['A', 'B', 'C'], news: [{ title: 'launched', date: '2026-03-01', url: 'u', summary: 's' }] },
    target: { name: 'Doug', title: 'Head of Growth', recent_activity: [{ type: 'post', url: 'u', text_snippet: 'scaling', date: '2026-04-10' }] },
    proofs: [{ jd_bullet: 'HubSpot', proof_text: 'Trial engine — 10,300 LOC', source_file: 'x', specificity_score: 5 }],
    llmFn: llm
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.drafts.length, 3);
  for (const d of result.data.drafts) {
    assert.ok(d.word_count <= 80);
    assert.ok(d.word_count >= 1);
  }
});

test('generateDrafts: regenerates once on lint failure, hard-stops on second', async () => {
  const bad = 'I am passionate about synergies. ' + 'x '.repeat(60);
  const llm = mockLLM([bad, bad, cleanBody, cleanBody, cleanBody, cleanBody]);
  const result = await generateDrafts({
    jd: { title: 't', company_name: 'D', required: ['HubSpot'], responsibilities: ['own stack'] },
    company: { product_description: 'x'.repeat(200), customers: ['A', 'B', 'C'], news: [{ title: 'launched', date: '2026-03-01', url: 'u', summary: 's' }] },
    target: { name: 'Doug', title: 'Head of Growth', recent_activity: [{ type: 'post', url: 'u', text_snippet: 'scaling', date: '2026-04-10' }] },
    proofs: [{ jd_bullet: 'HubSpot', proof_text: 'Trial engine — 10,300 LOC', source_file: 'x', specificity_score: 5 }],
    llmFn: llm
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /voice rule|banned/i.test(e)));
});

test('generateDrafts: parse failure on both attempts surfaces JSON error in hard-stop', async () => {
  // LLM returns non-JSON both times for variant A
  let i = 0;
  const garbageLLM = async () => {
    i++;
    return i <= 2 ? 'This is not JSON at all' : JSON.stringify({ subject: 's', body: 'filler' });
  };
  const result = await generateDrafts({
    jd: { title: 't', company_name: 'D', required: ['HubSpot'], responsibilities: ['own stack'] },
    company: { product_description: 'x'.repeat(200), customers: ['A', 'B', 'C'], news: [{ title: 'launched', date: '2026-03-01', url: 'u', summary: 's' }] },
    target: { name: 'Doug', title: 'Head of Growth', recent_activity: [{ type: 'post', url: 'u', text_snippet: 'scaling', date: '2026-04-10' }] },
    proofs: [{ jd_bullet: 'HubSpot', proof_text: 'Trial engine — 10,300 LOC', source_file: 'x', specificity_score: 5 }],
    llmFn: garbageLLM
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /JSON parse error/i.test(e)), `Expected JSON parse error in: ${JSON.stringify(result.errors)}`);
});
