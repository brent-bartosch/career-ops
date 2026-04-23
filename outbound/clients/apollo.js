/**
 * Apollo API client — People Search + People Match.
 * https://apolloapi.com/docs
 */

const BASE = 'https://api.apollo.io';

export class ApolloClient {
  constructor({ apiKey, fetchFn = fetch } = {}) {
    this.apiKey = apiKey;
    this.fetch = fetchFn;
  }

  async searchPeople({ company, titles, perPage = 10 }) {
    const res = await this._call('POST', '/api/v1/mixed_people/search', {
      organization_names: [company],
      person_titles: titles,
      per_page: perPage
    });

    const candidates = (res.people || []).map((p, idx) => ({
      name: p.name,
      title: p.title,
      seniority: p.seniority || inferSeniority(p.title),
      apollo_person_id: p.id,
      linkedin_url: p.linkedin_url || null,
      rank_reason: rankReason(p, idx)
    }));

    return { candidates };
  }

  async matchPerson({ personId }) {
    const res = await this._call('POST', '/api/v1/people/match', {
      id: personId,
      reveal_personal_emails: false,
      reveal_phone_number: false
    });

    const person = res.person;
    if (!person) {
      throw new Error(`Apollo matchPerson: no person found for id ${personId}`);
    }
    const history = person.employment_history || [];
    const openEnded = history.filter(h => !h.end_date);
    const current = openEnded.length > 0
      ? openEnded.reduce((a, b) => (a.start_date > b.start_date ? a : b))
      : (history[0] || {});
    const priors = history.filter(h => h !== current).slice(0, 2).map(h => ({
      company: h.organization_name,
      title: h.title,
      start_date: h.start_date,
      end_date: h.end_date
    }));

    return {
      email: person.email || null,
      email_status: person.email_status || 'unknown',
      linkedin_url: person.linkedin_url || null,
      tenure_at_company_months: current.start_date ? monthsSince(current.start_date) : 0,
      prior_roles: priors
    };
  }

  async _call(method, path, body) {
    const res = await this.fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey
      },
      body: JSON.stringify(body)
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error('APOLLO_API_KEY missing or invalid');
    }
    if (res.status === 429) {
      const retryAfter = res.headers.get?.('retry-after') ?? '60';
      throw new Error(`Apollo rate limit hit. Retry after ${retryAfter}s.`);
    }
    if (!res.ok) {
      let text = '(no body)';
      try {
        const body = typeof res.json === 'function' ? await res.json() : null;
        if (body) text = JSON.stringify(body).slice(0, 200);
      } catch {
        /* body not JSON — keep default */
      }
      throw new Error(`Apollo ${method} ${path} failed: ${res.status} — ${text}`);
    }
    return res.json();
  }
}

function inferSeniority(title = '') {
  const t = title.toLowerCase();
  if (/\b(ceo|cto|cfo|coo|cro|cmo|chief)\b/.test(t)) return 'c_suite';
  if (/\bvp\b|vice president/.test(t)) return 'vp';
  if (/\bhead of\b/.test(t)) return 'head';
  if (/\bdirector\b/.test(t)) return 'director';
  if (/\bmanager\b/.test(t)) return 'manager';
  return 'individual_contributor';
}

function rankReason(p, idx) {
  return `Rank ${idx + 1}: ${p.title} — ${inferSeniority(p.title)} tier at ${p.organization?.name || 'target'}`;
}

function monthsSince(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
}
