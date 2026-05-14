import { validate } from './validator.js';
import { lintDraft } from './voice-lint.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-5';

const SYSTEM_PROMPT = `You write outbound cold emails in the voice of Brent Bartosch — a GTM Systems Architect with B2B sales background.

Voice rules (non-negotiable):
- 60-80 words total (body only, not signoff)
- Practitioner authority, direct, leads with insight or reframe
- Names specific tools, metrics, or reports — never vague
- No emoji
- No corp-speak: no "passionate about", "leveraging", "synergies", "cutting-edge", "seamless", "robust", "spearheaded", "facilitated", "rock star", "move the needle"
- No praise openers ("Great post!", "Love this!")
- Max one compliment, earned, never stand-alone
- Structure: Hook → Carrot → Proof → Ask
- Signoff: "Best, Brent" on its own line
- Output JSON: { "subject": "...", "body": "..." }`;

export function buildPrompts({ jd, company, target, proofs }) {
  // If fewer than 3 proofs were returned by Stage 5, reuse the first for later variants.
  // In practice this path is rare — validator requires proofs.length >= 2, and most JDs
  // yield 3-5 matches. Still valid to ship with only 2.
  const p0 = proofs[0];
  const p1 = proofs[1] || p0;
  const p2 = proofs[2] || p0;

  const anchorA = `CUSTOMER/ICP anchor: ${company.customers.slice(0, 3).join(', ')}. ICP pain implicit in role.`;
  const post = target.recent_activity?.[0];
  const anchorB = post ? `TARGET POST anchor: ${target.name} posted about "${post.text_snippet}" (${post.url})` : `TARGET role anchor: ${target.title}`;
  const newsItem = company.news?.[0];
  const anchorC = newsItem ? `NEWS/PRODUCT anchor: ${newsItem.title} (${newsItem.date})` : `PRODUCT anchor: ${company.product_description.slice(0, 120)}`;

  const shared = [
    `TARGET: ${target.name}, ${target.title} at ${jd.company_name}`,
    `JD TITLE: ${jd.title}`,
    `JD REQUIRED (verbatim): ${jd.required.slice(0, 4).join(' | ')}`,
    `JD RESPONSIBILITIES (verbatim): ${jd.responsibilities.slice(0, 4).join(' | ')}`
  ].join('\n');

  return [
    `${shared}\n\nANCHOR: ${anchorA}\nPROOF (use verbatim or near-verbatim): ${p0.proof_text}\n\nWrite Variant A: open with the customer/ICP pain. 60-80 words.`,
    `${shared}\n\nANCHOR: ${anchorB}\nPROOF: ${p1.proof_text}\n\nWrite Variant B: open by referencing the target's recent post. 60-80 words.`,
    `${shared}\n\nANCHOR: ${anchorC}\nPROOF: ${p2.proof_text}\n\nWrite Variant C: open with the news/product item. 60-80 words.`
  ];
}

export async function generateDrafts({ jd, company, target, proofs, llmFn = defaultLLM }) {
  const prompts = buildPrompts({ jd, company, target, proofs });
  const anchorTypes = ['customer_icp', 'target_post', 'news_product'];
  const anchorSources = [
    company.customers?.[0] || null,
    target.recent_activity?.[0]?.url || null,
    company.news?.[0]?.url || null
  ];

  const drafts = [];
  for (let i = 0; i < 3; i++) {
    let attempt = 0;
    let draft = null;
    let lintFailures = [];
    while (attempt < 2) {
      const raw = await llmFn(prompts[i]);
      let parsed;
      try {
        parsed = JSON.parse(stripFences(raw));
      } catch (parseErr) {
        lintFailures = [`JSON parse error: ${parseErr.message}`];
        attempt++;
        continue;
      }
      const lint = lintDraft(parsed.body);
      if (lint.pass) {
        draft = {
          subject: parsed.subject || '',
          body: parsed.body,
          word_count: lint.wordCount,
          anchor_type: anchorTypes[i],
          anchor_source_url: anchorSources[i]
        };
        break;
      }
      lintFailures = lint.failures;
      attempt++;
    }
    if (!draft) {
      return {
        ok: false,
        errors: [`HARD STOP: Draft variant ${String.fromCharCode(65 + i)} failed after 2 attempts: ${lintFailures.join('; ')}. Review and edit manually.`]
      };
    }
    drafts.push(draft);
  }

  const v = validate('draft', { drafts });
  if (!v.ok) return { ok: false, errors: v.errors.map(e => `HARD STOP: ${e}`) };
  return { ok: true, data: { drafts } };
}

function stripFences(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

async function defaultLLM(prompt) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY missing');
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' }
    })
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('OPENROUTER_API_KEY missing or invalid');
  }
  if (!res.ok) {
    let detail = '(no body)';
    try {
      const body = await res.json();
      if (body) detail = JSON.stringify(body).slice(0, 200);
    } catch { /* non-JSON body */ }
    throw new Error(`OpenRouter ${res.status} — ${detail}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}
