/**
 * LLM-based job posting classifier via OpenRouter.
 *
 * Given a posting with a fetched JD, classifies:
 *   - hiring country (US / UK / etc. / Unknown)
 *   - role fit against Brent's target archetypes (good / partial / poor)
 *   - deal-breakers (demo_heavy, admin_only, non_us, etc.)
 *
 * Uses a cheap model (default: google/gemini-2.5-flash-lite) via OpenRouter.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite';
const MAX_DESCRIPTION_CHARS = 12000;

const SYSTEM_PROMPT = `You are a job posting classifier for a specific candidate: Brent Bartosch, a GTM Systems Architect.

Brent's target archetypes:
A) RevOps / GTM Ops Leader — designs revenue infrastructure, pipeline visibility, cross-functional systems. NOT: pure Salesforce admin, CRM hygiene, data entry.
B) Solutions Architect — customer-facing, architects integrations, technical sales partner, builds custom systems against APIs. NOT: demo-engineer, slide-deck presenter, deal-support only.
C) Marketing Ops / Marketing Technologist — builds martech stack, attribution, campaign automation with real systems work. NOT: campaign coordinator, email template editor.

What Brent specifically values (higher fit):
- API-direct integration (no Zapier/Make/iPaaS middleware)
- Build-from-scratch or greenfield systems ownership
- AI embedded as engineering component (LLM/agentic work with deterministic scaffolding)
- Strategic + hands-on (0-1 building, architectural decisions)

What Brent avoids (deal-breakers):
- demo_heavy: 50%+ of time doing product demonstrations
- admin_only: Salesforce admin, CRM hygiene, report building, data entry
- middleware_only: Zapier/Make/workflow tool configuration without real engineering
- staff_aug: pure contract-to-hire where you're fungible labor
- non_technical: role is pure strategy/advisory with no building
- non_us: position is explicitly based outside the US (UK, EMEA, APAC, specific non-US city)

Brent is open to BOTH full-time employment AND contract/fractional work. Do not penalize a role for being contract — classify it.

Return ONLY valid JSON matching this exact schema, no markdown, no commentary:
{
  "country": "US" | "UK" | "France" | "Germany" | "Ireland" | "Canada" | "Remote" | "Unknown",
  "countryConfidence": "high" | "medium" | "low",
  "workplaceType": "remote" | "hybrid" | "onsite" | "unknown",
  "employmentType": "full_time" | "contract" | "fractional" | "contract_to_hire" | "unknown",
  "duration": "string describing duration or 'unknown' or 'ongoing'",
  "roleFit": "good" | "partial" | "poor",
  "fitScore": 0-100 integer,
  "fitReason": "one concise sentence",
  "dealBreakers": ["deal_breaker_id", ...]
}

Rules:
- "country": where the role is based. If explicitly "Remote - US" or "US remote" → US. If "Remote" alone with no country → Remote. If UK/EMEA/Paris/Berlin/London etc → that country.
- "workplaceType": the work arrangement, independent of country. "remote" = fully remote / work-from-anywhere. "hybrid" = mix of in-office and remote. "onsite" = required in-office or on-location. "unknown" if not stated.
- "employmentType":
  - "full_time" = W2 full-time employee, salary + benefits
  - "contract" = W2 or 1099 contract, defined end date, no benefits. Includes staff aug.
  - "fractional" = part-time, typically "fractional CRO/CMO/CTO" or "head of X (fractional)". Ongoing but not full-time.
  - "contract_to_hire" = starts as contract, converts to FT after evaluation period
  - "unknown" = cannot determine from JD
- "duration": quote the duration from the JD if stated ("6 months", "3-6 months", "12 months"). Use "ongoing" for fractional roles without end date. Use "unknown" if not specified.
- "roleFit": "good" means matches an archetype cleanly with no deal-breakers. "partial" means related but with caveats. "poor" means wrong role or major deal-breakers.
- "fitScore": 0-100 continuous scale. 70+ = good, 40-69 = partial, <40 = poor.
- "dealBreakers": only include if they actually apply. Empty array if none. For contract roles, "staff_aug" is NOT a deal-breaker unless the role is pure body-rental with no architectural ownership.
- "fitReason": ≤ 20 words. Specific. Reference the concrete signal.`;

/**
 * Build the OpenRouter chat messages for a posting.
 */
export function buildClassifierMessages(posting) {
  const description = (posting.description || '').slice(0, MAX_DESCRIPTION_CHARS);
  const snippet = posting.snippet || '';
  const hasDescription = description.length >= 200;

  const userContent = [
    `Company: ${posting.company || 'unknown'}`,
    `Title: ${posting.title || 'unknown'}`,
    `Location signal: ${posting.location || 'not specified'}`,
    `Platform: ${posting.platform || 'unknown'}`,
    ...(snippet ? [`Snippet: ${snippet}`] : []),
    '',
    hasDescription ? 'Description:' : 'Description: (not available — rely on title, snippet, and location)',
    hasDescription ? description : '',
  ].join('\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}

/**
 * Parse the LLM's raw text response into a classification object.
 * Returns null if response cannot be parsed.
 */
export function parseClassifierResponse(raw) {
  if (!raw) return null;

  // Strip markdown code fences if present
  let cleaned = String(raw).trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Try to extract first JSON object if there's noise around it
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  // Normalize
  return {
    country: String(parsed.country || 'Unknown'),
    countryConfidence: String(parsed.countryConfidence || 'low'),
    workplaceType: String(parsed.workplaceType || 'unknown'),
    employmentType: String(parsed.employmentType || 'unknown'),
    duration: String(parsed.duration || 'unknown'),
    roleFit: String(parsed.roleFit || 'poor'),
    fitScore: Number(parsed.fitScore) || 0,
    fitReason: String(parsed.fitReason || ''),
    dealBreakers: Array.isArray(parsed.dealBreakers) ? parsed.dealBreakers : [],
  };
}

/**
 * Classify a single posting.
 *
 * @param {object} posting - Must have at least title/company/description
 * @param {object} options
 * @param {string} options.apiKey - OpenRouter API key
 * @param {string} [options.model] - OpenRouter model slug
 * @param {function} [options.fetchFn] - Injected fetch (for tests)
 * @returns {Promise<object|null>} Classification or null if response unparseable
 */
export async function classifyPosting(posting, options = {}) {
  const { apiKey, model = DEFAULT_MODEL, fetchFn = fetch } = options;

  if (!apiKey) {
    throw new Error('OpenRouter API key required');
  }

  const messages = buildClassifierMessages(posting);

  const response = await fetchFn(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/brent-bartosch/career-ops',
      'X-Title': 'career-ops',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = typeof response.text === 'function' ? await response.text() : '';
    throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  return parseClassifierResponse(content);
}
