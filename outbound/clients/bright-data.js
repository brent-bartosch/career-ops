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
 */

const BASE = 'https://api.brightdata.com';

export class BrightDataClient {
  constructor({
    apiKey,
    profileDatasetId = process.env.BRIGHT_DATA_PROFILE_DATASET_ID || 'gd_l1viktl72bvl7bjuj0',
    activityDatasetId = process.env.BRIGHT_DATA_ACTIVITY_DATASET_ID || 'gd_lyy3tktm25m4avu764',
    fetchFn = fetch
  } = {}) {
    this.apiKey = apiKey;
    this.profileDatasetId = profileDatasetId;
    this.activityDatasetId = activityDatasetId;
    this.fetch = fetchFn;
  }

  async getProfile(linkedinUrl) {
    const raw = await this._trigger(this.profileDatasetId, [{ url: linkedinUrl }]);
    const row = Array.isArray(raw) ? raw[0] : raw;
    if (!row) throw new Error(`Bright Data returned empty profile for ${linkedinUrl}`);

    return {
      name: row.full_name || row.name,
      current_title: row.current_company?.title || row.position,
      current_company: row.current_company?.name,
      about: row.about || '',
      experience: (row.experience || []).map(e => ({
        company: e.company,
        title: e.title,
        start_date: e.start_date,
        end_date: e.end_date
      })),
      raw: row
    };
  }

  async getActivity(linkedinUrl, { sinceDays = 90 } = {}) {
    const raw = await this._trigger(this.activityDatasetId, [{ url: linkedinUrl }]);
    const cutoff = Date.now() - sinceDays * 86400000;

    return (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map(item => ({
      type: item.type || 'post',
      url: item.url,
      text_snippet: (item.text || '').slice(0, 280),
      date: item.date,
      topic_tags: item.topic_tags || []
    })).filter(item => {
      const t = new Date(item.date).getTime();
      return !isNaN(t) && t >= cutoff;
    });
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
      throw new Error(`Bright Data trigger failed: ${res.status}`);
    }
    return res.json();
  }
}
