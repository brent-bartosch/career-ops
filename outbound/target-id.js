import { validate } from './validator.js';

// Title filter arrays. Deliberate overlap between buckets is intentional:
// Apollo dedupes by person, so listing a title in multiple buckets does not
// produce duplicate candidates. Do NOT remove duplicates across arrays — each
// bucket is curated for its archetype's prioritisation.
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

/**
 * Maps a JD title to a prioritized list of hiring-manager titles for Apollo search.
 *
 * Dispatch is first-match-wins: GTM is checked first — intentionally prioritised
 * over Marketing/Solutions for ambiguous titles like "Marketing RevOps Lead" or
 * "Growth Marketing Systems Architect". Brent's primary archetype is GTM; closer
 * matches for other archetypes are checked only when the title clearly signals them.
 *
 * @param {string} jdTitle - the job's title (e.g., "Manager, GTM Engineering")
 * @returns {string[]} titles to pass to Apollo People Search
 */
export function inferTitleFilter(jdTitle) {
  const t = (jdTitle || '').toLowerCase();
  if (/gtm|revops|revenue ops|sales ops|pipeline|systems architect/.test(t)) return TITLE_FILTERS_GTM;
  if (/solutions|customer success|implementation|onboarding/.test(t)) return TITLE_FILTERS_SOLUTIONS;
  if (/marketing|martech|demand gen|growth marketing/.test(t)) return TITLE_FILTERS_MARKETING;
  return TITLE_FILTERS_GTM; // default for Brent's positioning
}

/**
 * Run Stage 3 target identification.
 *
 * @param {Object} opts
 * @param {string} opts.company - company name (e.g., "Delightree")
 * @param {string} opts.jdTitle - JD title used to infer target-person titles
 * @param {ApolloClient} opts.apolloClient - injected Apollo client (see outbound/clients/apollo.js)
 * @param {string[]} [opts.titleOverride] - pre-built titles array; skips inferTitleFilter.
 *   Task 16 orchestrator wires this from config/profile.yml → outbound.target_titles
 *   (see spec §13 question #1 for the customization path).
 * @returns {Promise<{ ok: boolean, data?: { candidates: Object[], titles_used: string[] }, errors?: string[] }>}
 */
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
