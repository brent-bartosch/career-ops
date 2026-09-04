// scrapers/snapshot-ledger.js
/**
 * Snapshot ledger reconcile logic. I/O-agnostic: operates on an injected
 * `store` (read/append/update) and an injected Bright Data `client`.
 *
 * Guarantees no Bright Data output is lost: every snapshot_id is recorded
 * before fetching; reconcile pulls ready snapshots (idempotently) and adopts
 * orphans the dataset knows about but the ledger doesn't.
 *
 * Row shape: { snapshot_id, trigger_time, inputs_summary, status, rows_captured, error }
 */

const TERMINAL = new Set(['fetched', 'failed']);

/**
 * True when a Bright Data error means the snapshot no longer exists (expired/
 * deleted → 404/"not found"), versus a transient auth/rate/network failure we
 * should retry on the next run. Marking "gone" snapshots terminal stops them
 * being re-polled and re-logged as errors on every future run.
 */
function isGone(error) {
  const m = String(error?.message || error || '');
  return /404|not found|expired|no such snapshot/i.test(m);
}

/**
 * Reconcile every non-terminal ledger row.
 * @param {object} args
 * @param {{read: Function, append: Function, update: Function}} args.store
 * @param {{getProgress: Function, fetchSnapshot: Function}} args.client
 * @param {(records: object[], snapshotId: string) => Promise<void>} args.onRecords
 */
export async function reconcile({ store, client, onRecords }) {
  const rows = await store.read();
  for (const row of rows) {
    if (TERMINAL.has(row.status)) continue;
    let status;
    try {
      status = await client.getProgress(row.snapshot_id);
    } catch (err) {
      if (isGone(err)) {
        await store.update(row.snapshot_id, { status: 'failed', error: `progress: ${err.message}` });
      } else {
        await store.update(row.snapshot_id, { error: `progress: ${err.message}` });
      }
      continue;
    }
    if (status === 'failed') {
      await store.update(row.snapshot_id, { status: 'failed' });
      continue;
    }
    if (status !== 'ready') {
      continue; // still running — leave untouched
    }
    // ready → fetch (idempotent; downstream dedups by job id)
    try {
      const records = await client.fetchSnapshot(row.snapshot_id);
      await onRecords(records, row.snapshot_id);
      await store.update(row.snapshot_id, { status: 'fetched', rows_captured: records.length, error: '' });
    } catch (err) {
      if (isGone(err)) {
        await store.update(row.snapshot_id, { status: 'failed', error: `fetch: ${err.message}` });
      } else {
        await store.update(row.snapshot_id, { status: 'ready', error: `fetch: ${err.message}` });
      }
    }
  }
}

/**
 * Adopt dataset snapshots that exist in Bright Data but are missing from the
 * ledger (covers a crash between trigger and ledger-write). Adopted rows enter
 * as 'triggered' so the next reconcile pass fetches them.
 * @param {object} args
 * @param {{read: Function, append: Function}} args.store
 * @param {{listSnapshots: Function}} args.client
 * @param {string} args.triggerTime
 */
export async function adoptOrphans({ store, client, triggerTime }) {
  let snaps;
  try {
    snaps = await client.listSnapshots();
  } catch {
    return; // backstop is best-effort; never block the run
  }
  const known = new Set((await store.read()).map(r => r.snapshot_id));
  const DEAD = new Set(['failed', 'expired', 'canceled', 'cancelled']);
  for (const s of snaps) {
    if (known.has(s.id)) continue;
    if (DEAD.has(s.status)) continue; // don't resurrect dead snapshots
    await store.append({
      snapshot_id: s.id,
      trigger_time: triggerTime,
      inputs_summary: 'orphan (adopted from dataset)',
      status: 'triggered',
      rows_captured: '',
      error: '',
    });
  }
}
