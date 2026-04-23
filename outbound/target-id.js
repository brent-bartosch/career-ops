import { validate } from './validator.js';

const TITLE_FILTERS_GTM = [
  'VP RevOps', 'Head of RevOps', 'Head of Growth', 'VP Growth',
  'Director of Growth Ops', 'Director of Marketing Ops',
  'CRO', 'VP Sales', 'VP Marketing', 'Head of GTM',
  'Chief of Staff, Revenue'
];

const TITLE_FILTERS_SOLUTIONS = [
  'VP Solutions', 'Head of Solutions Engineering', 'Director Solutions',
  'VP Customer Success', 'Head of Customer Success', 'Chief Customer Officer'
];

const TITLE_FILTERS_MARKETING = [
  'VP Marketing', 'Head of Marketing Ops', 'Director Marketing Ops',
  'CMO', 'Head of Growth'
];

export function inferTitleFilter(jdTitle) {
  const t = (jdTitle || '').toLowerCase();
  if (/gtm|revops|revenue ops|sales ops|pipeline|systems architect/.test(t)) return TITLE_FILTERS_GTM;
  if (/solutions|customer success|implementation|onboarding/.test(t)) return TITLE_FILTERS_SOLUTIONS;
  if (/marketing|martech|demand gen|growth marketing/.test(t)) return TITLE_FILTERS_MARKETING;
  return TITLE_FILTERS_GTM; // default for Brent's positioning
}

export async function identifyTargets({ company, jdTitle, apolloClient, titleOverride }) {
  const titles = titleOverride || inferTitleFilter(jdTitle);

  let res;
  try {
    res = await apolloClient.searchPeople({ company, titles });
  } catch (e) {
    return { ok: false, errors: [`HARD STOP: ${e.message}`] };
  }

  const v = validate('target-id', { candidates: res.candidates });
  if (!v.ok) {
    return {
      ok: false,
      errors: [`HARD STOP: Apollo returned ${res.candidates?.length || 0} candidates for titles ${JSON.stringify(titles)} at ${company}. Broaden title filter or manually identify a target via LinkedIn.`]
    };
  }

  return { ok: true, data: { candidates: res.candidates, titles_used: titles } };
}
