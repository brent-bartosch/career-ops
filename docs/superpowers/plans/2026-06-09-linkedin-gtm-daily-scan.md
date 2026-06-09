# LinkedIn GTM Daily Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a daily LinkedIn job scan for GTM Engineering / Head of GTM roles that pulls postings via Bright Data async snapshots, scores them with the existing `scoring/` modules, and surfaces new postings in a visual Google Sheet with a snapshot ledger — then deploy it as a Railway cron.

**Architecture:** A standalone pipeline (separate from the SERP `postings.json` hopper). A jobs client wraps Bright Data's async discover API (`trigger → progress → snapshot`, never the sync `/scrape`). A source module builds the keyword×location input matrix, chunks it, and normalizes Bright Data records into the posting shape the scoring modules already consume. A snapshot ledger (a `_runs` tab in the Sheet) records every snapshot_id before fetching and reconciles pending/orphaned snapshots each run, so output is never lost. A Sheets writer dedupes by LinkedIn job id and renders visual rows (`=IMAGE` logos, `=HYPERLINK` title/company/apply).

**Tech Stack:** Node.js (ESM `.mjs`/`.js`), `node --test` + `node:assert/strict`, `js-yaml`, `googleapis`, Bright Data Dataset API, OpenRouter (existing classifier), Railway cron.

---

## Reference: existing code this plan reuses

- `outbound/clients/bright-data.js` — async flow pattern (`trigger → progress → snapshot`). We write a **jobs-specific** client (different endpoint params: `type=discover_new&discover_by=keyword`), not reuse this one directly.
- `scoring/archetype-matcher.js` — `matchArchetypes({title, snippet}) → string[]`. We add two archetypes.
- `scoring/intent-scorer.js` — `scoreIntent(posting) → {score, factors}` (title-agnostic). Used as-is.
- `scoring/llm-classifier.js` — `classifyPosting(posting, {apiKey, fetchFn}) → Promise<object|null>`. Used as-is.
- `scoring/parse-posted-date.js` — `parsePostedDate(raw, now) → "YYYY-MM-DD"|null`. Used as-is.
- `scrapers/push-to-sheets.js` — Sheets auth + write pattern (file-based service account). We extract a shared env-or-file auth helper and write a **new** visual writer rather than overloading this file.
- Test pattern: `node:test` + `assert/strict` + a `mockFetch(seq)` returning `{ ok, status, json() }` (see `outbound/clients/bright-data.test.js`).
- Fixture: `Linkedin Jobs/keyword_output_linkedin_jobs.JSON` (a real Bright Data jobs record).

## File structure (what gets created / modified)

**Create:**
- `scrapers/linkedin-queries.yml` — discovery config (dataset id, locations, archetype keywords).
- `scrapers/linkedin-jobs-client.js` — Bright Data jobs discover client (trigger/progress/snapshot/listSnapshots). Pure API, injectable `fetchFn`.
- `scrapers/linkedin-source.js` — `buildInputs`, `chunk`, `normalizeRecord` (BD record → posting).
- `scrapers/snapshot-ledger.js` — pure reconcile logic over an injected ledger store + client.
- `scrapers/sheets-auth.js` — `getAuthClient()` supporting env JSON **or** key file.
- `scrapers/linkedin-sheets.js` — visual row builder + dedup + main-tab/`_runs`-tab read/write.
- `scrapers/linkedin-scan.js` — orchestrator entrypoint (`node scrapers/linkedin-scan.js`).
- Tests: `scrapers/linkedin-jobs-client.test.js`, `scrapers/linkedin-source.test.js`, `scrapers/snapshot-ledger.test.js`, `scrapers/linkedin-sheets.test.js`.
- `Dockerfile` (Phase 2, Railway).

**Modify:**
- `scoring/archetype-matcher.js` — add `gtm_engineer` + `head_of_gtm` archetypes.
- `scoring/archetype-matcher.test.js` — add GTM fixtures.
- `package.json` — register new test files in `test` script; add `scan:linkedin` script.
- `.env.example` — add Bright Data jobs + sheets env vars.
- `outbound/README.md` or a new `scrapers/README.md` section — run/deploy docs (Phase 2).

---

# PHASE 1 — Build & validate content (local)

## Task 1: Discovery config file

**Files:**
- Create: `scrapers/linkedin-queries.yml`

- [ ] **Step 1: Write the config**

```yaml
# scrapers/linkedin-queries.yml
# Bright Data LinkedIn Jobs discovery config for the daily GTM scan.
# The input matrix = (discovery_archetypes' keywords) × locations.
dataset_id: gd_lpfll7v5hcqtkxl6l
chunk_size: 5
defaults:
  country: US
  time_range: "Past 24 hours"   # daily cadence
  experience_level: ""           # do not over-filter; rely on scoring
locations:
  - { label: la_hybrid,          location: "Los Angeles",   remote: "Hybrid",  job_type: "Full-time" }
  - { label: la_onsite,          location: "Los Angeles",   remote: "On-site", job_type: "Full-time" }
  - { label: remote_us_ft,       location: "United States", remote: "Remote",  job_type: "Full-time" }
  - { label: remote_us_contract, location: "United States", remote: "Remote",  job_type: "Contract" }
  - { label: la_contract,        location: "Los Angeles",   remote: "",        job_type: "Contract" }
# Only these archetypes are *discovered* (cost control). Classification still
# tags ALL archetypes in scoring/archetype-matcher.js.
discovery_archetypes: [gtm_engineer, head_of_gtm]
archetypes:
  gtm_engineer:
    keywords:
      - "GTM engineer"
      - "go-to-market engineer"
      - "growth engineer"
      - "marketing engineer"
      - "automation engineer"
      - "revenue operations engineer"
      - "GTM systems"
      - "GTM automation"
      - "forward deployed engineer"
  head_of_gtm:
    keywords:
      - "head of GTM"
      - "head of go-to-market"
      - "VP GTM"
      - "founding GTM"
      - "head of growth"
      - "head of revenue"
      - "GTM lead"
```

- [ ] **Step 2: Commit**

```bash
git add scrapers/linkedin-queries.yml
git commit -m "feat(linkedin): add GTM discovery query config"
```

