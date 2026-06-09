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
