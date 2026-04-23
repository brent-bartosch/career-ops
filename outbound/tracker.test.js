import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeTrackerAddition, buildNote } from './tracker.js';

test('buildNote: short one-liner', () => {
  const n = buildNote({ target: { name: 'Doug Gabbard', title: 'Head of Growth' }, touch: 1, date: '2026-04-22' });
  assert.match(n, /Outbound → Doug Gabbard/);
  assert.match(n, /T0/);
});

test('writeTrackerAddition: emits 9-column TSV with correct order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tracker-'));
  try {
    const path = await writeTrackerAddition({
      additionsDir: dir,
      num: '047', date: '2026-04-22',
      company: 'Delightree', role: 'Manager, GTM Engineering',
      status: 'Outreach Sent',
      score: '4.3/5',
      pdf: false,
      reportLink: 'outreach/047-delightree-2026-04-22.md',
      note: 'Outbound → Doug Gabbard (Head of Growth). T0 sent 2026-04-22.'
    });
    const content = await readFile(path, 'utf8');
    const cols = content.trim().split('\t');
    assert.equal(cols.length, 9);
    assert.equal(cols[0], '047');
    assert.equal(cols[1], '2026-04-22');
    assert.equal(cols[2], 'Delightree');
    assert.equal(cols[3], 'Manager, GTM Engineering');
    assert.equal(cols[4], 'Outreach Sent');
    assert.equal(cols[5], '4.3/5');
    assert.equal(cols[6], '❌');
    assert.match(cols[7], /^\[047\]\(outreach\//);
    assert.match(cols[8], /Outbound → Doug Gabbard/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
