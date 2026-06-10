// scrapers/linkedin-jobs-client.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LinkedInJobsClient } from './linkedin-jobs-client.js';

function mockFetch(seq) {
  const calls = [];
  let i = 0;
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const r = seq[i++];
    return { ok: r.status < 300, status: r.status, async json() { return r.body; } };
  };
  fn.calls = calls;
  return fn;
}

test('trigger: posts inputs to discover endpoint and returns snapshot_id', async () => {
  const fetchFn = mockFetch([{ status: 200, body: { snapshot_id: 'snap-9' } }]);
  const c = new LinkedInJobsClient({ apiKey: 'k', datasetId: 'gd_x', fetchFn });
  const id = await c.trigger([{ keyword: 'GTM engineer', location: 'United States' }]);
  assert.equal(id, 'snap-9');
  const { url, opts } = fetchFn.calls[0];
  assert.match(url, /\/datasets\/v3\/trigger\?/);
  assert.match(url, /dataset_id=gd_x/);
  assert.match(url, /type=discover_new/);
  assert.match(url, /discover_by=keyword/);
  assert.equal(opts.method, 'POST');
  assert.match(opts.headers.Authorization, /Bearer k/);
});

test('getProgress: returns status string', async () => {
  const fetchFn = mockFetch([{ status: 200, body: { status: 'ready' } }]);
  const c = new LinkedInJobsClient({ apiKey: 'k', datasetId: 'gd_x', fetchFn });
  assert.equal(await c.getProgress('snap-9'), 'ready');
});

test('fetchSnapshot: returns array of records', async () => {
  const fetchFn = mockFetch([{ status: 200, body: [{ job_posting_id: '1' }, { job_posting_id: '2' }] }]);
  const c = new LinkedInJobsClient({ apiKey: 'k', datasetId: 'gd_x', fetchFn });
  const rows = await c.fetchSnapshot('snap-9');
  assert.equal(rows.length, 2);
});

test('fetchSnapshot: coerces a single object to an array', async () => {
  const fetchFn = mockFetch([{ status: 200, body: { job_posting_id: '1' } }]);
  const c = new LinkedInJobsClient({ apiKey: 'k', datasetId: 'gd_x', fetchFn });
  const rows = await c.fetchSnapshot('snap-9');
  assert.deepEqual(rows, [{ job_posting_id: '1' }]);
});

test('listSnapshots: returns snapshot ids for the dataset', async () => {
  const fetchFn = mockFetch([{ status: 200, body: [{ id: 'snap-1', status: 'ready' }, { id: 'snap-2', status: 'running' }] }]);
  const c = new LinkedInJobsClient({ apiKey: 'k', datasetId: 'gd_x', fetchFn });
  const snaps = await c.listSnapshots();
  assert.deepEqual(snaps.map(s => s.id), ['snap-1', 'snap-2']);
});

test('auth error (401) surfaces clearly', async () => {
  const fetchFn = mockFetch([{ status: 401, body: {} }]);
  const c = new LinkedInJobsClient({ apiKey: 'bad', datasetId: 'gd_x', fetchFn });
  await assert.rejects(() => c.trigger([{}]), /BRIGHT_DATA_API_KEY/);
});
