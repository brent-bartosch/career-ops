import { validate } from './validator.js';

export function parseJD(rawText, { fallbackCompany = '', fallbackTitle = '', fallbackLocation = '' } = {}) {
  const title = fallbackTitle ||
    (rawText.match(/(?:job title|position)[:\s]+([^\n]+)/i)?.[1] ||
     rawText.split('\n')
       .map(l => l.replace(/^[•\-\*]+\s*/, '').trim())
       .find(l => l.length > 0 && /engineer|manager|director|vp|head of|architect/i.test(l)) ||
     'Unknown');

  const company_name = fallbackCompany ||
    (rawText.match(/([A-Z][A-Za-z0-9]+(?:\s[A-Z][A-Za-z0-9]+)*) is (?:the|an?|seeking)/)?.[1] ||
     rawText.match(/(?:^|\n)\s*(?:At|About)\s+([A-Z][A-Za-z0-9]+(?:\s[A-Z][A-Za-z0-9]+)*)[\s,:]/)?.[1] ||
     'Unknown');

  const location = fallbackLocation ||
    (rawText.match(/\b(?:based in|located in|office in)\s+([^\n.,]+)/i)?.[1] ||
     rawText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\b/)?.[0] || 'Unknown');

  const combinedStack = extractNamedTools(rawText).slice(0, 15);

  const required = extractSection(rawText, /required[:\s]/i, /preferred|qualifications|about|company|responsibilities/i);
  const preferred = extractSection(rawText, /preferred[:\s]/i, /qualifications|about|company|required|responsibilities/i);
  const responsibilities = extractSection(rawText, /responsibilities[:\s]/i, /qualifications|required|preferred|about|company/i);

  return {
    raw_text: rawText,
    title: title.trim(),
    company_name: company_name.trim(),
    location: location.trim(),
    stack: combinedStack.length > 0 ? combinedStack : ['Unknown'],
    required: required.length > 0 ? required : ['(no required list parsed — paste fuller JD)'],
    preferred: preferred.length > 0 ? preferred : ['(no preferred list parsed)'],
    responsibilities: responsibilities.length > 0 ? responsibilities : ['(no responsibilities parsed)']
  };
}

export async function ingestJD({
  source,
  text,
  url,
  company = '',
  title = '',
  location = '',
  webFetcher,
  playwrightFetcher
}) {
  let rawText = text;

  if (source === 'url') {
    try {
      rawText = await webFetcher(url);
      if (!rawText || rawText.length < 500) throw new Error('web fetch empty or thin');
    } catch (webErr) {
      console.warn(`JD ingest: web fetch failed for ${url} (${webErr.message}); trying Playwright...`);
      try {
        rawText = await playwrightFetcher(url);
        if (!rawText || rawText.length < 500) throw new Error('playwright empty or thin');
      } catch (pwErr) {
        console.warn(`JD ingest: playwright fetch failed for ${url} (${pwErr.message})`);
        return { ok: false, errors: [`HARD STOP: Could not fetch JD from ${url}. Paste the JD text to continue.`] };
      }
    }
  }

  if (!rawText || rawText.length < 500) {
    return { ok: false, errors: [`HARD STOP: JD is too thin (got ${rawText?.length ?? 0} chars, need ≥500). Paste the full JD.`] };
  }

  const data = parseJD(rawText, { fallbackCompany: company, fallbackTitle: title, fallbackLocation: location });
  const v = validate('jd-ingest', data);
  if (!v.ok) return { ok: false, errors: v.errors };

  return { ok: true, data, warnings: v.warnings };
}

function extractSection(text, startRe, endRe) {
  const startIdx = text.search(startRe);
  if (startIdx === -1) return [];
  const after = text.slice(startIdx);
  const endIdx = after.slice(20).search(endRe);
  const section = endIdx === -1 ? after : after.slice(0, 20 + endIdx);
  return section
    .split(/\n/)
    .map(l => l.trim())
    .filter(l => /^[•\-\*•]|^\d+\.\s/.test(l))
    .map(l => l.replace(/^(?:[•\-\*]+\s*|\d+\.\s+)/, '').trim())
    .filter(Boolean);
}

function extractNamedTools(text) {
  const tools = ['HubSpot', 'Salesforce', 'Apollo', 'Sybill', 'QuotaPath', 'Equals', 'Outreach', 'Gong', 'Clay', 'Segment', 'Snowflake', 'BigQuery', 'Metabase', 'Looker', 'Tableau', 'LinkedIn', 'Zapier', 'Make', 'Marketo', 'Pardot', 'Zoominfo', 'Clearbit', '6sense'];
  return tools.filter(t => new RegExp(`\\b${t}\\b`, 'i').test(text));
}
