/**
 * Bright Data LinkedIn scrape client.
 *
 * Uses Bright Data's Dataset API for LinkedIn profile + activity extraction.
 * Real dataset IDs must be configured per the user's Bright Data account —
 * they are injected via constructor options or env (BRIGHT_DATA_PROFILE_DATASET_ID,
 * BRIGHT_DATA_ACTIVITY_DATASET_ID).
 *
 * See docs/superpowers/specs/2026-04-21-outbound-email-design.md §9.2
 * and sibling project `~/Development/Smoothed/career/linkedin-engagement/` for patterns.
 *
 * API flow: POST trigger → GET progress (poll) → GET snapshot
 */

const BASE = 'https://api.brightdata.com';

/** @param {number} ms */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Coerce a value to an array, tolerating a single object or null/undefined.
 * @param {unknown} v
 * @returns {unknown[]}
 */
function coerceArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return [v];
  return [];
}

/**
 * Format a non-2xx Bright Data API error into a readable message.
 * Attempts to parse JSON body for detail.
 * @param {string} stage
 * @param {Response} res
 * @returns {Promise<string>}
 */
async function formatBrightDataError(stage, res) {
  let body = '(no body)';
  try {
    const parsed = await res.json();
    if (parsed) body = JSON.stringify(parsed).slice(0, 200);
  } catch {
    /* non-JSON body */
  }
  return `Bright Data ${stage} failed: ${res.status} — ${body}`;
}

export class BrightDataClient {
  constructor({
    apiKey,
    profileDatasetId = process.env.BRIGHT_DATA_PROFILE_DATASET_ID,
    activityDatasetId = process.env.BRIGHT_DATA_ACTIVITY_DATASET_ID,
    pollIntervalMs = 3000,
    pollTimeoutMs = 300000,
    fetchFn = fetch
  } = {}) {
    this.apiKey = apiKey;
    this.profileDatasetId = profileDatasetId;
    this.activityDatasetId = activityDatasetId;
    this.pollIntervalMs = pollIntervalMs;
    this.pollTimeoutMs = pollTimeoutMs;
    this.fetch = fetchFn;
  }

  async getProfile(linkedinUrl) {
    const raw = await this._runDatasetJob(this.profileDatasetId, [{ url: linkedinUrl }]);
    const row = Array.isArray(raw) ? raw[0] : raw;
    if (!row) throw new Error(`Bright Data returned empty profile for ${linkedinUrl}`);

    const name = row.full_name || row.name;
    if (!name) throw new Error(`Bright Data profile missing name for ${linkedinUrl}`);

    return {
      name,
      current_title: row.current_company?.title || row.position,
      current_company: row.current_company?.name,
      about: row.about || '',
      experience: coerceArray(row.experience).map(e => ({
        company: e.company,
        title: e.title,
        start_date: e.start_date,
        end_date: e.end_date
      })),
      raw: row
    };
  }

  async getActivity(linkedinUrl, { sinceDays = 90 } = {}) {
    const raw = await this._runDatasetJob(this.activityDatasetId, [{ url: linkedinUrl }]);
    const cutoff = Date.now() - sinceDays * 86400000;

    return (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map(item => ({
      type: item.type || 'post',
      url: item.url,
      // 280 chars is enough for an anchor (Twitter-length); draft hooks reference posts, not quote them
      text_snippet: (item.text || '').slice(0, 280),
      date: item.date,
      topic_tags: item.topic_tags || []
    })).filter(item => {
      const t = new Date(item.date).getTime();
      if (isNaN(t)) {
        console.warn(`BrightData: unparseable date "${item.date}" dropped from activity`);
        return false;
      }
      return t >= cutoff;
    });
  }

  /**
   * Run a full dataset job: trigger → poll until ready → fetch snapshot.
   * @param {string} datasetId
   * @param {unknown[]} payload
   * @returns {Promise<unknown>}
   */
  async _runDatasetJob(datasetId, payload) {
    if (!datasetId) throw new Error('Bright Data dataset ID missing — set BRIGHT_DATA_PROFILE_DATASET_ID or BRIGHT_DATA_ACTIVITY_DATASET_ID');
    const { snapshot_id } = await this._trigger(datasetId, payload);
    if (!snapshot_id) throw new Error(`Bright Data: trigger returned no snapshot_id (dataset ${datasetId})`);
    await this._pollProgress(snapshot_id);
    return this._fetchSnapshot(snapshot_id);
  }

  async _trigger(datasetId, payload) {
    const res = await this.fetch(`${BASE}/datasets/v3/trigger?dataset_id=${datasetId}&include_errors=true`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error('BRIGHT_DATA_API_KEY missing or invalid');
    }
    if (!res.ok) {
      throw new Error(await formatBrightDataError('trigger', res));
    }
    return res.json();
  }

  async _pollProgress(snapshotId) {
    const deadline = Date.now() + this.pollTimeoutMs;
    while (Date.now() < deadline) {
      const res = await this.fetch(`${BASE}/datasets/v3/progress/${snapshotId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error('BRIGHT_DATA_API_KEY missing or invalid');
      }
      if (!res.ok) {
        throw new Error(await formatBrightDataError('progress', res));
      }
      const body = await res.json();
      if (body.status === 'ready') return;
      if (body.status === 'failed') throw new Error(`Bright Data snapshot ${snapshotId} failed: ${body.error || 'unknown'}`);
      await sleep(this.pollIntervalMs);
    }
    throw new Error(`Bright Data snapshot ${snapshotId} did not become ready within ${this.pollTimeoutMs}ms`);
  }

  async _fetchSnapshot(snapshotId) {
    const res = await this.fetch(`${BASE}/datasets/v3/snapshot/${snapshotId}?format=json`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error('BRIGHT_DATA_API_KEY missing or invalid');
    }
    if (!res.ok) {
      throw new Error(await formatBrightDataError('snapshot', res));
    }
    return res.json();
  }
}
