const ARCHETYPES = [
  {
    id: 'revops_gtm_leader',
    titleKeywords: [
      'revenue operations',
      'sales operations',
      'gtm operations',
      'business operations',
      'growth operations',
      'revops',
      'head of revenue',
      'director revenue',
      'vp revenue',
      'director sales operations',
      'gtm strategy',
      'go-to-market',
    ],
    responsibilityKeywords: [
      'pipeline',
      'funnel',
      'forecasting',
      'crm architecture',
      'data infrastructure',
      'cross-functional',
      'gtm',
      'revenue',
    ],
  },
  {
    id: 'solutions_architect',
    titleKeywords: [
      'solutions architect',
      'gtm systems architect',
      'sales engineer',
      'technical strategist',
      'integration architect',
      'solutions engineer',
      'pre-sales engineer',
      'technical solutions',
    ],
    responsibilityKeywords: [
      'system design',
      'api integration',
      'technical requirements',
      'customer-facing',
      'pre-sales',
      'solution design',
      'architecture',
    ],
  },
  {
    id: 'marketing_ops',
    titleKeywords: [
      'marketing operations',
      'marketing technologist',
      'demand generation',
      'demand gen',
      'growth engineer',
      'marketing systems',
      'marketing automation',
      'martech',
      'marketing ops',
    ],
    responsibilityKeywords: [
      'martech stack',
      'automation',
      'attribution',
      'lead scoring',
      'campaign infrastructure',
      'marketing automation',
      'hubspot',
      'marketo',
      'marketing platform',
    ],
  },
];

/**
 * Classify a job posting into one or more role archetypes.
 *
 * @param {{ title: string, snippet: string }} posting
 * @returns {string[]} matched archetype IDs
 */
export function matchArchetypes(posting) {
  const title = (posting.title ?? '').toLowerCase();
  const combined = `${title} ${(posting.snippet ?? '').toLowerCase()}`;
  const matched = [];

  for (const archetype of ARCHETYPES) {
    const titleMatch = archetype.titleKeywords.some((kw) => title.includes(kw));

    if (titleMatch) {
      matched.push(archetype.id);
      continue;
    }

    const respHits = archetype.responsibilityKeywords.filter((kw) =>
      combined.includes(kw),
    );

    if (respHits.length >= 2) {
      matched.push(archetype.id);
    }
  }

  return matched;
}