---

## Task 2: Input matrix builder + chunker

**Files:**
- Create: `scrapers/linkedin-source.js`
- Test: `scrapers/linkedin-source.test.js`

- [ ] **Step 1: Write the failing test (buildInputs + chunk)**

```javascript
// scrapers/linkedin-source.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInputs, chunk } from './linkedin-source.js';

const CONFIG = {
  defaults: { country: 'US', time_range: 'Past 24 hours', experience_level: '' },
  locations: [
    { label: 'remote_us_ft', location: 'United States', remote: 'Remote', job_type: 'Full-time' },
    { label: 'la_contract', location: 'Los Angeles', remote: '', job_type: 'Contract' },
  ],
  discovery_archetypes: ['gtm_engineer'],
  archetypes: {
    gtm_engineer: { keywords: ['GTM engineer', 'growth engineer'] },
    head_of_gtm: { keywords: ['head of GTM'] }, // not in discovery_archetypes
  },
};

test('buildInputs: cartesian of discovery keywords × locations with defaults applied', () => {
  const inputs = buildInputs(CONFIG);
  // 2 keywords × 2 locations = 4 inputs (head_of_gtm excluded — not in discovery_archetypes)
  assert.equal(inputs.length, 4);
  const first = inputs[0];
  assert.equal(first.keyword, 'GTM engineer');
  assert.equal(first.location, 'United States');
  assert.equal(first.remote, 'Remote');
  assert.equal(first.job_type, 'Full-time');
  assert.equal(first.country, 'US');
  assert.equal(first.time_range, 'Past 24 hours');
  // Bright Data requires these keys present (empty allowed)
  assert.equal(first.company, '');
  assert.equal(first.location_radius, '');
  assert.equal(first.experience_level, '');
  // provenance carried for normalization (stripped before sending)
  assert.equal(first._archetype, 'gtm_engineer');
  assert.equal(first._locationLabel, 'remote_us_ft');
});

test('chunk: splits an array into groups of size n', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 5), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scrapers/linkedin-source.test.js`
Expected: FAIL — `Cannot find module './linkedin-source.js'` / exports undefined.

- [ ] **Step 3: Implement buildInputs + chunk**

```javascript
// scrapers/linkedin-source.js
/**
 * LinkedIn jobs source: builds the Bright Data discover input matrix and
 * normalizes returned records into the posting shape the scoring modules use.
 */

/**
 * Build the Bright Data discover-by-keyword input array:
 * cartesian product of (discovery_archetypes' keywords) × locations.
 * Provenance keys (_archetype, _locationLabel) are attached for normalization
 * and MUST be stripped before sending to Bright Data (see toApiInput).
 * @param {object} config - parsed linkedin-queries.yml
 * @returns {Array<object>}
 */
export function buildInputs(config) {
  const { defaults = {}, locations = [], discovery_archetypes = [], archetypes = {} } = config;
  const inputs = [];
  for (const archKey of discovery_archetypes) {
    const keywords = archetypes[archKey]?.keywords || [];
    for (const keyword of keywords) {
      for (const loc of locations) {
        inputs.push({
          location: loc.location || '',
          keyword,
          country: defaults.country || '',
          time_range: defaults.time_range || '',
          job_type: loc.job_type || '',
          experience_level: defaults.experience_level || '',
          remote: loc.remote || '',
          company: '',
          location_radius: '',
          _archetype: archKey,
          _locationLabel: loc.label || '',
        });
      }
    }
  }
  return inputs;
}

/**
 * Strip provenance keys (underscore-prefixed) so the object matches the
 * exact Bright Data input schema.
 * @param {object} input
 * @returns {object}
 */
export function toApiInput(input) {
  const clean = {};
  for (const [k, v] of Object.entries(input)) {
    if (!k.startsWith('_')) clean[k] = v;
  }
  return clean;
}

/**
 * Split an array into chunks of size n.
 * @param {Array} arr
 * @param {number} n
 * @returns {Array<Array>}
 */
export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scrapers/linkedin-source.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scrapers/linkedin-source.js scrapers/linkedin-source.test.js
git commit -m "feat(linkedin): input matrix builder + chunker"
```

---

## Task 3: Normalizer (Bright Data record → posting)

**Files:**
- Modify: `scrapers/linkedin-source.js`
- Test: `scrapers/linkedin-source.test.js`

- [ ] **Step 1: Write the failing test**

Append to `scrapers/linkedin-source.test.js`:

```javascript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeRecord } from './linkedin-source.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE = JSON.parse(
  readFileSync(join(__dirname, '..', 'Linkedin Jobs', 'keyword_output_linkedin_jobs.JSON'), 'utf-8')
)[0];

test('normalizeRecord: maps a Bright Data jobs record to the posting shape', () => {
  const meta = { archetype: 'gtm_engineer', locationLabel: 'remote_us_ft', snapshotId: 'snap-1' };
  const p = normalizeRecord(SAMPLE, meta);
  assert.equal(p.jobId, '4425460450');
  assert.equal(p.title, 'System Administrator - IT Support');
  assert.equal(p.company, 'TAC Security');
  assert.equal(p.url, SAMPLE.url);
  assert.equal(p.platform, 'linkedin');
  assert.ok(p.description.length > 100);          // full JD text present
  assert.ok(p.snippet.length > 0 && p.snippet.length <= 320);
  assert.equal(p.location, 'Chandigarh, India');
  assert.equal(p.employmentType, 'Full-time');
  assert.equal(p.applicants, 52);
  assert.equal(p.seniority, 'Associate');
  assert.equal(p.logo, SAMPLE.company_logo);
  assert.equal(p.companyUrl, SAMPLE.company_url);
  assert.equal(p.posterName, 'Hitesh **');
  assert.equal(p.discoveryArchetype, 'gtm_engineer');
  assert.equal(p.snapshotId, 'snap-1');
  // postedDate prefers the ISO field
  assert.equal(p.postedDate, '2026-06-08T07:21:34.927Z');
});

test('normalizeRecord: applyLink falls back to job url when apply_link is null', () => {
  const p = normalizeRecord({ ...SAMPLE, apply_link: null }, {});
  assert.equal(p.applyLink, SAMPLE.url);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scrapers/linkedin-source.test.js`
