/**
 * Stage 2 of the outbound pipeline: company research.
 *
 * Aggregates company signals from site fetch + search (funding, customers, news)
 * into a structured dossier for Stage 6 (draft) Hook generation.
 *
 * Hard stops on missing customer references (≥3), missing recent news (≤12 months),
 * thin product description (<200 chars), or unverifiable funding stage.
 *
 * Dependency-injected webFetcher + webSearcher for testability.
 */
import { validate } from './validator.js';

export async function researchCompany({ company, jd_raw_text, webFetcher, webSearcher }) {
  const site = await fetchSite(webFetcher, company);
  const fundingHits = await webSearcher(`"${company}" funding Series`);
  const customerHits = await webSearcher(`"${company}" customers OR case study`);
  const currentYear = new Date().getFullYear();
  const newsHits = await webSearcher(`"${company}" news ${currentYear - 1}..${currentYear}`);

  const funding = parseFunding(fundingHits);
  const customers = dedupe((site.customers || []).concat(customerHits.slice(0, 10).map(h => h.title.replace(/^case study:?\s*/i, '').trim())));
  const news = newsHits
    .filter(h => h.date && !isNaN(new Date(h.date).getTime()))
    .map(h => ({
      title: h.title,
      date: h.date,
      url: h.url,
      summary: h.snippet || h.title
    }));

  const data = {
    product_description: site.product_description.length >= 200 ? site.product_description : `${site.product_description} ${company}: ${jd_raw_text.slice(0, 500)}`.trim(),
    icp: site.icp || inferICP(jd_raw_text),
    funding_stage: funding.stage,
    last_round: funding.last_round,
    customers: customers.slice(0, 10),
    news
  };

  const v = validate('company-research', data);
  if (!v.ok) {
    return { ok: false, errors: v.errors.map(humanize) };
  }
  return { ok: true, data, warnings: v.warnings };
}

async function fetchSite(webFetcher, company) {
  try {
    const html = await webFetcher(`https://www.${slug(company)}.com/`);
    return {
      product_description: (html.match(/[^.]{200,}\./) || [''])[0] || html,
      icp: (html.match(/for ([a-z ,-]+? (?:brands|teams|operators|companies))/i)?.[1] || '').trim(),
      customers: (html.match(/customers?:?\s+([A-Z][^.]{10,200})/i)?.[1] || '').split(/[,;]/).map(s => s.trim()).filter(Boolean)
    };
  } catch {
    return { product_description: '', icp: '', customers: [] };
  }
}

function parseFunding(hits) {
  const h = hits[0] || {};
  const stage = (h.title?.match(/\b(Seed|Series [A-Z]|Pre-seed)\b/i)?.[1]) || 'Unknown';
  const date = h.date || null;
  const amount = (h.title?.match(/\$[\d.]+ ?[MBmb]/)?.[0]) || null;
  return { stage, last_round: date ? { date, amount } : null };
}

function inferICP(jdText) {
  const m = jdText.match(/(?:for|supporting)\s+([a-z0-9 ,-]+)(?:\.|,|\n)/i);
  return (m?.[1] || 'B2B SaaS').trim();
}

function dedupe(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function humanize(err) {
  if (/customers/.test(err)) return `HARD STOP: insufficient customer references found. Need ≥3. Paste customer list or skip this company.`;
  if (/news/.test(err)) return `HARD STOP: no recent news (≤12 months) found. A cold email without a news hook will feel generic. Paste a link or skip.`;
  if (/product_description/.test(err)) return `HARD STOP: couldn't build a ≥200-char product description. Paste the company's homepage or about page.`;
  if (/funding/.test(err) || /last_round/.test(err)) return `HARD STOP: couldn't verify funding stage. Paste a Crunchbase/Pitchbook link.`;
  return err;
}
