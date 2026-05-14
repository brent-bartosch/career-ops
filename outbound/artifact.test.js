import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeArtifact, readArtifact, appendTouch, slugify, nextReportNumber } from './artifact.js';

async function withTmp(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'outbound-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('slugify: normalizes company names', () => {
  assert.equal(slugify('Delightree, Inc.'), 'delightree-inc');
  assert.equal(slugify('Acme & Co'), 'acme-co');
});

test('writeArtifact: creates file with frontmatter and sections', async () => {
  await withTmp(async (dir) => {
    const path = await writeArtifact({
      outreachDir: dir,
      num: '047',
      date: '2026-04-22',
      company: 'Delightree',
      role: 'Manager GTM Engineering',
      oferta_score: '4.3/5',
      target: { name: 'Doug Gabbard', title: 'Head of Growth', email: 'doug@delightree.com', email_status: 'verified', linkedin_url: 'https://li/d', tenure_at_company_months: 14 },
      alternates: [{ name: 'Jane', title: 'VP', linkedin_url: 'https://li/j' }],
      schedule: { t0: '2026-04-22', t_plus_3: '2026-04-27', t_plus_7: '2026-05-01' },
      company_dossier: { product_description: 'x', customers: ['A', 'B', 'C'], news: [] },
      target_dossier: { recent_activity: [] },
      proofs: [],
      touch1: {
        variants: [
          { subject: 's1', body: 'b1', word_count: 60, anchor_type: 'a', anchor_source_url: 'u' },
          { subject: 's2', body: 'b2', word_count: 65, anchor_type: 'b', anchor_source_url: 'u' },
          { subject: 's3', body: 'b3', word_count: 70, anchor_type: 'c', anchor_source_url: 'u' }
        ],
        chosen_index: 1,
        edits: 'swapped "your" for "the"',
        sent_at: '2026-04-22T15:00:00Z'
      }
    });

    const content = await readFile(path, 'utf8');
    assert.match(content, /^---\n/);
    assert.match(content, /num: 047/);
    assert.match(content, /target:\n\s+name: Doug Gabbard/);
    assert.match(content, /## Company Dossier/);
    assert.match(content, /## Touch 1 \(T0\)/);
    assert.match(content, /### Variants/);
  });
});

test('readArtifact: parses frontmatter back', async () => {
  await withTmp(async (dir) => {
    const path = await writeArtifact({
      outreachDir: dir, num: '001', date: '2026-04-22',
      company: 'Acme', role: 'RevOps', oferta_score: '4.0/5',
      target: { name: 'x', title: 'y', email: 'x@x.com', email_status: 'verified', linkedin_url: 'u', tenure_at_company_months: 5 },
      alternates: [], schedule: { t0: '2026-04-22', t_plus_3: '2026-04-27', t_plus_7: '2026-05-01' },
      company_dossier: {}, target_dossier: {}, proofs: [],
      touch1: { variants: [], chosen_index: null, edits: '', sent_at: null }
    });
    const parsed = await readArtifact(path);
    assert.equal(parsed.frontmatter.num, '001');
    assert.equal(parsed.frontmatter.company, 'Acme');
    assert.equal(parsed.frontmatter.status, 'Outreach Drafted');
  });
});

test('appendTouch: adds Touch 2 section without disturbing frontmatter', async () => {
  await withTmp(async (dir) => {
    const path = await writeArtifact({
      outreachDir: dir, num: '001', date: '2026-04-22',
      company: 'A', role: 'r', oferta_score: '4.0/5',
      target: { name: 'x', title: 'y', email: 'e', email_status: 'verified', linkedin_url: 'u', tenure_at_company_months: 5 },
      alternates: [], schedule: { t0: '2026-04-22', t_plus_3: '2026-04-27', t_plus_7: '2026-05-01' },
      company_dossier: {}, target_dossier: {}, proofs: [],
      touch1: { variants: [], chosen_index: 0, edits: '', sent_at: '2026-04-22T15:00:00Z' }
    });
    await appendTouch(path, {
      touchNumber: 2,
      offsetLabel: 'T+3',
      new_signal: 'Delightree launched Collaborative Tasks on 2026-04-24',
      variants: [
        { subject: 's', body: 'b', word_count: 60, anchor_type: 'news_product', anchor_source_url: 'u' }
      ],
      chosen_index: 0,
      sent_at: '2026-04-27T15:00:00Z'
    });
    const content = await readFile(path, 'utf8');
    assert.match(content, /## Touch 2 \(T\+3\)/);
    assert.match(content, /Collaborative Tasks/);
  });
});

test('nextReportNumber: scans existing files and returns max+1, zero-padded', async () => {
  await withTmp(async (dir) => {
    await writeFile(join(dir, '003-acme-2026-04-01.md'), '---\nnum: 003\n---');
    await writeFile(join(dir, '041-delightree-2026-04-22.md'), '---\nnum: 041\n---');
    const next = await nextReportNumber(dir);
    assert.equal(next, '042');
  });
});

test('writeArtifact: throws on empty/missing company', async () => {
  await withTmp(async (dir) => {
    await assert.rejects(
      writeArtifact({
        outreachDir: dir, num: '001', date: '2026-04-22',
        company: '', role: 'r', oferta_score: '4.0/5',
        target: { name: 'x', title: 'y', email: 'e', email_status: 'verified', linkedin_url: 'u', tenure_at_company_months: 5 },
        alternates: [], schedule: {}, company_dossier: {}, target_dossier: {}, proofs: [],
        touch1: { variants: [], chosen_index: null, edits: '', sent_at: null }
      }),
      /company is required/i
    );
  });
});

test('writeArtifact: throws on missing target', async () => {
  await withTmp(async (dir) => {
    await assert.rejects(
      writeArtifact({
        outreachDir: dir, num: '001', date: '2026-04-22',
        company: 'X', role: 'r', oferta_score: '4.0/5',
        alternates: [], schedule: {}, company_dossier: {}, target_dossier: {}, proofs: [],
        touch1: { variants: [], chosen_index: null, edits: '', sent_at: null }
      }),
      /target is required/i
    );
  });
});
