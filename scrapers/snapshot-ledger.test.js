// scrapers/snapshot-ledger.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, adoptOrphans } from './snapshot-ledger.js';

/** In-memory store mimicking the _runs tab. */
function memStore(initial = []) {
  const rows = initial.map(r => ({ ...r }));
  return {
    rows,
    async read() { return rows.map(r => ({ ...r })); },
    async append(row) { rows.push({ ...row }); },
    async update(snapshotId, patch) {
      const r = rows.find(x => x.snapshot_id === snapshotId);
      if (r) Object.assign(r, patch);
    },
  };
}

test('reconcile: fetches a ready snapshot, emits records, marks fetched', async () => {
  const store = memStore([{ snapshot_id: 's1', status: 'triggered', rows_captured: '' }]);
  const client = {
    async getProgress() { return 'ready'; },
    async fetchSnapshot() { return [{ job_posting_id: 'a' }, { job_posting_id: 'b' }]; },
  };
  const emitted = [];
  await reconcile({ store, client, onRecords: async (recs, snap) => { emitted.push([snap, recs.length]); } });
  assert.deepEqual(emitted, [['s1', 2]]);
  const row = (await store.read())[0];
  assert.equal(row.status, 'fetched');
  assert.equal(row.rows_captured, 2);
});

test('reconcile: re-fetches a row stuck in ready-but-not-fetched', async () => {
  const store = memStore([{ snapshot_id: 's2', status: 'ready', rows_captured: '' }]);
  const client = {
    async getProgress() { return 'ready'; },
    async fetchSnapshot() { return [{ job_posting_id: 'x' }]; },
  };
  let emittedCount = 0;
  await reconcile({ store, client, onRecords: async (recs) => { emittedCount += recs.length; } });
  assert.equal(emittedCount, 1);
  assert.equal((await store.read())[0].status, 'fetched');
});

test('reconcile: marks failed snapshots failed and does not emit', async () => {
  const store = memStore([{ snapshot_id: 's3', status: 'triggered' }]);
  const client = { async getProgress() { return 'failed'; }, async fetchSnapshot() { throw new Error('should not fetch'); } };
  let emitted = 0;
  await reconcile({ store, client, onRecords: async () => { emitted++; } });
  assert.equal(emitted, 0);
  assert.equal((await store.read())[0].status, 'failed');
});

test('reconcile: leaves still-running snapshots untouched', async () => {
  const store = memStore([{ snapshot_id: 's4', status: 'triggered' }]);
  const client = { async getProgress() { return 'running'; }, async fetchSnapshot() { throw new Error('nope'); } };
  await reconcile({ store, client, onRecords: async () => {} });
  assert.equal((await store.read())[0].status, 'triggered');
});

test('reconcile: skips already-fetched rows', async () => {
  const store = memStore([{ snapshot_id: 's5', status: 'fetched' }]);
  let progressCalls = 0;
  const client = { async getProgress() { progressCalls++; return 'ready'; }, async fetchSnapshot() { return []; } };
  await reconcile({ store, client, onRecords: async () => {} });
  assert.equal(progressCalls, 0);
});

test('adoptOrphans: appends ledger rows for dataset snapshots missing from the ledger', async () => {
  const store = memStore([{ snapshot_id: 's1', status: 'fetched' }]);
  const client = { async listSnapshots() { return [{ id: 's1', status: 'ready' }, { id: 's2', status: 'ready' }]; } };
  await adoptOrphans({ store, client, triggerTime: '2026-06-09T00:00:00Z' });
  const ids = (await store.read()).map(r => r.snapshot_id).sort();
  assert.deepEqual(ids, ['s1', 's2']);
  const adopted = (await store.read()).find(r => r.snapshot_id === 's2');
  assert.equal(adopted.status, 'triggered');     // re-enter reconcile loop next pass
  assert.match(adopted.inputs_summary, /orphan/i);
});
