const TIERS = [
  {
    name: 'builder',
    weight: 40,
    keywords: [
      'build from scratch',
      '0-to-1',
      'zero to one',
      'greenfield',
      'design and implement',
      'architect',
      'build the function',
      'first hire',
      'api-first',
      'api first',
      'build bespoke',
      'custom systems',
      'engineering-led',
      'founding',
    ],
  },
  {
    name: 'systems_thinking',
    weight: 25,
    keywords: [
      'data infrastructure',
      'system design',
      'pipeline architecture',
      'integration architecture',
      'technical strategy',
      'cross-functional systems',
      'workflow automation',
      'data model',
      'scoring model',
      'systems architecture',
    ],
  },
  {
    name: 'ai_modern_stack',
    weight: 20,
    keywords: [
      'ai-powered',
      'ai powered',
      'llm',
      'machine learning',
      'agentic',
      'claude',
      'gpt',
      'automation engineering',
      'mcp',
      'api integration',
      'programmatic',
    ],
  },
  {
    name: 'adjacent',
    weight: 10,
    keywords: [
      'revops',
      'gtm',
      'growth',
      'full-stack marketer',
      'full stack marketer',
      'technical marketing',
      'data-driven',
      'data driven',
    ],
  },
];

/**
 * Score a job posting's architectural intent.
 *
 * @param {{ title: string, snippet: string, description?: string }} posting
 * @returns {{ score: number, factors: string[] }}
 */
export function scoreIntent(posting) {
  const text = [
    posting.title ?? '',
    posting.snippet ?? '',
    posting.description ?? '',
  ]
    .join(' ')
    .toLowerCase();

  let raw = 0;
  const factors = [];

  for (const tier of TIERS) {
    for (const keyword of tier.keywords) {
      if (text.includes(keyword)) {
        raw += tier.weight;
        factors.push(`${tier.name}: "${keyword}" (+${tier.weight})`);
      }
    }
  }

  return {
    score: Math.min(raw, 100),
    factors,
  };
}