Expected: FAIL — `normalizeRecord` is not exported.

- [ ] **Step 3: Implement normalizeRecord**

Append to `scrapers/linkedin-source.js`:

```javascript
/**
 * Normalize a Bright Data LinkedIn jobs record into the posting shape consumed
 * by scoring/* and linkedin-sheets.js.
 * @param {object} r - raw Bright Data jobs record
 * @param {{archetype?: string, locationLabel?: string, snapshotId?: string}} meta
 * @returns {object} posting
 */
export function normalizeRecord(r, meta = {}) {
  const description = (r.job_summary || '').trim();
  return {
    jobId: String(r.job_posting_id || ''),
    title: r.job_title || '',
    company: r.company_name || '',
    url: r.url || '',
    platform: 'linkedin',
    description,
    snippet: description.slice(0, 320),
    // parse-posted-date handles both ISO and "53 minutes ago"; prefer ISO
    postedDate: r.job_posted_date || r.job_posted_time || '',
    postedRaw: r.job_posted_time || '',
    location: r.job_location || '',
    employmentType: r.job_employment_type || '',
    salary: r.job_base_pay_range || r.base_salary || '',
    applicants: typeof r.job_num_applicants === 'number' ? r.job_num_applicants : '',
    seniority: r.job_seniority_level || '',
    logo: r.company_logo || '',
    companyUrl: r.company_url || '',
    applyLink: r.apply_link || r.url || '',
    posterName: r.job_poster?.name || '',
    posterUrl: r.job_poster?.url || '',
    isEasyApply: Boolean(r.is_easy_apply),
    discoveryArchetype: meta.archetype || '',
    discoveryLocation: meta.locationLabel || '',
    snapshotId: meta.snapshotId || '',
    foundAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scrapers/linkedin-source.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scrapers/linkedin-source.js scrapers/linkedin-source.test.js
git commit -m "feat(linkedin): normalize Bright Data jobs record to posting shape"
```

---

## Task 4: Bright Data jobs client (async discover)

**Files:**
- Create: `scrapers/linkedin-jobs-client.js`
- Test: `scrapers/linkedin-jobs-client.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scrapers/linkedin-jobs-client.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client**

```javascript
// scrapers/linkedin-jobs-client.js
/**
 * Bright Data LinkedIn *jobs* discover client (async snapshot flow).
 *
 * Discover-by-keyword: POST inputs to /trigger → poll /progress → GET /snapshot.
 * We deliberately use the ASYNC endpoints (not sync /scrape): the sync endpoint
 * streams results in one response and silently loses data on timeout/drop. With
 * async, every job is a durable snapshot_id, re-fetchable until pulled.
 *
 * API key + dataset id are injected (constructor or env BRIGHT_DATA_API_KEY /
 * BRIGHT_DATA_JOBS_DATASET_ID).
 */

const BASE = 'https://api.brightdata.com';

export class LinkedInJobsClient {
  constructor({
    apiKey,
    datasetId = process.env.BRIGHT_DATA_JOBS_DATASET_ID,
    fetchFn = fetch,
  } = {}) {
    this.apiKey = apiKey;
    this.datasetId = datasetId;
    this.fetch = fetchFn;
  }

  _headers() {
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' };
  }

  async _guard(stage, res) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('BRIGHT_DATA_API_KEY missing or invalid');
    }
    if (!res.ok) {
      let body = '(no body)';
      try { body = JSON.stringify(await res.json()).slice(0, 200); } catch { /* non-JSON */ }
      throw new Error(`Bright Data ${stage} failed: ${res.status} — ${body}`);
    }
  }

  /**
   * Trigger a discover-by-keyword job. Returns the snapshot_id.
   * @param {Array<object>} inputs - Bright Data input objects (already API-clean)
   * @returns {Promise<string>}
   */
  async trigger(inputs) {
    if (!this.datasetId) throw new Error('BRIGHT_DATA_JOBS_DATASET_ID missing');
    const qs = new URLSearchParams({
      dataset_id: this.datasetId,
      include_errors: 'true',
      type: 'discover_new',
      discover_by: 'keyword',
      notify: 'false',
    });
    const res = await this.fetch(`${BASE}/datasets/v3/trigger?${qs}`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ input: inputs }),
    });
    await this._guard('trigger', res);
    const body = await res.json();
    if (!body.snapshot_id) throw new Error('Bright Data trigger returned no snapshot_id');
    return body.snapshot_id;
  }

  /** @returns {Promise<string>} status: 'running' | 'ready' | 'failed' | ... */
  async getProgress(snapshotId) {
    const res = await this.fetch(`${BASE}/datasets/v3/progress/${snapshotId}`, { headers: this._headers() });
    await this._guard('progress', res);
    const body = await res.json();
    return body.status;
  }

  /**
   * Fetch the COMPLETE snapshot. Coerces a single object to an array.
   * @returns {Promise<Array<object>>}
   */
  async fetchSnapshot(snapshotId) {
    const res = await this.fetch(`${BASE}/datasets/v3/snapshot/${snapshotId}?format=json`, { headers: this._headers() });
    await this._guard('snapshot', res);
    const body = await res.json();
    if (Array.isArray(body)) return body;
    if (body && typeof body === 'object') return [body];
    return [];
  }

  /**
   * List recent snapshots for the dataset (orphan-adoption backstop).
   * @returns {Promise<Array<{id: string, status: string}>>}
   */
  async listSnapshots() {
    const res = await this.fetch(`${BASE}/datasets/v3/snapshots?dataset_id=${this.datasetId}`, { headers: this._headers() });
    await this._guard('snapshots', res);
    const body = await res.json();
    const arr = Array.isArray(body) ? body : [];
    return arr.map(s => ({ id: s.id || s.snapshot_id, status: s.status })).filter(s => s.id);
  }
}
```

> **Verify during implementation (Open Question §13 of spec):** confirm the exact `/datasets/v3/snapshots` list path/shape and whether very large snapshots paginate (`?part=` / `format=jsonl`). If they paginate, extend `fetchSnapshot` to loop parts. The async trigger/progress/snapshot endpoints are confirmed by `outbound/clients/bright-data.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scrapers/linkedin-jobs-client.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add scrapers/linkedin-jobs-client.js scrapers/linkedin-jobs-client.test.js
git commit -m "feat(linkedin): Bright Data jobs discover client (async snapshots)"
```

---

## Task 5: Snapshot ledger + reconciler (pure logic)

**Files:**
- Create: `scrapers/snapshot-ledger.js`
- Test: `scrapers/snapshot-ledger.test.js`

The ledger is I/O-agnostic: it operates on an injected `store` (read/append/update rows) and an injected `client`. The orchestrator (Task 8) wires the real Sheet-backed store. Row shape:
`{ snapshot_id, trigger_time, inputs_summary, status, rows_captured, error }`.
Status values: `triggered` → `ready` (seen ready, not yet fetched) → `fetched` | `failed`.

- [ ] **Step 1: Write the failing test**

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scrapers/snapshot-ledger.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the ledger logic**

```javascript
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

const TERMINAL = new Set(['fetched']);

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
      await store.update(row.snapshot_id, { error: `progress: ${err.message}` });
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
      await store.update(row.snapshot_id, { status: 'ready', error: `fetch: ${err.message}` });
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
  for (const s of snaps) {
    if (known.has(s.id)) continue;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scrapers/snapshot-ledger.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add scrapers/snapshot-ledger.js scrapers/snapshot-ledger.test.js
git commit -m "feat(linkedin): snapshot ledger + reconciler (no-lost-output guarantee)"
```

---

## Task 6: Add GTM archetypes to the matcher

**Files:**
- Modify: `scoring/archetype-matcher.js`
- Modify: `scoring/archetype-matcher.test.js`

- [ ] **Step 1: Write the failing test**

Append to `scoring/archetype-matcher.test.js`:

```javascript
test('matchArchetypes: tags gtm_engineer on a GTM engineer title', () => {
  const matched = matchArchetypes({ title: 'GTM Engineer', snippet: 'build outbound automation in Clay' });
  assert.ok(matched.includes('gtm_engineer'));
});

test('matchArchetypes: tags head_of_gtm on a Head of GTM title', () => {
  const matched = matchArchetypes({ title: 'Head of GTM', snippet: 'own go-to-market strategy and pipeline' });
  assert.ok(matched.includes('head_of_gtm'));
});

test('matchArchetypes: gtm_engineer via responsibility keywords without exact title', () => {
  const matched = matchArchetypes({
    title: 'Growth Systems Lead',
    snippet: 'build the gtm stack with api integration and workflow automation',
  });
  assert.ok(matched.includes('gtm_engineer'));
});
```

> Confirm `matchArchetypes` and `assert` are already imported at the top of the existing test file; if not, add `import { matchArchetypes } from './archetype-matcher.js';` and `import assert from 'node:assert/strict';` / `import { test } from 'node:test';` to match the file's existing imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scoring/archetype-matcher.test.js`
Expected: FAIL — `matched` does not include `gtm_engineer` / `head_of_gtm`.

- [ ] **Step 3: Add the two archetypes**

In `scoring/archetype-matcher.js`, add these two objects to the `ARCHETYPES` array (after `marketing_ops`):

```javascript
  {
    id: 'gtm_engineer',
    titleKeywords: [
      'gtm engineer',
      'go-to-market engineer',
      'go to market engineer',
      'growth engineer',
      'marketing engineer',
      'automation engineer',
      'revenue operations engineer',
      'revops engineer',
      'forward deployed engineer',
      'gtm systems',
      'gtm automation',
    ],
    responsibilityKeywords: [
      'gtm stack',
      'outbound automation',
      'workflow automation',
      'api integration',
      'data enrichment',
      'clay',
      'n8n',
      'zapier',
      'go-to-market systems',
      'lead routing',
    ],
  },
  {
    id: 'head_of_gtm',
    titleKeywords: [
      'head of gtm',
      'head of go-to-market',
      'head of go to market',
      'vp gtm',
      'vp go-to-market',
      'founding gtm',
      'gtm lead',
      'head of growth',
      'head of revenue',
    ],
    responsibilityKeywords: [
      'go-to-market strategy',
      'go to market strategy',
      'pipeline',
      'founding',
      'revenue',
      'cross-functional',
      'sales and marketing',
    ],
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scoring/archetype-matcher.test.js`
Expected: PASS (existing + 3 new tests).

- [ ] **Step 5: Commit**

```bash
git add scoring/archetype-matcher.js scoring/archetype-matcher.test.js
git commit -m "feat(scoring): add gtm_engineer + head_of_gtm archetypes"
```

---

## Task 7: Shared Sheets auth + visual writer

**Files:**
- Create: `scrapers/sheets-auth.js`
- Create: `scrapers/linkedin-sheets.js`
- Test: `scrapers/linkedin-sheets.test.js`

### 7a — Shared auth helper

- [ ] **Step 1: Implement `sheets-auth.js`** (no test — thin wrapper; covered indirectly by the orchestrator smoke run)

```javascript
// scrapers/sheets-auth.js
/**
 * Build a Google auth client from EITHER an inline service-account JSON env var
 * (GOOGLE_SERVICE_ACCOUNT_JSON — used on Railway) OR a key file on disk
 * (credentials/sheets-sa.json — used locally).
 */
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEY_FILE = join(__dirname, '..', 'credentials', 'sheets-sa.json');
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];

export async function getAuthClient() {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline) {
    let credentials;
    try { credentials = JSON.parse(inline); }
    catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is set but is not valid JSON'); }
    const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
    return auth.getClient();
  }
  if (existsSync(KEY_FILE)) {
    const auth = new google.auth.GoogleAuth({ keyFile: KEY_FILE, scopes: SCOPES });
    return auth.getClient();
  }
  throw new Error(
    `No Google credentials: set GOOGLE_SERVICE_ACCOUNT_JSON or place a key file at ${KEY_FILE}`
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add scrapers/sheets-auth.js
git commit -m "feat(sheets): env-or-file service account auth helper"
```

### 7b — Visual row builder + dedup (pure, testable)

- [ ] **Step 3: Write the failing test**

```javascript
// scrapers/linkedin-sheets.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_HEADERS, postingToRow, sheetImage, sheetHyperlink, dedupeNew } from './linkedin-sheets.js';

test('sheetImage / sheetHyperlink: build formulas and escape quotes', () => {
  assert.equal(sheetImage('http://x/y.png'), '=IMAGE("http://x/y.png")');
  assert.equal(sheetHyperlink('http://x', 'Acme'), '=HYPERLINK("http://x","Acme")');
  // a label containing a quote is escaped by doubling
  assert.equal(sheetHyperlink('http://x', 'A"B'), '=HYPERLINK("http://x","A""B")');
  // empty url → plain label, no formula
  assert.equal(sheetImage(''), '');
  assert.equal(sheetHyperlink('', 'Acme'), 'Acme');
});

test('postingToRow: produces a row aligned to MAIN_HEADERS with visual cells', () => {
  const posting = {
    jobId: '123', title: 'GTM Engineer', company: 'Acme', url: 'http://job/123',
    companyUrl: 'http://acme', logo: 'http://acme/logo.png', applyLink: 'http://apply/123',
    location: 'Los Angeles', employmentType: 'Full-time', salary: '$150k', applicants: 12,
    seniority: 'Mid-Senior', postedDate: '2026-06-08T00:00:00Z', postedRaw: '1 day ago',
    archetypes: ['gtm_engineer'], intentScore: 55, fitScore: 72, roleFit: 'good',
    fitReason: 'API-direct GTM build', posterName: 'Jane', posterUrl: 'http://li/jane',
    snapshotId: 'snap-1',
  };
  const row = postingToRow(posting);
  assert.equal(row.length, MAIN_HEADERS.length);
  assert.equal(row[MAIN_HEADERS.indexOf('Logo')], '=IMAGE("http://acme/logo.png")');
  assert.equal(row[MAIN_HEADERS.indexOf('Company')], '=HYPERLINK("http://acme","Acme")');
  assert.equal(row[MAIN_HEADERS.indexOf('Title')], '=HYPERLINK("http://job/123","GTM Engineer")');
  assert.equal(row[MAIN_HEADERS.indexOf('Apply')], '=HYPERLINK("http://apply/123","Apply")');
  assert.equal(row[MAIN_HEADERS.indexOf('Job ID')], '123');
  assert.equal(row[MAIN_HEADERS.indexOf('Archetypes')], 'gtm_engineer');
});

test('dedupeNew: drops postings whose jobId already exists in the sheet', () => {
  const existingIds = new Set(['123']);
  const postings = [{ jobId: '123' }, { jobId: '456' }, { jobId: '456' }];
  const fresh = dedupeNew(postings, existingIds);
  assert.deepEqual(fresh.map(p => p.jobId), ['456']); // existing + intra-batch dup removed
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `node --test scrapers/linkedin-sheets.test.js`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the pure helpers + headers**

```javascript
// scrapers/linkedin-sheets.js
/**
 * Visual Google Sheet writer for the LinkedIn GTM scan.
 *
 * - Main tab: one row per posting, with =IMAGE logos and =HYPERLINK title/company/apply.
 * - Dedup: by LinkedIn Job ID read from the main tab (the Sheet is source of truth).
 * - `_runs` tab: the snapshot ledger store (see snapshot-ledger.js).
 *
 * Pure helpers (headers, formula builders, row builder, dedup) are exported and
 * unit-tested. The I/O functions (read ids, append rows, ledger store) take an
 * injected googleapis `sheets` client.
 */

export const MAIN_TAB = 'Postings';
export const RUNS_TAB = '_runs';

export const MAIN_HEADERS = [
  'Logo', 'Posted', 'Posted (raw)', 'Company', 'Title', 'Location',
  'Type', 'Salary', 'Applicants', 'Seniority', 'Archetypes', 'Intent',
  'Fit', 'Role Fit', 'Fit Reason', 'Apply', 'Recruiter',
  'Status', 'Priority', 'Notes',          // user columns (preserved)
  'Job ID', 'Snapshot ID', 'Found At',    // provenance
];

export const RUNS_HEADERS = [
  'trigger_time', 'inputs_summary', 'snapshot_id', 'status', 'rows_captured', 'error',
];

export const USER_COLUMNS = ['Status', 'Priority', 'Notes'];

/** =IMAGE(url) or '' when no url. */
export function sheetImage(url) {
  if (!url) return '';
  return `=IMAGE("${String(url).replace(/"/g, '""')}")`;
}

/** =HYPERLINK(url,label); plain label when no url. */
export function sheetHyperlink(url, label) {
  const safeLabel = String(label ?? '').replace(/"/g, '""');
  if (!url) return safeLabel;
  return `=HYPERLINK("${String(url).replace(/"/g, '""')}","${safeLabel}")`;
}

/** Build a sheet row aligned to MAIN_HEADERS. User columns left blank (merged on write). */
export function postingToRow(p) {
  const byHeader = {
    'Logo': sheetImage(p.logo),
    'Posted': p.postedDateISO || p.postedDate || '',
    'Posted (raw)': p.postedRaw || '',
    'Company': sheetHyperlink(p.companyUrl, p.company),
    'Title': sheetHyperlink(p.url, p.title),
    'Location': p.location || '',
    'Type': p.employmentType || '',
    'Salary': p.salary || '',
    'Applicants': p.applicants ?? '',
    'Seniority': p.seniority || '',
    'Archetypes': (p.archetypes || []).join(' | '),
    'Intent': p.intentScore ?? '',
    'Fit': p.fitScore ?? '',
    'Role Fit': p.roleFit || '',
    'Fit Reason': p.fitReason || '',
    'Apply': sheetHyperlink(p.applyLink, 'Apply'),
    'Recruiter': sheetHyperlink(p.posterUrl, p.posterName),
    'Status': '', 'Priority': '', 'Notes': '',
    'Job ID': p.jobId || '',
    'Snapshot ID': p.snapshotId || '',
    'Found At': p.foundAt || '',
  };
  return MAIN_HEADERS.map(h => byHeader[h] ?? '');
}

/** Keep only postings whose jobId is new (vs the sheet AND within the batch). */
export function dedupeNew(postings, existingIds) {
  const seen = new Set(existingIds);
  const fresh = [];
  for (const p of postings) {
    if (!p.jobId || seen.has(p.jobId)) continue;
    seen.add(p.jobId);
    fresh.push(p);
  }
  return fresh;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test scrapers/linkedin-sheets.test.js`
Expected: PASS (3 tests).

- [ ] **Step 7: Add the Sheets I/O functions** (appended to `scrapers/linkedin-sheets.js`; exercised by the Task 8 smoke run, not unit-tested — they are thin googleapis wrappers)

```javascript
// --- Sheets I/O (injected googleapis `sheets` client) ---

/** Ensure a tab exists with the given headers; create + header it if missing. */
export async function ensureTab(sheets, spreadsheetId, title, headers) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const found = meta.data.sheets.find(s => s.properties.title === title);
  if (!found) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  }
}

/** Read the set of existing Job IDs from the main tab. */
export async function readExistingJobIds(sheets, spreadsheetId) {
  const ids = new Set();
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${MAIN_TAB}!A:${colLetter(MAIN_HEADERS.length)}` });
    const rows = res.data.values || [];
    if (rows.length < 2) return ids;
    const idIdx = rows[0].indexOf('Job ID');
    for (let i = 1; i < rows.length; i++) {
      const v = rows[i][idIdx];
      if (v) ids.add(String(v));
    }
  } catch { /* tab empty/missing */ }
  return ids;
}

/** Append posting rows to the bottom of the main tab (USER_ENTERED so formulas render). */
export async function appendPostings(sheets, spreadsheetId, postings) {
  if (!postings.length) return 0;
  const values = postings.map(postingToRow);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${MAIN_TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
  return values.length;
}

/** A ledger store backed by the _runs tab, matching snapshot-ledger.js's interface. */
export function makeLedgerStore(sheets, spreadsheetId) {
  const range = `${RUNS_TAB}!A:F`;
  return {
    async read() {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      const rows = res.data.values || [];
      return rows.slice(1).map(r => Object.fromEntries(RUNS_HEADERS.map((h, i) => [h, r[i] ?? ''])));
    },
    async append(row) {
      await sheets.spreadsheets.values.append({
        spreadsheetId, range, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [RUNS_HEADERS.map(h => row[h] ?? '')] },
      });
    },
    async update(snapshotId, patch) {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      const rows = res.data.values || [];
      const idIdx = RUNS_HEADERS.indexOf('snapshot_id');
      const rowNum = rows.findIndex((r, i) => i > 0 && r[idIdx] === snapshotId);
      if (rowNum < 1) return;
      const current = Object.fromEntries(RUNS_HEADERS.map((h, i) => [h, rows[rowNum][i] ?? '']));
      const merged = { ...current, ...patch };
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${RUNS_TAB}!A${rowNum + 1}:F${rowNum + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [RUNS_HEADERS.map(h => merged[h] ?? '')] },
      });
    },
  };
}

/** Column letter for a 1-based count (<= 26 cols here). */
export function colLetter(count) {
  return String.fromCharCode(64 + count); // 1→A ... 23→W
}
```

- [ ] **Step 8: Commit**

```bash
git add scrapers/linkedin-sheets.js scrapers/linkedin-sheets.test.js
git commit -m "feat(linkedin): visual sheet writer + _runs ledger store"
```

---

## Task 8: Orchestrator entrypoint

**Files:**
- Create: `scrapers/linkedin-scan.js`
- Modify: `package.json` (add `scan:linkedin` script + register test files)

The orchestrator wires everything: load config → auth → ensure tabs → **reconcile first** (recover prior pending + adopt orphans) → trigger new chunks (record each snapshot_id before fetching) → reconcile again → on each batch of records: normalize, score, dedup, append. Scoring happens inside the `onRecords` callback so it applies to records from any snapshot (new or recovered).

- [ ] **Step 1: Implement the orchestrator**

```javascript
// scrapers/linkedin-scan.js
#!/usr/bin/env node
/**
 * LinkedIn GTM daily scan orchestrator.
 *
 * Flow: load config → auth → ensure tabs → reconcile prior/orphan snapshots →
 * trigger new discover chunks (ledger records each snapshot_id BEFORE fetch) →
 * reconcile again → for each batch: normalize + score + dedup + append rows.
 *
 * Run: node scrapers/linkedin-scan.js [--no-trigger] [--no-classify]
 *   --no-trigger : reconcile/recover only, do not trigger new jobs
 *   --no-classify: skip the LLM classification step (faster/cheaper dry runs)
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { google } from 'googleapis';
import { config as loadEnv } from 'dotenv';

import { getAuthClient } from './sheets-auth.js';
import { LinkedInJobsClient } from './linkedin-jobs-client.js';
import { buildInputs, toApiInput, chunk, normalizeRecord } from './linkedin-source.js';
import { reconcile, adoptOrphans } from './snapshot-ledger.js';
import {
  MAIN_TAB, RUNS_TAB, MAIN_HEADERS, RUNS_HEADERS,
  ensureTab, readExistingJobIds, appendPostings, makeLedgerStore,
} from './linkedin-sheets.js';
import { matchArchetypes } from '../scoring/archetype-matcher.js';
import { scoreIntent } from '../scoring/intent-scorer.js';
import { classifyPosting } from '../scoring/llm-classifier.js';
import { parsePostedDate } from '../scoring/parse-posted-date.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
loadEnv({ path: join(ROOT, '.env') });

const args = process.argv.slice(2);
const noTrigger = args.includes('--no-trigger');
const noClassify = args.includes('--no-classify');
const CLASSIFY_MIN_INTENT = 20;

async function main() {
  // 1. Config + secrets
  const config = yaml.load(readFileSync(join(__dirname, 'linkedin-queries.yml'), 'utf-8'));
  const apiKey = process.env.BRIGHT_DATA_API_KEY;
  if (!apiKey) throw new Error('BRIGHT_DATA_API_KEY is required');
  const spreadsheetId = process.env.LINKEDIN_SHEET_ID;
  if (!spreadsheetId) throw new Error('LINKEDIN_SHEET_ID is required');
  const openRouterKey = process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY;

  const client = new LinkedInJobsClient({ apiKey, datasetId: config.dataset_id });

  // 2. Auth + sheets client + tabs
  const authClient = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  await ensureTab(sheets, spreadsheetId, MAIN_TAB, MAIN_HEADERS);
  await ensureTab(sheets, spreadsheetId, RUNS_TAB, RUNS_HEADERS);
  const store = makeLedgerStore(sheets, spreadsheetId);

  // 3. onRecords: normalize → score → dedup → append (shared by all reconcile passes)
  let totalAppended = 0;
  const onRecords = async (records, snapshotId) => {
    const existingIds = await readExistingJobIds(sheets, spreadsheetId);
    const postings = [];
    for (const r of records) {
      const p = normalizeRecord(r, { snapshotId });
      p.postedDateISO = parsePostedDate(p.postedDate);
      p.archetypes = matchArchetypes({ title: p.title, snippet: p.snippet });
      const { score } = scoreIntent(p);
      p.intentScore = score;
      postings.push(p);
    }
    // dedup (vs sheet + intra-batch) before the expensive LLM step
    const { dedupeNew } = await import('./linkedin-sheets.js');
    const fresh = dedupeNew(postings, existingIds);

    if (!noClassify && openRouterKey) {
      for (const p of fresh) {
        if ((p.intentScore || 0) < CLASSIFY_MIN_INTENT) continue;
        try {
          const c = await classifyPosting(p, { apiKey: openRouterKey });
          if (c) Object.assign(p, { country: c.country, employmentType: c.employmentType, duration: c.duration, roleFit: c.roleFit, fitScore: c.fitScore, fitReason: c.fitReason, dealBreakers: c.dealBreakers });
        } catch (err) {
          console.warn(`classify failed for ${p.company} — ${err.message}`); // keep posting, intent-only
        }
      }
    }
    const n = await appendPostings(sheets, spreadsheetId, fresh);
    totalAppended += n;
    console.log(`  snapshot ${snapshotId}: ${records.length} records → ${n} new rows`);
  };

  const now = new Date().toISOString();

  // 4. Reconcile-first: recover anything pending + adopt orphans, then fetch
  await adoptOrphans({ store, client, triggerTime: now });
  await reconcile({ store, client, onRecords });

  // 5. Trigger new discover chunks (record snapshot_id BEFORE fetching)
  if (!noTrigger) {
    const inputs = buildInputs(config);
    const chunks = chunk(inputs, config.chunk_size || 5);
    console.log(`Triggering ${chunks.length} chunks (${inputs.length} inputs)...`);
    for (const group of chunks) {
      const summary = group.map(g => `${g._archetype}/${g._locationLabel}:${g.keyword}`).join(' ; ').slice(0, 240);
      try {
        const snapshotId = await client.trigger(group.map(toApiInput));
        await store.append({ snapshot_id: snapshotId, trigger_time: now, inputs_summary: summary, status: 'triggered', rows_captured: '', error: '' });
        console.log(`  triggered ${snapshotId} (${group.length} inputs)`);
      } catch (err) {
        console.error(`  trigger failed for [${summary}]: ${err.message}`);
      }
    }
    // 6. Reconcile the freshly-triggered snapshots (poll until ready, then fetch)
    await pollUntilSettled({ store, client, onRecords });
  }

  console.log(`\nDone. ${totalAppended} new postings appended to the sheet.`);
}

/**
 * Repeatedly reconcile until no rows remain in 'triggered'/'ready', or the
 * deadline passes (the next daily run will recover anything left).
 */
async function pollUntilSettled({ store, client, onRecords, intervalMs = 5000, deadlineMs = 1800000 }) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    await reconcile({ store, client, onRecords });
    const rows = await store.read();
    const pending = rows.filter(r => r.status === 'triggered' || r.status === 'ready');
    if (pending.length === 0) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  console.warn('pollUntilSettled: deadline reached; pending snapshots will be recovered next run.');
}

main().catch(err => { console.error('LinkedIn scan failed:', err.message); process.exit(1); });
```

> Note: `scoreIntent(posting)` returns `{ score, factors }` and reads `posting.title`/`posting.description` — the normalized posting provides both, so no adapter is needed. The dynamic `import('./linkedin-sheets.js')` for `dedupeNew` keeps the import list in one place; you may instead add `dedupeNew` to the static import at the top — either is fine.

- [ ] **Step 2: Add npm scripts + register tests in `package.json`**

In the `scripts` block, add:

```json
    "scan:linkedin": "node scrapers/linkedin-scan.js",
```

In the `test` script string, append these four files to the existing `node --test ...` list (space-separated, before the closing quote):

```
scrapers/linkedin-source.test.js scrapers/linkedin-jobs-client.test.js scrapers/snapshot-ledger.test.js scrapers/linkedin-sheets.test.js
```

- [ ] **Step 3: Run the full unit suite**

Run: `npm test`
Expected: PASS — existing tests + all new LinkedIn/scoring tests green.

- [ ] **Step 4: Commit**

```bash
git add scrapers/linkedin-scan.js package.json
git commit -m "feat(linkedin): scan orchestrator + npm scripts + test registration"
```

---

## Task 9: Local validation run (content quality gate)

**Files:**
- Modify: `.env.example`
- Modify: `.env` (local only — gitignored; do not commit secrets)

- [ ] **Step 1: Document the new env vars in `.env.example`**

Append:

```bash
# --- LinkedIn GTM scan ---
BRIGHT_DATA_API_KEY=your-bright-data-bearer-token
BRIGHT_DATA_JOBS_DATASET_ID=gd_lpfll7v5hcqtkxl6l
LINKEDIN_SHEET_ID=your-target-google-sheet-id
# OPEN_ROUTER_API_KEY is reused from the existing scan (classification)
# On Railway only: GOOGLE_SERVICE_ACCOUNT_JSON='{...full service account json...}'
```

- [ ] **Step 2: Commit the example (not the real .env)**

```bash
git add .env.example
git commit -m "docs(linkedin): document scan env vars"
```

- [ ] **Step 3: Create the target Google Sheet**

Create an empty Google Sheet, share it with the service-account email (editor), and put its id in your local `.env` as `LINKEDIN_SHEET_ID`. Ensure `credentials/sheets-sa.json` exists locally (same one the existing `push` uses).

- [ ] **Step 4: Dry reconcile (no trigger) — proves auth + tabs without spending Bright Data credits**

Run: `node scrapers/linkedin-scan.js --no-trigger`
Expected: creates `Postings` + `_runs` tabs, prints "0 new postings" (no pending snapshots yet), exits 0.

- [ ] **Step 5: First real run (small) — validate content**

Temporarily narrow `linkedin-queries.yml` to a single location and 2–3 keywords (keep credits low), then:

Run: `node scrapers/linkedin-scan.js --no-classify`
Expected: triggers 1 chunk, polls to ready, appends rows. Open the Sheet and verify:
- Logos render (`=IMAGE`), Company/Title/Apply are clickable.
- `_runs` tab shows the snapshot row marked `fetched` with `rows_captured`.
- Rows look like genuine GTM-adjacent roles.

- [ ] **Step 6: Validate scoring + the no-loss guarantee**

Run again with classification: `node scrapers/linkedin-scan.js` — confirm Intent/Fit/Role Fit populate and that re-running appends **no duplicates** (dedup by Job ID works). Then restore the full `linkedin-queries.yml` matrix.

- [ ] **Step 7: Tune + commit any config changes**

Adjust keywords/locations/archetype keywords based on what surfaced.

```bash
git add scrapers/linkedin-queries.yml scoring/archetype-matcher.js
git commit -m "tune(linkedin): refine GTM keywords from first validation run"
```

> **GATE:** Do not proceed to Phase 2 until the Sheet content quality is confirmed good (per spec §9).

---

# PHASE 2 — Schedule on Railway

## Task 10: Containerize for Railway

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Write the Dockerfile**

```dockerfile
# Dockerfile — Railway cron image for the LinkedIn GTM scan
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
# Cron command is set in the Railway service (see Task 11); default is the scan.
CMD ["node", "scrapers/linkedin-scan.js"]
```

- [ ] **Step 2: Verify the image builds and the entrypoint resolves**

Run: `docker build -t linkedin-scan . && docker run --rm linkedin-scan node -e "import('./scrapers/linkedin-scan.js').then(()=>{}).catch(e=>{console.log('loaded; runtime needs env:', e.message)})"`
Expected: build succeeds; node loads the module (it will exit on missing env, which is fine for this check).

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "build(linkedin): Dockerfile for Railway cron"
```

## Task 11: Configure the Railway cron service

**Files:** (no repo files — Railway dashboard config; documented in README at Task 12)

- [ ] **Step 1: Create the Railway service** from the GitHub repo (branch `feat/linkedin-gtm-scan` or `main` after merge). Set it as a **Cron** service.
- [ ] **Step 2: Set the cron schedule** to `0 13 * * *` (≈ 6:00 AM PT) with start command `node scrapers/linkedin-scan.js`.
- [ ] **Step 3: Set environment variables** in Railway:
  - `BRIGHT_DATA_API_KEY`
  - `BRIGHT_DATA_JOBS_DATASET_ID=gd_lpfll7v5hcqtkxl6l`
  - `OPEN_ROUTER_API_KEY`
  - `LINKEDIN_SHEET_ID`
  - `GOOGLE_SERVICE_ACCOUNT_JSON` = the full service-account JSON (single line). The sheet must be shared with that service account's email.
- [ ] **Step 4: Trigger a manual run** in Railway. Confirm logs show triggers + reconcile, and the Sheet gets new rows. Confirm the `_runs` tab updates.
- [ ] **Step 5: Verify recovery** — if a run is interrupted, the next scheduled run reconciles pending snapshots and adopts orphans (no manual transfer). Optionally run once with `--no-trigger` from Railway to confirm reconcile-only recovers leftovers.

## Task 12: Operator docs

**Files:**
- Create: `scrapers/README-linkedin.md`

- [ ] **Step 1: Write run/deploy/troubleshoot docs**

```markdown
# LinkedIn GTM Daily Scan

Daily Bright Data scan of new LinkedIn GTM Engineering / Head of GTM postings →
scored → appended to a visual Google Sheet. Deployed as a Railway cron.

## Local run
- `node scrapers/linkedin-scan.js --no-trigger`  — reconcile/recover only (no credits spent)
- `node scrapers/linkedin-scan.js --no-classify` — scrape + append, skip the LLM step
- `node scrapers/linkedin-scan.js`               — full daily run

## Config
- `scrapers/linkedin-queries.yml` — dataset id, locations, archetype keywords,
  `discovery_archetypes` (which archetypes are *discovered*; classification tags all).

## Env
BRIGHT_DATA_API_KEY, BRIGHT_DATA_JOBS_DATASET_ID, LINKEDIN_SHEET_ID,
OPEN_ROUTER_API_KEY, and (Railway only) GOOGLE_SERVICE_ACCOUNT_JSON.

## Reliability — the _runs tab
Every snapshot_id is recorded before fetch. Each run reconciles pending snapshots
and adopts dataset orphans, so interrupted scrapes self-heal on the next run.
Statuses: triggered → ready → fetched | failed. To recover now: run with --no-trigger.

## Railway
Cron service, schedule `0 13 * * *`, start command `node scrapers/linkedin-scan.js`.
```

- [ ] **Step 2: Commit**

```bash
git add scrapers/README-linkedin.md
git commit -m "docs(linkedin): operator run/deploy guide"
```

---

## Done / Definition of success

- `npm test` passes (existing + new suites).
- A daily Railway cron pulls new LinkedIn GTM postings via async snapshots and appends de-duplicated, scored, visual rows to the Google Sheet.
- The `_runs` ledger guarantees no Bright Data output is lost: any interrupted run self-heals on the next pass with zero manual transfer.
- Discovery is GTM-focused (cost-controlled); classification tags all six archetypes.

## Notes on out-of-scope (per spec §12)
- No Postgres/Supabase (Phase-2+ only if the Sheet creaks).
- No merge into SERP `postings.json` hopper.
- No auto-apply/outreach.
- Widening discovery to all six archetypes is a one-line `discovery_archetypes` edit.
