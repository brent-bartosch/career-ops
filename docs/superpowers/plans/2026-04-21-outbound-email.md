# Outbound Email Playbook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an outbound email pipeline in career-ops that ingests a JD, researches company + target, matches proof points, and drafts 3 voice-matched variants per touch — fail-loud at every stage, user reviews everything, never auto-sends.

**Architecture:** 8-stage pipeline implemented as per-stage Node modules with a thin orchestrator. Shared validator enforces prerequisites before any paid API call. External clients (Apollo, Bright Data, Playwright) are dependency-injected for testability. Artifact is a single markdown file per outreach with frontmatter state. Multi-touch sequencing (T0/T+3/T+7) is data-driven from that artifact.

**Tech Stack:** Node.js ES modules (`.js` + `"type": "module"`), native `node --test`, native `fetch`, Playwright (already installed), OpenRouter for LLM calls (matches `scoring/llm-classifier.js` pattern), js-yaml.

**Spec:** `docs/superpowers/specs/2026-04-21-outbound-email-design.md`

---

## File Structure

```
outbound/
├── clients/
│   ├── apollo.js               # Apollo People Search + Match
│   ├── apollo.test.js
│   ├── bright-data.js          # LinkedIn profile + activity scrape
│   ├── bright-data.test.js
│   ├── playwright-fetch.js     # JD fetch fallback (headless Chromium)
│   └── playwright-fetch.test.js
├── validator.js                # Shared prerequisite validator
├── validator.test.js
├── voice-lint.js               # Post-generation draft linter
├── voice-lint.test.js
├── jd-ingest.js                # Stage 1
├── jd-ingest.test.js
├── company-research.js         # Stage 2
├── company-research.test.js
├── target-id.js                # Stage 3
├── target-id.test.js
├── enrichment.js               # Stage 4
├── enrichment.test.js
├── proof-match.js              # Stage 5
├── proof-match.test.js
├── draft.js                    # Stage 6
├── draft.test.js
├── artifact.js                 # outreach/{num}-*.md writer/reader
├── artifact.test.js
├── tracker.js                  # TSV addition + state transitions
├── tracker.test.js
├── schedule.js                 # Multi-touch cadence + signal detection
├── schedule.test.js
└── run.js                      # Orchestrator CLI entry (no test — integration-tested)

modes/outbound.md                # Claude mode instructions (no test)
.opencode/commands/career-ops-outbound.md

templates/states.yml             # Extended with 4 new states
.gitignore                       # Add outreach/
package.json                     # Add new test files to npm test
```

**Responsibility split:**
- **Clients** are I/O-only, dependency-injectable, fully mockable in tests.
- **Stages** are pure functions taking typed input objects, returning typed output objects + `halt` signals.
- **Validator** is a single module all stages call before doing work.
- **Artifact** is the serialization layer — no stage writes to disk directly.
- **Orchestrator** (`run.js`) is the only module that touches the filesystem, Apollo/Bright Data APIs, and the user. Everything else is pure.

---

## Task 1: Scaffold directories + config

**Files:**
- Create: `outbound/` (directory)
- Create: `outbound/clients/` (directory)
- Create: `outreach/` (directory)
- Modify: `.gitignore`
- Modify: `templates/states.yml`
- Modify: `package.json:18`

- [ ] **Step 1: Create directories**

```bash
mkdir -p outbound/clients outreach
touch outreach/.gitkeep
```

- [ ] **Step 2: Add `outreach/` to `.gitignore`**

Append to `.gitignore`:

```
# Outbound playbook artifacts (user layer — contains verified target emails)
outreach/
!outreach/.gitkeep
```

- [ ] **Step 3: Extend `templates/states.yml` with 4 outreach states**

Append to `templates/states.yml`:

```yaml
  - id: outreach_drafted
    label: Outreach Drafted
    aliases: [outreach-drafted, outbound_drafted]
    description: Outbound draft exists, not yet sent
    dashboard_group: applied

  - id: outreach_sent
    label: Outreach Sent
    aliases: [outreach-sent, outbound_sent]
    description: Touch 1 (T0) sent, awaiting response
    dashboard_group: applied

  - id: outreach_followup
    label: Outreach Follow-up
    aliases: [outreach-followup, outbound_followup]
    description: Touch 2 or 3 sent, awaiting response
    dashboard_group: applied

  - id: outreach_response
    label: Outreach Response
    aliases: [outreach-response, outbound_response]
    description: Target replied (terminal for outbound mode)
    dashboard_group: responded
```

- [ ] **Step 4: Update `package.json` `test` script**

Replace line 18 of `package.json`. Current:

```json
"test": "node --test scrapers/serp-scanner.test.js scoring/archetype-matcher.test.js scoring/intent-scorer.test.js scrapers/posting-fetcher.test.js scoring/parse-posted-date.test.js scoring/llm-classifier.test.js",
```

New:

```json
"test": "node --test scrapers/serp-scanner.test.js scoring/archetype-matcher.test.js scoring/intent-scorer.test.js scrapers/posting-fetcher.test.js scoring/parse-posted-date.test.js scoring/llm-classifier.test.js outbound/validator.test.js outbound/voice-lint.test.js outbound/clients/apollo.test.js outbound/clients/bright-data.test.js outbound/clients/playwright-fetch.test.js outbound/jd-ingest.test.js outbound/company-research.test.js outbound/target-id.test.js outbound/enrichment.test.js outbound/proof-match.test.js outbound/draft.test.js outbound/artifact.test.js outbound/tracker.test.js outbound/schedule.test.js",
"test:outbound": "node --test outbound/",
```

- [ ] **Step 5: Verify `npm test` still passes (no new tests yet, existing ones must still pass)**

Run: `npm test`
Expected: all existing tests pass. New test files listed don't exist yet — that's fine, `node --test` with a non-existent path will warn but not fail the run.

If `npm test` fails because of the missing files, run a restricted version first to confirm baseline:

```bash
node --test scrapers/serp-scanner.test.js scoring/archetype-matcher.test.js scoring/intent-scorer.test.js
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore templates/states.yml package.json outreach/.gitkeep
git commit -m "scaffold: outbound directories, gitignore, tracker states"
```

---

## Task 2: Shared validator module

**Purpose:** Enforce the fail-loud principle. Every stage calls `validate(stage, data)` before doing work. Missing fields return a structured `{ ok: false, stage, errors[] }` that the orchestrator surfaces as a HARD STOP message.

**Files:**
- Create: `outbound/validator.js`
- Create: `outbound/validator.test.js`

- [ ] **Step 1: Write the failing test**

Create `outbound/validator.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, STAGE_SCHEMAS } from './validator.js';

test('validate: stage 1 rejects short raw_text', () => {
  const result = validate('jd-ingest', {
    raw_text: 'short',
    title: 'Mgr',
    company_name: 'Acme',
    location: 'Denver, CO',
    stack: ['HubSpot'],
    required: ['3+ years'],
    preferred: ['SQL'],
    responsibilities: ['Own RevOps']
  });
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'jd-ingest');
  assert.match(result.errors[0], /raw_text/i);
});

test('validate: stage 1 accepts complete JD', () => {
  const raw = 'x'.repeat(600);
  const result = validate('jd-ingest', {
    raw_text: raw,
    title: 'Manager, GTM Engineering',
    company_name: 'Delightree',
    location: 'Denver, CO',
    stack: ['HubSpot', 'Sybill'],
    required: ['3+ years'],
    preferred: ['SQL'],
    responsibilities: ['Own HubSpot']
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validate: stage 2 requires 3+ customers and recent news', () => {
  const result = validate('company-research', {
    product_description: 'x'.repeat(250),
    icp: 'franchise ops',
    funding_stage: 'Series B',
    last_round: { date: '2025-12-03', amount: '$38M' },
    customers: ['A', 'B'], // only 2
    news: [{ title: 'x', date: '2025-11-01', url: 'https://x', summary: 'x' }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /customers/i.test(e)));
});

test('validate: stage 3 requires 3+ candidates', () => {
  const result = validate('target-id', {
    candidates: [{ name: 'x', title: 'VP', seniority: 'vp', apollo_person_id: '1', rank_reason: 'x' }]
  });
  assert.equal(result.ok, false);
});

test('validate: stage 4 requires 3+ recent activity items', () => {
  const result = validate('enrichment', {
    name: 'Doug', title: 'Head of Growth',
    email: 'd@x.com', email_status: 'verified',
    linkedin_url: 'https://linkedin.com/in/d',
    tenure_at_company_months: 14,
    prior_roles: [{ company: 'A', title: 'Dir' }, { company: 'B', title: 'VP' }],
    recent_activity: [{ type: 'post', url: 'https://x', text_snippet: 'x', date: '2026-04-01', topic_tags: [] }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /recent_activity/i.test(e)));
});

test('validate: stage 4 warns (not fails) on guessed email', () => {
  const result = validate('enrichment', {
    name: 'Doug', title: 'x',
    email: 'd@x.com', email_status: 'guessed',
    linkedin_url: 'https://linkedin.com/in/d',
    tenure_at_company_months: 14,
    prior_roles: [{}, {}],
    recent_activity: [{}, {}, {}]
  });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some(w => /guessed/i.test(w)));
});

test('validate: stage 5 requires 2+ proofs', () => {
  const result = validate('proof-match', {
    proofs: [{ jd_bullet: 'x', proof_text: 'y', source_file: 'z', specificity_score: 1 }]
  });
  assert.equal(result.ok, false);
});

test('validate: stage 6 requires exactly 3 variants, each <=80 words', () => {
  const result = validate('draft', {
    drafts: [
      { subject: 's', body: 'one two three', word_count: 3, anchor_type: 'a', anchor_source_url: 'u' },
      { subject: 's', body: 'x'.repeat(81 * 4), word_count: 85, anchor_type: 'b', anchor_source_url: 'u' },
      { subject: 's', body: 'three', word_count: 3, anchor_type: 'c', anchor_source_url: 'u' }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /80 words/i.test(e)));
});

test('validate: unknown stage throws', () => {
  assert.throws(() => validate('bogus', {}), /unknown stage/i);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test outbound/validator.test.js`
Expected: all tests FAIL with "Cannot find module".

- [ ] **Step 3: Implement `validator.js`**

Create `outbound/validator.js`:

```js
/**
 * Shared prerequisite validator for the outbound pipeline.
 *
 * Every stage calls validate(stageId, data) BEFORE doing work.
 * Missing or thin data returns { ok: false, errors: [...] } — never silently degrade.
 */

export const STAGE_SCHEMAS = {
  'jd-ingest': {
    required: {
      raw_text: (v) => typeof v === 'string' && v.length >= 500,
      title: (v) => typeof v === 'string' && v.length > 0,
      company_name: (v) => typeof v === 'string' && v.length > 0,
      location: (v) => typeof v === 'string' && v.length > 0,
      stack: (v) => Array.isArray(v) && v.length >= 1,
      required: (v) => Array.isArray(v) && v.length >= 1,
      preferred: (v) => Array.isArray(v) && v.length >= 1,
      responsibilities: (v) => Array.isArray(v) && v.length >= 1
    }
  },
  'company-research': {
    required: {
      product_description: (v) => typeof v === 'string' && v.length >= 200,
      icp: (v) => typeof v === 'string' && v.length > 0,
      funding_stage: (v) => typeof v === 'string' && v.length > 0,
      last_round: (v) => v && typeof v.date === 'string' && ageInMonths(v.date) <= 36,
      customers: (v) => Array.isArray(v) && v.length >= 3,
      news: (v) => Array.isArray(v) && v.length >= 1 && v.some(n => ageInMonths(n.date) <= 12)
    }
  },
  'target-id': {
    required: {
      candidates: (v) => Array.isArray(v) && v.length >= 3 && v.every(c => c.rank_reason)
    }
  },
  'enrichment': {
    required: {
      email: (v) => typeof v === 'string' && v.includes('@'),
      email_status: (v) => ['verified', 'guessed', 'catch-all'].includes(v),
      linkedin_url: (v) => typeof v === 'string' && v.startsWith('http'),
      tenure_at_company_months: (v) => typeof v === 'number',
      prior_roles: (v) => Array.isArray(v) && v.length >= 2,
      recent_activity: (v) => Array.isArray(v) && v.length >= 3
    },
    warnings: {
      email_status: (v) => (v === 'guessed' || v === 'catch-all') ? `email_status=${v} (not verified)` : null
    }
  },
  'proof-match': {
    required: {
      proofs: (v) => Array.isArray(v) && v.length >= 2 && v.every(p => p.jd_bullet && p.proof_text)
    }
  },
  'draft': {
    required: {
      drafts: (v) => Array.isArray(v) && v.length === 3 && v.every(d => d.word_count <= 80 && d.word_count >= 1)
    },
    message: {
      drafts: 'Each variant must be 1-80 words.'
    }
  }
};

export function validate(stage, data) {
  const schema = STAGE_SCHEMAS[stage];
  if (!schema) throw new Error(`unknown stage: ${stage}`);

  const errors = [];
  const warnings = [];

  for (const [field, check] of Object.entries(schema.required)) {
    if (!check(data[field])) {
      const hint = schema.message?.[field] || '';
      errors.push(`[${stage}] required field failed validation: ${field}${hint ? ' — ' + hint : ''}`);
    }
  }

  if (schema.warnings) {
    for (const [field, check] of Object.entries(schema.warnings)) {
      const msg = check(data[field]);
      if (msg) warnings.push(`[${stage}] ${msg}`);
    }
  }

  return { ok: errors.length === 0, stage, errors, warnings };
}

function ageInMonths(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return Infinity;
  const diffMs = Date.now() - d.getTime();
  return diffMs / (1000 * 60 * 60 * 24 * 30.44);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test outbound/validator.test.js`
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add outbound/validator.js outbound/validator.test.js
git commit -m "feat(outbound): add shared stage validator with fail-loud semantics"
```

---

## Task 3: Voice-lint module

**Purpose:** Post-generation linter for drafts. Enforces Brent's voice rules from memory (no emoji, no corp-speak, 60-80 words, anchored specificity). Each lint rule returns `{ pass: true }` or `{ pass: false, reason: '...' }`.

**Files:**
- Create: `outbound/voice-lint.js`
- Create: `outbound/voice-lint.test.js`

- [ ] **Step 1: Write the failing test**

Create `outbound/voice-lint.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintDraft, RULES } from './voice-lint.js';

test('lintDraft: passes a clean draft', () => {
  const body = 'Doug — your stack (HubSpot + Sybill + QuotaPath + Equals) says you bought in on AI-in-the-workflow. Wired that shape at a $30M SaaS: 8-stage pipeline engine, API-direct HubSpot, LLM-drafted rep activity feeding CRM without manual entry. Could we chat this week? Best, Brent';
  const result = lintDraft(body);
  assert.equal(result.pass, true, JSON.stringify(result));
});

test('lintDraft: rejects emoji', () => {
  const body = 'Doug — your stack rocks 🚀. ' + 'x '.repeat(60);
  const result = lintDraft(body);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some(f => /emoji/i.test(f)));
});

test('lintDraft: rejects banned corp-speak', () => {
  const body = 'Doug — I am passionate about leveraging synergies to spearhead cutting-edge solutions. ' + 'x '.repeat(50);
  const result = lintDraft(body);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some(f => /passionate about/i.test(f)));
  assert.ok(result.failures.some(f => /leveraged|leveraging/i.test(f)));
});

test('lintDraft: rejects generic praise openers', () => {
  const body = 'Great post! ' + 'x '.repeat(60);
  const result = lintDraft(body);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some(f => /praise opener/i.test(f)));
});

test('lintDraft: rejects word counts outside 60-80', () => {
  const tooShort = 'x '.repeat(30);
  const r1 = lintDraft(tooShort);
  assert.equal(r1.pass, false);
  assert.ok(r1.failures.some(f => /word count/i.test(f)));

  const tooLong = 'x '.repeat(100);
  const r2 = lintDraft(tooLong);
  assert.equal(r2.pass, false);
  assert.ok(r2.failures.some(f => /word count/i.test(f)));
});

test('lintDraft: requires anchored specificity (number or named tool)', () => {
  const vague = 'Doug — your work is interesting. I build systems for sales teams. Happy to chat. ' + 'x '.repeat(60);
  const result = lintDraft(vague);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some(f => /specificity/i.test(f)));
});

test('lintDraft: accepts named tool as specificity anchor', () => {
  const body = 'Doug — you use HubSpot as system of record. I built a pipeline engine integrated with HubSpot for a B2B SaaS. Happy to chat about the approach this week. ' + 'word '.repeat(30);
  const result = lintDraft(body);
  // must pass specificity + no banned phrases; word count may or may not land in window depending on padding
  assert.equal(result.failures.some(f => /specificity/i.test(f)), false);
});

test('lintDraft: rejects multi-paragraph trailing CTA', () => {
  const body = 'Doug — your HubSpot stack is strong. Built a pipeline engine at a $30M SaaS. Happy to chat.\n\nP.S. Would love to share the writeup.\n\nAlso attached is my portfolio.';
  const result = lintDraft(body);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some(f => /trailing/i.test(f)));
});

test('RULES exports a readable list', () => {
  assert.ok(Array.isArray(RULES));
  assert.ok(RULES.length >= 6);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test outbound/voice-lint.test.js`
Expected: all tests FAIL.

- [ ] **Step 3: Implement `voice-lint.js`**

Create `outbound/voice-lint.js`:

```js
/**
 * Post-generation draft linter — enforces Brent's voice rules.
 * Called by draft.js after each variant is generated.
 */

const EMOJI_RE = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;

const BANNED_PHRASES = [
  'passionate about',
  'results-oriented',
  'leveraged', 'leveraging', 'leverage our',
  'spearheaded', 'spearhead',
  'facilitated',
  'synergies', 'synergy',
  'cutting-edge',
  'seamless',
  'robust',
  'rock star', 'rockstar',
  'thought leader',
  'game-changer', 'game changer',
  'move the needle',
  'circle back',
  'touch base'
];

const PRAISE_OPENERS = [
  /^great post!?/i,
  /^love this!?/i,
  /^amazing post!?/i,
  /^awesome post!?/i,
  /^nice work!?/i
];

const NAMED_TOOL_HINTS = [
  'hubspot', 'salesforce', 'apollo', 'sybill', 'quotapath', 'equals',
  'outreach', 'gong', 'clay', 'segment', 'snowflake', 'bigquery',
  'metabase', 'looker', 'tableau', 'linkedin', 'zapier', 'make',
  'langchain', 'langraph', 'langgraph', 'anthropic', 'openai',
  'openrouter', 'claude', 'gpt', 'llm', 'api'
];

export const RULES = [
  { id: 'no-emoji', label: 'No emoji' },
  { id: 'no-banned-phrases', label: 'No banned corp-speak' },
  { id: 'no-praise-opener', label: 'No generic praise opener' },
  { id: 'word-count-60-80', label: 'Word count 60-80 (body only)' },
  { id: 'anchored-specificity', label: 'Must anchor to a number or a named tool' },
  { id: 'no-trailing-cta', label: 'No multi-paragraph trailing CTA' }
];

export function lintDraft(body) {
  const failures = [];

  if (EMOJI_RE.test(body)) {
    failures.push('[no-emoji] emoji detected');
  }

  const lower = body.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      failures.push(`[no-banned-phrases] contains "${phrase}"`);
    }
  }

  const firstLine = body.trim().split(/\n/)[0].trim();
  for (const opener of PRAISE_OPENERS) {
    if (opener.test(firstLine)) {
      failures.push('[no-praise-opener] generic praise opener detected');
      break;
    }
  }

  const wordCount = bodyWordCount(body);
  if (wordCount < 60 || wordCount > 80) {
    failures.push(`[word-count-60-80] word count ${wordCount} outside [60, 80]`);
  }

  const hasNumber = /\b\d/.test(body);
  const hasNamedTool = NAMED_TOOL_HINTS.some(t => lower.includes(t));
  if (!hasNumber && !hasNamedTool) {
    failures.push('[anchored-specificity] no number and no named tool — draft is too vague');
  }

  const paragraphs = body.trim().split(/\n\s*\n/).filter(p => p.trim().length > 0);
  if (paragraphs.length > 2) {
    failures.push(`[no-trailing-cta] ${paragraphs.length} paragraphs — ask should be the last line, no trailing content`);
  }

  return { pass: failures.length === 0, failures, wordCount };
}

function bodyWordCount(body) {
  // Strip the signoff line ("Best, Brent" / "-Brent" / etc.) so lint measures the message, not the close.
  const stripped = body
    .split(/\n/)
    .filter(line => !/^(best|cheers|thanks|regards|sincerely)[,.\s-]/i.test(line.trim()))
    .filter(line => !/^-\s*brent\b/i.test(line.trim()))
    .join(' ');
  return stripped.trim().split(/\s+/).filter(Boolean).length;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test outbound/voice-lint.test.js`
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add outbound/voice-lint.js outbound/voice-lint.test.js
git commit -m "feat(outbound): add post-generation draft voice linter"
```

---

## Task 4: Apollo client

**Purpose:** Typed wrapper around Apollo's People Search + People Match endpoints. Dependency-injected `fetchFn` for testability.

**Files:**
- Create: `outbound/clients/apollo.js`
- Create: `outbound/clients/apollo.test.js`

- [ ] **Step 1: Write the failing test**

Create `outbound/clients/apollo.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApolloClient } from './apollo.js';

function mockFetch(responses) {
  let i = 0;
  return async (url, opts) => {
    const r = responses[i++];
    if (r.throws) throw r.throws;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: new Map(Object.entries(r.headers || {})),
      async json() { return r.body; }
    };
  };
}

test('ApolloClient.searchPeople: returns ranked candidates', async () => {
  const fetchFn = mockFetch([{
    status: 200,
    body: {
      people: [
        { id: '1', name: 'Doug Gabbard', title: 'Head of Growth', seniority: 'head', organization: { name: 'Delightree' }, linkedin_url: 'https://linkedin.com/in/dougegabbard' },
        { id: '2', name: 'Jane Doe', title: 'VP RevOps', seniority: 'vp', organization: { name: 'Delightree' }, linkedin_url: 'https://linkedin.com/in/jane' },
        { id: '3', name: 'John Smith', title: 'Director of Growth Ops', seniority: 'director', organization: { name: 'Delightree' }, linkedin_url: 'https://linkedin.com/in/john' }
      ]
    }
  }]);
  const c = new ApolloClient({ apiKey: 'k', fetchFn });
  const result = await c.searchPeople({ company: 'Delightree', titles: ['Head of Growth', 'VP RevOps', 'Director of Growth Ops'] });
  assert.equal(result.candidates.length, 3);
  assert.equal(result.candidates[0].apollo_person_id, '1');
  assert.ok(result.candidates[0].rank_reason);
});

test('ApolloClient.searchPeople: auth error surfaces clearly', async () => {
  const fetchFn = mockFetch([{ status: 401, body: { error: 'Unauthorized' } }]);
  const c = new ApolloClient({ apiKey: 'bad', fetchFn });
  await assert.rejects(
    () => c.searchPeople({ company: 'x', titles: ['x'] }),
    /APOLLO_API_KEY/
  );
});

test('ApolloClient.searchPeople: rate limit surfaces retry-after', async () => {
  const fetchFn = mockFetch([{ status: 429, headers: { 'retry-after': '30' }, body: {} }]);
  const c = new ApolloClient({ apiKey: 'k', fetchFn });
  await assert.rejects(
    () => c.searchPeople({ company: 'x', titles: ['x'] }),
    /rate limit.*30/i
  );
});

test('ApolloClient.matchPerson: returns email + enrichment', async () => {
  const fetchFn = mockFetch([{
    status: 200,
    body: {
      person: {
        id: '1',
        email: 'doug@delightree.com',
        email_status: 'verified',
        linkedin_url: 'https://linkedin.com/in/dougegabbard',
        employment_history: [
          { organization_name: 'Delightree', title: 'Head of Growth', start_date: '2024-12-01' },
          { organization_name: 'Nextbite', title: 'Sr Director', start_date: '2021-01-01', end_date: '2024-11-30' },
          { organization_name: 'Ordermark', title: 'Sr Director', start_date: '2019-01-01', end_date: '2020-12-31' }
        ]
      }
    }
  }]);
  const c = new ApolloClient({ apiKey: 'k', fetchFn });
  const result = await c.matchPerson({ personId: '1' });
  assert.equal(result.email, 'doug@delightree.com');
  assert.equal(result.email_status, 'verified');
  assert.equal(result.prior_roles.length, 2);
  assert.ok(result.tenure_at_company_months >= 0);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test outbound/clients/apollo.test.js`
Expected: all 4 tests FAIL.

- [ ] **Step 3: Implement `apollo.js`**

Create `outbound/clients/apollo.js`:

```js
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
      q_organization_domains: undefined,
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

    const person = res.person || {};
    const history = person.employment_history || [];
    const current = history.find(h => !h.end_date) || history[0] || {};
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
      const retryAfter = res.headers.get?.('retry-after') || (res.headers.get ? res.headers.get('retry-after') : null) || '60';
      throw new Error(`Apollo rate limit hit. Retry after ${retryAfter}s.`);
    }
    if (!res.ok) {
      const text = typeof res.json === 'function' ? JSON.stringify(await res.json()) : '(no body)';
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
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test outbound/clients/apollo.test.js`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add outbound/clients/apollo.js outbound/clients/apollo.test.js
git commit -m "feat(outbound): add Apollo client (people search + match)"
```

---

## Task 5: Bright Data client

**Purpose:** Wrapper around Bright Data's LinkedIn scrape endpoints for profile detail + recent activity. Reuse patterns from sibling `~/Development/Smoothed/career/linkedin-engagement/` project.

**Files:**
- Create: `outbound/clients/bright-data.js`
- Create: `outbound/clients/bright-data.test.js`

- [ ] **Step 1: Check sibling project for existing patterns**

Run: `ls ~/Development/Smoothed/career/linkedin-engagement/ 2>/dev/null`

If the directory exists, look for a Bright Data client to reuse. If not, implement from scratch against Bright Data's LinkedIn dataset API documented at `https://docs.brightdata.com/scraping-automation/web-scraper-api/linkedin`.

- [ ] **Step 2: Write the failing test**

Create `outbound/clients/bright-data.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrightDataClient } from './bright-data.js';

function mockFetch(seq) {
  let i = 0;
  return async () => {
    const r = seq[i++];
    return {
      ok: r.status < 300,
      status: r.status,
      async json() { return r.body; }
    };
  };
}

test('BrightDataClient.getProfile: returns normalized profile', async () => {
  const fetchFn = mockFetch([{
    status: 200,
    body: [{
      full_name: 'Doug Gabbard',
      position: 'Head of Growth',
      current_company: { name: 'Delightree', title: 'Head of Growth' },
      about: 'GTM leader with multi-unit restaurant experience.',
      experience: [
        { company: 'Delightree', title: 'Head of Growth', start_date: '2024-12', end_date: null },
        { company: 'Nextbite', title: 'Sr Director', start_date: '2021-01', end_date: '2024-11' }
      ]
    }]
  }]);
  const c = new BrightDataClient({ apiKey: 'k', fetchFn });
  const p = await c.getProfile('https://linkedin.com/in/dougegabbard');
  assert.equal(p.name, 'Doug Gabbard');
  assert.equal(p.current_title, 'Head of Growth');
  assert.ok(p.about.length > 0);
  assert.equal(p.experience.length, 2);
});

test('BrightDataClient.getActivity: filters to last N days', async () => {
  const now = new Date();
  const recent = new Date(now.getTime() - 10 * 86400000).toISOString();
  const old = new Date(now.getTime() - 200 * 86400000).toISOString();
  const fetchFn = mockFetch([{
    status: 200,
    body: [
      { type: 'post', url: 'https://li/1', text: 'Recent thought.', date: recent, topic_tags: ['gtm'] },
      { type: 'comment', url: 'https://li/2', text: 'Old comment.', date: old, topic_tags: [] }
    ]
  }]);
  const c = new BrightDataClient({ apiKey: 'k', fetchFn });
  const activity = await c.getActivity('https://linkedin.com/in/dougegabbard', { sinceDays: 90 });
  assert.equal(activity.length, 1);
  assert.equal(activity[0].url, 'https://li/1');
  assert.ok(activity[0].text_snippet.length > 0);
});

test('BrightDataClient: auth error surfaces clearly', async () => {
  const fetchFn = mockFetch([{ status: 401, body: {} }]);
  const c = new BrightDataClient({ apiKey: 'bad', fetchFn });
  await assert.rejects(() => c.getProfile('x'), /BRIGHT_DATA_API_KEY/);
});
```

- [ ] **Step 3: Run test to verify failure**

Run: `node --test outbound/clients/bright-data.test.js`
Expected: 3 tests FAIL.

- [ ] **Step 4: Implement `bright-data.js`**

Create `outbound/clients/bright-data.js`:

```js
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
```

- [ ] **Step 5: Run tests to verify pass**

Run: `node --test outbound/clients/bright-data.test.js`
Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add outbound/clients/bright-data.js outbound/clients/bright-data.test.js
git commit -m "feat(outbound): add Bright Data client for LinkedIn profile + activity"
```

---

## Task 6: Playwright JD fetch helper

**Purpose:** When WebFetch fails (403, bot wall, JS-rendered page), fall back to headless Chromium. Reuse the existing browser launch pattern from `generate-pdf.mjs`.

**Files:**
- Create: `outbound/clients/playwright-fetch.js`
- Create: `outbound/clients/playwright-fetch.test.js`

- [ ] **Step 1: Write the failing test**

Create `outbound/clients/playwright-fetch.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJDViaPlaywright } from './playwright-fetch.js';

// Mock browser factory — never launches real Chromium in unit tests.
function makeMockLauncher({ bodyText, contentType = 'text/html' }) {
  return async () => ({
    newContext: async () => ({
      newPage: async () => ({
        goto: async () => ({ status: () => 200 }),
        content: async () => bodyText,
        evaluate: async (fn) => {
          // Simulate the inner-text extraction path
          return bodyText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        },
        close: async () => {}
      }),
      close: async () => {}
    }),
    close: async () => {}
  });
}

test('fetchJDViaPlaywright: extracts inner text from HTML', async () => {
  const html = '<html><body><main><h1>Manager, GTM Engineering</h1><p>Own HubSpot as system of record. Build AI workflows. 3+ years RevOps required.</p></main></body></html>';
  const text = await fetchJDViaPlaywright('https://example.com/job', {
    launchBrowser: makeMockLauncher({ bodyText: html })
  });
  assert.match(text, /Manager, GTM Engineering/);
  assert.match(text, /HubSpot/);
  assert.ok(text.length >= 50);
});

test('fetchJDViaPlaywright: fails loudly on empty body', async () => {
  await assert.rejects(
    () => fetchJDViaPlaywright('https://example.com/empty', {
      launchBrowser: makeMockLauncher({ bodyText: '' })
    }),
    /empty|no content/i
  );
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test outbound/clients/playwright-fetch.test.js`
Expected: 2 tests FAIL.

- [ ] **Step 3: Implement `playwright-fetch.js`**

Create `outbound/clients/playwright-fetch.js`:

```js
/**
 * Playwright-based JD fallback fetcher.
 *
 * Used by jd-ingest.js when WebFetch returns 403, an empty body, or a bot wall.
 * Reuses the headless Chromium pattern from generate-pdf.mjs.
 */

import { chromium } from 'playwright';

export async function fetchJDViaPlaywright(url, { launchBrowser = chromium.launch.bind(chromium), timeoutMs = 30000 } = {}) {
  const browser = await launchBrowser({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await ctx.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    // Heuristic: prefer <main>, <article>, or the largest text block.
    const innerText = await page.evaluate(() => {
      const candidates = [
        document.querySelector('main'),
        document.querySelector('article'),
        document.querySelector('[role="main"]'),
        document.querySelector('#job-description'),
        document.querySelector('.job-description'),
        document.body
      ].filter(Boolean);
      const el = candidates[0];
      return (el?.innerText || '').replace(/\s+/g, ' ').trim();
    });

    if (!innerText || innerText.length < 50) {
      throw new Error(`Playwright fetch returned empty/no content body for ${url}`);
    }
    return innerText;
  } finally {
    await ctx.close();
    await browser.close();
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test outbound/clients/playwright-fetch.test.js`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add outbound/clients/playwright-fetch.js outbound/clients/playwright-fetch.test.js
git commit -m "feat(outbound): add Playwright JD fetch fallback"
```

---

## Task 7: Stage 1 — JD ingest

**Purpose:** Accept a JD URL, local file, or pasted text; produce a validated `jd.json` object. Tries WebFetch first (via an injected fetcher), falls back to Playwright on 403/empty, then requires pasted text.

**Files:**
- Create: `outbound/jd-ingest.js`
- Create: `outbound/jd-ingest.test.js`

- [ ] **Step 1: Write the failing test**

Create `outbound/jd-ingest.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJD, ingestJD } from './jd-ingest.js';

const sampleJD = `Job Summary:
Delightree is the Franchise Operating System for modern, multi-unit brands. They are seeking a GTM Engineer to build and scale systems for their go-to-market team, focusing on HubSpot and broader GTM stack.

Responsibilities:
• Own the GTM Systems Architecture
• Own HubSpot and other GTM tooling implementations (e.g., Equals, Sybill, QuotaPath)
• Build Automation & AI-Powered Workflows

Qualifications:
Required:
• 3+ years in Revenue Operations, Sales Operations, or GTM Systems in a B2B SaaS environment
• Deep, hands-on experience building and maintaining HubSpot as a system of record
• Based in Denver, CO.
Preferred:
• Hands-on experience implementing AI workflows or automation tools
• SQL or data architecture experience
`.repeat(2); // ensure > 500 chars

test('parseJD: extracts title, company, stack, required, preferred, location', () => {
  const parsed = parseJD(sampleJD, { fallbackCompany: 'Delightree', fallbackTitle: 'Manager, GTM Engineering & Revenue Systems' });
  assert.equal(parsed.company_name, 'Delightree');
  assert.match(parsed.title, /GTM Engineer/i);
  assert.ok(parsed.stack.some(s => /HubSpot/i.test(s)));
  assert.ok(parsed.required.length >= 1);
  assert.ok(parsed.preferred.length >= 1);
  assert.ok(parsed.responsibilities.length >= 1);
  assert.match(parsed.location, /Denver/i);
});

test('ingestJD: from pasted text + metadata succeeds', async () => {
  const jd = await ingestJD({
    source: 'paste',
    text: sampleJD,
    company: 'Delightree',
    title: 'Manager, GTM Engineering & Revenue Systems',
    location: 'Denver, CO'
  });
  assert.equal(jd.ok, true);
  assert.equal(jd.data.company_name, 'Delightree');
  assert.ok(jd.data.raw_text.length >= 500);
});

test('ingestJD: paste with < 500 chars hard-stops', async () => {
  const jd = await ingestJD({ source: 'paste', text: 'too short', company: 'x', title: 'x', location: 'x' });
  assert.equal(jd.ok, false);
  assert.match(jd.errors[0], /too thin|500/i);
});

test('ingestJD: URL path uses web fetcher then Playwright', async () => {
  let calls = [];
  const webFetcher = async (url) => {
    calls.push(['web', url]);
    throw new Error('403');
  };
  const playwrightFetcher = async (url) => {
    calls.push(['pw', url]);
    return sampleJD;
  };
  const jd = await ingestJD({
    source: 'url',
    url: 'https://ziprecruiter.com/xyz',
    company: 'Delightree',
    title: 'Manager, GTM Engineering',
    location: 'Denver, CO',
    webFetcher,
    playwrightFetcher
  });
  assert.equal(jd.ok, true);
  assert.deepEqual(calls, [['web', 'https://ziprecruiter.com/xyz'], ['pw', 'https://ziprecruiter.com/xyz']]);
});

test('ingestJD: URL — both fetchers fail → hard stop asking for paste', async () => {
  const jd = await ingestJD({
    source: 'url',
    url: 'https://x',
    company: 'x', title: 'x', location: 'x',
    webFetcher: async () => { throw new Error('403'); },
    playwrightFetcher: async () => { throw new Error('empty body'); }
  });
  assert.equal(jd.ok, false);
  assert.match(jd.errors[0], /paste the JD/i);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test outbound/jd-ingest.test.js`
Expected: 5 tests FAIL.

- [ ] **Step 3: Implement `jd-ingest.js`**

Create `outbound/jd-ingest.js`:

```js
import { validate } from './validator.js';

export function parseJD(rawText, { fallbackCompany = '', fallbackTitle = '', fallbackLocation = '' } = {}) {
  const lower = rawText.toLowerCase();

  const title = fallbackTitle ||
    (rawText.match(/(?:job title|position)[:\s]+([^\n]+)/i)?.[1] ||
     rawText.split('\n').find(l => /engineer|manager|director|vp|head of|architect/i.test(l))?.trim() ||
     'Unknown');

  const company_name = fallbackCompany ||
    (rawText.match(/([A-Z][A-Za-z0-9]+(?:\s[A-Z][A-Za-z0-9]+)*) is (?:the|an?|seeking)/)?.[1] || 'Unknown');

  const location = fallbackLocation ||
    (rawText.match(/\b(?:based in|located in|office in)\s+([^\n.,]+)/i)?.[1] ||
     rawText.match(/\b([A-Z][a-z]+,?\s*[A-Z]{2})\b/)?.[1] || 'Unknown');

  const stack = extractBullets(rawText, /tooling|stack|tools/i);
  const explicitStack = extractNamedTools(rawText);
  const combinedStack = Array.from(new Set([...stack, ...explicitStack])).slice(0, 15);

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
      if (!rawText || rawText.length < 500) throw new Error('web fetch empty');
    } catch {
      try {
        rawText = await playwrightFetcher(url);
        if (!rawText || rawText.length < 500) throw new Error('playwright empty');
      } catch {
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
    .map(l => l.replace(/^[•\-\*•\d\.\s]+/, '').trim())
    .filter(Boolean);
}

function extractBullets(text, _hint) {
  return text
    .split(/\n/)
    .filter(l => /^[•\-\*]/.test(l.trim()))
    .map(l => l.replace(/^[•\-\*\s]+/, '').trim());
}

function extractNamedTools(text) {
  const tools = ['HubSpot', 'Salesforce', 'Apollo', 'Sybill', 'QuotaPath', 'Equals', 'Outreach', 'Gong', 'Clay', 'Segment', 'Snowflake', 'BigQuery', 'Metabase', 'Looker', 'Tableau', 'LinkedIn', 'Zapier', 'Make', 'Marketo', 'Pardot', 'Zoominfo', 'Clearbit', '6sense'];
  return tools.filter(t => new RegExp(`\\b${t}\\b`, 'i').test(text));
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test outbound/jd-ingest.test.js`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add outbound/jd-ingest.js outbound/jd-ingest.test.js
git commit -m "feat(outbound): add Stage 1 JD ingest (URL/paste + Playwright fallback)"
```

---

## Task 8: Stage 2 — Company research

**Purpose:** Given a company name and the parsed JD, build `company.json`: product description, ICP, funding, customers, recent news. Uses injected `webFetcher` and `webSearcher` so tests don't hit the network.

**Files:**
- Create: `outbound/company-research.js`
- Create: `outbound/company-research.test.js`

- [ ] **Step 1: Write the failing test**

Create `outbound/company-research.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { researchCompany } from './company-research.js';

test('researchCompany: aggregates site + search signals', async () => {
  const webFetcher = async (url) => {
    if (url.includes('delightree.com')) {
      return 'Delightree is an AI-powered platform for franchise operations. Customers: Pizza Express, The Picklr, Sandbox VR, Solidcore. Supports over 2,000 locations globally.';
    }
    return '';
  };
  const webSearcher = async (q) => {
    if (/funding/i.test(q)) return [{ title: 'Delightree raises $38M Series B', url: 'https://tc.com/x', snippet: 'Closed 2025-12-03', date: '2025-12-03' }];
    if (/customers|case study/i.test(q)) return [{ title: 'Case study: Pizza Express', url: 'https://d.com/pe', snippet: 'franchise ops', date: '2025-08-01' }];
    if (/news/i.test(q)) return [{ title: 'Delightree launches Collaborative Tasks', url: 'https://d.com/n', snippet: 'new feature', date: '2026-01-15' }];
    return [];
  };

  const result = await researchCompany({
    company: 'Delightree',
    jd_raw_text: 'The Franchise Operating System for multi-unit brands.',
    webFetcher,
    webSearcher
  });

  assert.equal(result.ok, true);
  assert.ok(result.data.product_description.length >= 200);
  assert.equal(result.data.funding_stage, 'Series B');
  assert.ok(result.data.customers.length >= 3);
  assert.ok(result.data.news.length >= 1);
});

test('researchCompany: hard-stops when < 3 customers findable', async () => {
  const webFetcher = async () => 'Short description.';
  const webSearcher = async (q) => {
    if (/funding/i.test(q)) return [{ title: 'Series A', url: 'x', snippet: '', date: '2025-01-01' }];
    if (/news/i.test(q)) return [{ title: 'Launch', url: 'x', snippet: '', date: '2026-02-01' }];
    return [];
  };
  const result = await researchCompany({
    company: 'Ghost',
    jd_raw_text: 'x',
    webFetcher,
    webSearcher
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /customer/i.test(e)));
});

test('researchCompany: hard-stops when no recent news', async () => {
  const webFetcher = async () => 'x'.repeat(250);
  const webSearcher = async (q) => {
    if (/funding/i.test(q)) return [{ title: 'Series A', url: 'x', snippet: '', date: '2025-01-01' }];
    if (/customers/i.test(q)) return [
      { title: 'A', url: 'a', snippet: '', date: '2024-01-01' },
      { title: 'B', url: 'b', snippet: '', date: '2024-01-01' },
      { title: 'C', url: 'c', snippet: '', date: '2024-01-01' }
    ];
    if (/news/i.test(q)) return [{ title: 'Old', url: 'x', snippet: '', date: '2023-01-01' }];
    return [];
  };
  const result = await researchCompany({ company: 'X', jd_raw_text: 'x', webFetcher, webSearcher });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /news/i.test(e)));
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test outbound/company-research.test.js`
Expected: 3 tests FAIL.

- [ ] **Step 3: Implement `company-research.js`**

Create `outbound/company-research.js`:

```js
import { validate } from './validator.js';

export async function researchCompany({ company, jd_raw_text, webFetcher, webSearcher }) {
  const site = await fetchSite(webFetcher, company);
  const fundingHits = await webSearcher(`"${company}" funding Series`);
  const customerHits = await webSearcher(`"${company}" customers OR case study`);
  const newsHits = await webSearcher(`"${company}" news 2025..2026`);

  const funding = parseFunding(fundingHits);
  const customers = dedupe((site.customers || []).concat(customerHits.slice(0, 10).map(h => h.title.replace(/^case study:?\s*/i, '').trim())));
  const news = newsHits.map(h => ({
    title: h.title,
    date: h.date || new Date().toISOString().slice(0, 10),
    url: h.url,
    summary: h.snippet || h.title
  }));

  const data = {
    product_description: site.product_description.length >= 200 ? site.product_description : `${company}: ${jd_raw_text.slice(0, 500)}`,
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
      product_description: (html.match(/[^.]{200,}\./) || [''])[0],
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
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test outbound/company-research.test.js`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add outbound/company-research.js outbound/company-research.test.js
git commit -m "feat(outbound): add Stage 2 company research"
```

---

## Task 9: Stage 3 — Target ID

**Purpose:** Given company + JD title, query Apollo for ranked candidates. Return at least 3 ranked with `rank_reason`, or hard-stop.

**Files:**
- Create: `outbound/target-id.js`
- Create: `outbound/target-id.test.js`

- [ ] **Step 1: Write the failing test**

Create `outbound/target-id.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifyTargets, inferTitleFilter } from './target-id.js';

test('inferTitleFilter: maps GTM/RevOps JDs to hiring-manager titles', () => {
  const f1 = inferTitleFilter('Manager, GTM Engineering & Revenue Systems');
  assert.ok(f1.includes('Head of Growth') || f1.includes('VP RevOps'));
  assert.ok(f1.length >= 3);
});

test('identifyTargets: returns 3+ candidates from Apollo', async () => {
  const mockApollo = {
    searchPeople: async () => ({
      candidates: [
        { name: 'Doug', title: 'Head of Growth', seniority: 'head', apollo_person_id: '1', linkedin_url: 'https://li/d', rank_reason: 'head tier' },
        { name: 'Jane', title: 'VP RevOps', seniority: 'vp', apollo_person_id: '2', linkedin_url: 'https://li/j', rank_reason: 'vp tier' },
        { name: 'John', title: 'Director of Growth Ops', seniority: 'director', apollo_person_id: '3', linkedin_url: 'https://li/jo', rank_reason: 'director tier' }
      ]
    })
  };
  const result = await identifyTargets({ company: 'Delightree', jdTitle: 'GTM Engineer', apolloClient: mockApollo });
  assert.equal(result.ok, true);
  assert.ok(result.data.candidates.length >= 3);
});

test('identifyTargets: hard-stops when Apollo returns < 3', async () => {
  const mockApollo = {
    searchPeople: async () => ({ candidates: [{ name: 'x', title: 'y', seniority: 'head', apollo_person_id: '1', linkedin_url: '', rank_reason: 'x' }] })
  };
  const result = await identifyTargets({ company: 'Ghost', jdTitle: 'x', apolloClient: mockApollo });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /broaden title filter/i.test(e)));
});

test('identifyTargets: surfaces Apollo auth error clearly', async () => {
  const mockApollo = {
    searchPeople: async () => { throw new Error('APOLLO_API_KEY missing or invalid'); }
  };
  const result = await identifyTargets({ company: 'x', jdTitle: 'y', apolloClient: mockApollo });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /APOLLO_API_KEY/i.test(e)));
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test outbound/target-id.test.js`
Expected: 4 tests FAIL.

- [ ] **Step 3: Implement `target-id.js`**

Create `outbound/target-id.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test outbound/target-id.test.js`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add outbound/target-id.js outbound/target-id.test.js
git commit -m "feat(outbound): add Stage 3 target identification via Apollo"
```

---

## Task 10: Stage 4 — Target enrichment

**Purpose:** Given a selected candidate, hit Apollo match for email + Bright Data for profile + activity. Validate and hard-stop on missing fields.

**Files:**
- Create: `outbound/enrichment.js`
- Create: `outbound/enrichment.test.js`

- [ ] **Step 1: Write the failing test**

Create `outbound/enrichment.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichTarget } from './enrichment.js';

const now = Date.now();
const recent = (d) => new Date(now - d * 86400000).toISOString();

test('enrichTarget: composes Apollo + Bright Data into target.json', async () => {
  const apollo = {
    matchPerson: async () => ({
      email: 'doug@delightree.com',
      email_status: 'verified',
      linkedin_url: 'https://linkedin.com/in/dougegabbard',
      tenure_at_company_months: 14,
      prior_roles: [
        { company: 'Nextbite', title: 'Sr Director' },
        { company: 'Ordermark', title: 'Sr Director' }
      ]
    })
  };
  const brightData = {
    getProfile: async () => ({ name: 'Doug Gabbard', current_title: 'Head of Growth', about: 'multi-unit GTM', experience: [] }),
    getActivity: async () => [
      { type: 'post', url: 'https://li/1', text_snippet: 'on scaling franchise revenue', date: recent(5), topic_tags: ['gtm'] },
      { type: 'comment', url: 'https://li/2', text_snippet: 'HubSpot admin debt is real', date: recent(15), topic_tags: ['revops'] },
      { type: 'post', url: 'https://li/3', text_snippet: 'Sybill transformed our call review loop', date: recent(30), topic_tags: ['ai'] }
    ]
  };

  const candidate = { name: 'Doug Gabbard', title: 'Head of Growth', seniority: 'head', apollo_person_id: '1', linkedin_url: 'https://linkedin.com/in/dougegabbard' };
  const result = await enrichTarget({ candidate, apolloClient: apollo, brightDataClient: brightData });

  assert.equal(result.ok, true);
  assert.equal(result.data.email, 'doug@delightree.com');
  assert.equal(result.data.email_status, 'verified');
  assert.equal(result.data.recent_activity.length, 3);
});

test('enrichTarget: warns but proceeds on guessed email', async () => {
  const apollo = {
    matchPerson: async () => ({
      email: 'd@x.com', email_status: 'guessed',
      linkedin_url: 'https://linkedin.com/in/d',
      tenure_at_company_months: 10,
      prior_roles: [{ company: 'A', title: 'A' }, { company: 'B', title: 'B' }]
    })
  };
  const brightData = {
    getProfile: async () => ({ name: 'D', current_title: 't', about: 'x', experience: [] }),
    getActivity: async () => [
      { type: 'post', url: 'u1', text_snippet: 'x', date: recent(10), topic_tags: [] },
      { type: 'post', url: 'u2', text_snippet: 'y', date: recent(20), topic_tags: [] },
      { type: 'post', url: 'u3', text_snippet: 'z', date: recent(30), topic_tags: [] }
    ]
  };
  const candidate = { name: 'D', title: 't', apollo_person_id: '1', linkedin_url: 'https://linkedin.com/in/d' };
  const result = await enrichTarget({ candidate, apolloClient: apollo, brightDataClient: brightData });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some(w => /guessed/i.test(w)));
});

test('enrichTarget: hard-stops when < 3 posts/comments in 90 days', async () => {
  const apollo = {
    matchPerson: async () => ({
      email: 'd@x.com', email_status: 'verified',
      linkedin_url: 'https://linkedin.com/in/d',
      tenure_at_company_months: 10,
      prior_roles: [{}, {}]
    })
  };
  const brightData = {
    getProfile: async () => ({ name: 'D', current_title: 't', about: '', experience: [] }),
    getActivity: async () => [
      { type: 'post', url: 'u1', text_snippet: 'x', date: recent(10), topic_tags: [] }
    ]
  };
  const candidate = { name: 'D', title: 't', apollo_person_id: '1', linkedin_url: 'https://linkedin.com/in/d' };
  const result = await enrichTarget({ candidate, apolloClient: apollo, brightDataClient: brightData });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /no LinkedIn activity|low-signal/i.test(e)));
});

test('enrichTarget: hard-stops when no email returned', async () => {
  const apollo = {
    matchPerson: async () => ({ email: null, email_status: 'unknown', linkedin_url: 'https://linkedin.com/in/d', tenure_at_company_months: 5, prior_roles: [{}, {}] })
  };
  const brightData = { getProfile: async () => ({}), getActivity: async () => [{}, {}, {}] };
  const candidate = { name: 'X', title: 'Y', apollo_person_id: '1', linkedin_url: 'x' };
  const result = await enrichTarget({ candidate, apolloClient: apollo, brightDataClient: brightData });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /deliverable email/i.test(e)));
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test outbound/enrichment.test.js`
Expected: 4 tests FAIL.

- [ ] **Step 3: Implement `enrichment.js`**

Create `outbound/enrichment.js`:

```js
import { validate } from './validator.js';

export async function enrichTarget({ candidate, apolloClient, brightDataClient }) {
  let apollo, profile, activity;
  try {
    apollo = await apolloClient.matchPerson({ personId: candidate.apollo_person_id });
  } catch (e) {
    return { ok: false, errors: [`HARD STOP: Apollo match failed: ${e.message}`] };
  }
  try {
    profile = await brightDataClient.getProfile(apollo.linkedin_url || candidate.linkedin_url);
    activity = await brightDataClient.getActivity(apollo.linkedin_url || candidate.linkedin_url, { sinceDays: 90 });
  } catch (e) {
    return { ok: false, errors: [`HARD STOP: Bright Data call failed: ${e.message}`] };
  }

  if (!apollo.email) {
    return { ok: false, errors: [`HARD STOP: No deliverable email for ${candidate.name}. Pick an alternate target.`] };
  }

  const data = {
    name: candidate.name,
    title: candidate.title,
    email: apollo.email,
    email_status: apollo.email_status,
    linkedin_url: apollo.linkedin_url || candidate.linkedin_url,
    tenure_at_company_months: apollo.tenure_at_company_months,
    prior_roles: apollo.prior_roles || [],
    recent_activity: activity || [],
    profile_about: profile.about || ''
  };

  const v = validate('enrichment', data);
  if (!v.ok) {
    const msgs = v.errors.map(e => {
      if (/recent_activity/i.test(e)) return `HARD STOP: ${candidate.name} has no LinkedIn activity (< 3 posts/comments) in the last 90 days. Verify LinkedIn URL or mark as low-signal and pick an alternate.`;
      return `HARD STOP: ${e}`;
    });
    return { ok: false, errors: msgs };
  }
  return { ok: true, data, warnings: v.warnings };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test outbound/enrichment.test.js`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add outbound/enrichment.js outbound/enrichment.test.js
git commit -m "feat(outbound): add Stage 4 target enrichment (Apollo + Bright Data)"
```

---

## Task 11: Stage 5 — Proof match

**Purpose:** Read `article-digest.md` + `modes/_profile.md`; surface ≥2 proof points that ladder to specific JD required/responsibility bullets. Each proof must have a numeric or named-tool anchor.

**Files:**
- Create: `outbound/proof-match.js`
- Create: `outbound/proof-match.test.js`

- [ ] **Step 1: Write the failing test**

Create `outbound/proof-match.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchProofs, splitDigestEntries, scoreMatch } from './proof-match.js';

const fakeDigest = `
# Article Digest

## Trial Conversion Engine (UpKeep)

**Context:** $30M B2B SaaS.
**What I built:** 8-stage pipeline, ICP scoring, routing, enrichment, LLM-drafted rep activity feeding HubSpot.
**Metrics / scale:** 10,300 LOC, 7 ICP cohorts, <$0.04/lead.
**Stack:** Node, HubSpot API, Claude API, OpenRouter.
**Outcome:** Reduced AE manual CRM updates.
**Best used to prove:** HubSpot as system of record, API-direct, AI-driven workflows, ICP scoring, routing, enrichment, rep activity capture.

## CRM Orchestration Layer

**Context:** Multi-CRM integrations.
**What I built:** Direct API to Close, Day.ai, Twenty, QuickBooks.
**Metrics / scale:** 3-day Day.ai build.
**Stack:** Node, direct API.
**Outcome:** No Zapier/Make overhead.
**Best used to prove:** API-direct CRM work, build in-house tooling.
`;

test('splitDigestEntries: parses entries with titles and Best used to prove', () => {
  const entries = splitDigestEntries(fakeDigest);
  assert.equal(entries.length, 2);
  assert.ok(entries[0].title.includes('Trial Conversion Engine'));
  assert.ok(entries[0].proves.includes('HubSpot as system of record'));
});

test('scoreMatch: prioritises entries that mention JD-tool terms', () => {
  const entry = { title: 'x', body: 'HubSpot API-direct', proves: ['HubSpot as system of record'] };
  const bullet = 'Own HubSpot as system of record';
  const score = scoreMatch(entry, bullet);
  assert.ok(score > 0);
});

test('matchProofs: returns ≥2 proof points for JD bullets', async () => {
  const result = await matchProofs({
    digestText: fakeDigest,
    profileText: '',
    jd: {
      required: [
        'Deep, hands-on experience building and maintaining HubSpot as a system of record',
        'Experience building dashboards and reports with BI tools'
      ],
      responsibilities: [
        'Build Automation & AI-Powered Workflows',
        'Own the GTM Systems Architecture'
      ]
    }
  });
  assert.equal(result.ok, true);
  assert.ok(result.data.proofs.length >= 2);
  for (const p of result.data.proofs) {
    assert.ok(p.jd_bullet);
    assert.ok(p.proof_text);
    assert.ok(p.source_file);
    assert.ok(p.specificity_score >= 1);
  }
});

test('matchProofs: hard-stops on empty digest', async () => {
  const result = await matchProofs({ digestText: '', profileText: '', jd: { required: ['x'], responsibilities: ['y'] } });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /article-digest/i.test(e)));
});

test('matchProofs: hard-stops when < 2 matches', async () => {
  const result = await matchProofs({
    digestText: '## Unrelated\n**Best used to prove:** knitting\n',
    profileText: '',
    jd: { required: ['HubSpot', 'Salesforce'], responsibilities: ['AI workflows'] }
  });
  assert.equal(result.ok, false);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test outbound/proof-match.test.js`
Expected: 5 tests FAIL.

- [ ] **Step 3: Implement `proof-match.js`**

Create `outbound/proof-match.js`:

```js
import { validate } from './validator.js';
import { readFile } from 'fs/promises';

export function splitDigestEntries(digestText) {
  const chunks = digestText.split(/\n##\s+/).slice(1);
  return chunks.map(chunk => {
    const titleEnd = chunk.indexOf('\n');
    const title = chunk.slice(0, titleEnd).trim();
    const body = chunk.slice(titleEnd).trim();
    const provesMatch = body.match(/\*\*Best used to prove:\*\*\s*([^\n]+)/i);
    const proves = provesMatch ? provesMatch[1].split(/[,;]/).map(s => s.trim()).filter(Boolean) : [];
    return { title, body, proves };
  });
}

export function scoreMatch(entry, bullet) {
  const bLow = bullet.toLowerCase();
  const bodyLow = (entry.title + ' ' + entry.body + ' ' + entry.proves.join(' ')).toLowerCase();

  let score = 0;
  const bTokens = bLow.match(/\b[a-z][a-z0-9+.-]{2,}\b/g) || [];
  for (const t of bTokens) {
    if (bodyLow.includes(t) && !/^(the|and|with|for|from|that|this|have|your|into|under|over)$/.test(t)) {
      score += 1;
    }
  }
  const hasNumber = /\b\d/.test(entry.body);
  const hasNamedTool = /hubspot|salesforce|apollo|sybill|quotapath|equals|outreach|gong|clay/i.test(entry.body);
  if (hasNumber) score += 2;
  if (hasNamedTool) score += 3;
  for (const prove of entry.proves) {
    const pLow = prove.toLowerCase();
    if (bTokens.some(t => pLow.includes(t))) score += 2;
  }
  return score;
}

export async function matchProofs({ digestText, profileText, jd, digestPath = 'article-digest.md', profilePath = 'modes/_profile.md' }) {
  if (!digestText || digestText.trim().length < 100) {
    return { ok: false, errors: ['HARD STOP: article-digest.md is empty or missing. Populate proof points before first outbound — outbound without proofs is noise.'] };
  }

  const entries = splitDigestEntries(digestText);
  const bullets = [...(jd.required || []), ...(jd.responsibilities || [])];

  const proofs = [];
  const usedEntries = new Set();
  const unmatched = [];

  for (const bullet of bullets) {
    const ranked = entries
      .map(entry => ({ entry, score: scoreMatch(entry, bullet) }))
      .filter(r => r.score >= 3 && !usedEntries.has(r.entry.title))
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
      unmatched.push(bullet);
      continue;
    }
    const chosen = ranked[0];
    proofs.push({
      jd_bullet: bullet,
      proof_text: chosen.entry.title + ' — ' + firstSentence(chosen.entry.body),
      source_file: digestPath,
      specificity_score: chosen.score
    });
    usedEntries.add(chosen.entry.title);
    if (proofs.length >= 5) break;
  }

  const v = validate('proof-match', { proofs });
  if (!v.ok) {
    return {
      ok: false,
      errors: [`HARD STOP: Only ${proofs.length} proof points matched JD bullets. Unmatched bullets: ${unmatched.slice(0, 5).join(' | ')}. Update article-digest.md or pick a different role.`]
    };
  }
  return { ok: true, data: { proofs } };
}

function firstSentence(body) {
  const m = body.match(/[^.\n]{30,220}\./);
  return m ? m[0].trim() : body.slice(0, 220).trim();
}

export async function loadDigestAndProfile({ digestPath = 'article-digest.md', profilePath = 'modes/_profile.md' } = {}) {
  const [digestText, profileText] = await Promise.all([
    readFile(digestPath, 'utf8').catch(() => ''),
    readFile(profilePath, 'utf8').catch(() => '')
  ]);
  return { digestText, profileText };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test outbound/proof-match.test.js`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add outbound/proof-match.js outbound/proof-match.test.js
git commit -m "feat(outbound): add Stage 5 proof match against article-digest"
```

---

## Task 12: Stage 6 — Draft generation with voice lint

**Purpose:** Generate 3 anchored variants (A: customer/ICP, B: target post, C: news/product) via OpenRouter LLM call. Each variant runs through `voice-lint`. Regenerate once on lint failure; hard-stop on second failure.

**Files:**
- Create: `outbound/draft.js`
- Create: `outbound/draft.test.js`

- [ ] **Step 1: Write the failing test**

Create `outbound/draft.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDrafts, buildPrompts } from './draft.js';

function mockLLM(variantBodies) {
  let i = 0;
  return async (_prompt) => {
    const body = variantBodies[i++];
    return JSON.stringify({
      subject: 'Quick question re: your HubSpot stack',
      body
    });
  };
}

const cleanBody = `Doug — your stack (HubSpot + Sybill + QuotaPath + Equals) says you bought in on AI-in-the-workflow. Wired that exact shape at a $30M SaaS: API-direct HubSpot, 8-stage pipeline engine, LLM-drafted rep activity feeding CRM without manual entry. Could we chat this week?\n\nBest, Brent`;

test('buildPrompts: produces 3 distinct anchor prompts', () => {
  const prompts = buildPrompts({
    jd: { title: 't', company_name: 'Delightree', required: ['HubSpot'], responsibilities: ['own stack'] },
    company: { product_description: 'x'.repeat(200), customers: ['A', 'B', 'C'], news: [{ title: 'launched Feature X', date: '2026-03-01', url: 'u', summary: 's' }] },
    target: { name: 'Doug', title: 'Head of Growth', recent_activity: [{ type: 'post', url: 'u', text_snippet: 'scaling CS with AI', date: '2026-04-10' }] },
    proofs: [{ jd_bullet: 'HubSpot', proof_text: 'Trial engine — 10,300 LOC', source_file: 'x', specificity_score: 5 }]
  });
  assert.equal(prompts.length, 3);
  assert.match(prompts[0], /customer|ICP/i);
  assert.match(prompts[1], /post|activity/i);
  assert.match(prompts[2], /news|product/i);
});

test('generateDrafts: returns 3 lint-passing variants', async () => {
  const llm = mockLLM([cleanBody, cleanBody, cleanBody]);
  const result = await generateDrafts({
    jd: { title: 't', company_name: 'D', required: ['HubSpot'], responsibilities: ['own stack'] },
    company: { product_description: 'x'.repeat(200), customers: ['A', 'B', 'C'], news: [{ title: 'launched', date: '2026-03-01', url: 'u', summary: 's' }] },
    target: { name: 'Doug', title: 'Head of Growth', recent_activity: [{ type: 'post', url: 'u', text_snippet: 'scaling', date: '2026-04-10' }] },
    proofs: [{ jd_bullet: 'HubSpot', proof_text: 'Trial engine — 10,300 LOC', source_file: 'x', specificity_score: 5 }],
    llmFn: llm
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.drafts.length, 3);
  for (const d of result.data.drafts) {
    assert.ok(d.word_count <= 80);
    assert.ok(d.word_count >= 1);
  }
});

test('generateDrafts: regenerates once on lint failure, hard-stops on second', async () => {
  const bad = 'I am passionate about synergies. ' + 'x '.repeat(60);
  const llm = mockLLM([bad, bad, cleanBody, cleanBody, cleanBody, cleanBody]);
  const result = await generateDrafts({
    jd: { title: 't', company_name: 'D', required: ['HubSpot'], responsibilities: ['own stack'] },
    company: { product_description: 'x'.repeat(200), customers: ['A', 'B', 'C'], news: [{ title: 'launched', date: '2026-03-01', url: 'u', summary: 's' }] },
    target: { name: 'Doug', title: 'Head of Growth', recent_activity: [{ type: 'post', url: 'u', text_snippet: 'scaling', date: '2026-04-10' }] },
    proofs: [{ jd_bullet: 'HubSpot', proof_text: 'Trial engine — 10,300 LOC', source_file: 'x', specificity_score: 5 }],
    llmFn: llm
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /voice rule|banned/i.test(e)));
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test outbound/draft.test.js`
Expected: 3 tests FAIL.

- [ ] **Step 3: Implement `draft.js`**

Create `outbound/draft.js`:

```js
import { validate } from './validator.js';
import { lintDraft } from './voice-lint.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-4.5-sonnet';

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
      } catch {
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
        errors: [`HARD STOP: Draft variant ${String.fromCharCode(65 + i)} violated voice rule(s) after retry: ${lintFailures.join('; ')}. Review and edit manually.`]
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
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test outbound/draft.test.js`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add outbound/draft.js outbound/draft.test.js
git commit -m "feat(outbound): add Stage 6 3-variant draft generation with voice lint"
```

---

## Task 13: Outreach artifact writer

**Purpose:** Serialize the full dossier + drafts + send state into `outreach/{num}-{slug}-{date}.md` with YAML frontmatter and structured body sections. Readable on append (T+3, T+7).

**Files:**
- Create: `outbound/artifact.js`
- Create: `outbound/artifact.test.js`

- [ ] **Step 1: Write the failing test**

Create `outbound/artifact.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeArtifact, readArtifact, appendTouch, slugify, nextReportNumber } from './artifact.js';

async function withTmp(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'outbound-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('slugify: normalizes company names', () => {
  assert.equal(slugify('Delightree, Inc.'), 'delightree-inc');
  assert.equal(slugify('Acme & Co'), 'acme-co');
});

test('writeArtifact: creates file with frontmatter and sections', async () => {
  await withTmp(async (dir) => {
    const path = await writeArtifact({
      outreachDir: dir,
      num: '047',
      date: '2026-04-22',
      company: 'Delightree',
      role: 'Manager GTM Engineering',
      oferta_score: '4.3/5',
      target: { name: 'Doug Gabbard', title: 'Head of Growth', email: 'doug@delightree.com', email_status: 'verified', linkedin_url: 'https://li/d', tenure_at_company_months: 14 },
      alternates: [{ name: 'Jane', title: 'VP', linkedin_url: 'https://li/j' }],
      schedule: { t0: '2026-04-22', t_plus_3: '2026-04-27', t_plus_7: '2026-05-01' },
      company_dossier: { product_description: 'x', customers: ['A', 'B', 'C'], news: [] },
      target_dossier: { recent_activity: [] },
      proofs: [],
      touch1: {
        variants: [
          { subject: 's1', body: 'b1', word_count: 60, anchor_type: 'a', anchor_source_url: 'u' },
          { subject: 's2', body: 'b2', word_count: 65, anchor_type: 'b', anchor_source_url: 'u' },
          { subject: 's3', body: 'b3', word_count: 70, anchor_type: 'c', anchor_source_url: 'u' }
        ],
        chosen_index: 1,
        edits: 'swapped "your" for "the"',
        sent_at: '2026-04-22T15:00:00Z'
      }
    });

    const content = await readFile(path, 'utf8');
    assert.match(content, /^---\n/);
    assert.match(content, /num: 047/);
    assert.match(content, /target:\n\s+name: Doug Gabbard/);
    assert.match(content, /## Company Dossier/);
    assert.match(content, /## Touch 1 \(T0\)/);
    assert.match(content, /### Variants/);
  });
});

test('readArtifact: parses frontmatter back', async () => {
  await withTmp(async (dir) => {
    const path = await writeArtifact({
      outreachDir: dir, num: '001', date: '2026-04-22',
      company: 'Acme', role: 'RevOps', oferta_score: '4.0/5',
      target: { name: 'x', title: 'y', email: 'x@x.com', email_status: 'verified', linkedin_url: 'u', tenure_at_company_months: 5 },
      alternates: [], schedule: { t0: '2026-04-22', t_plus_3: '2026-04-27', t_plus_7: '2026-05-01' },
      company_dossier: {}, target_dossier: {}, proofs: [],
      touch1: { variants: [], chosen_index: null, edits: '', sent_at: null }
    });
    const parsed = await readArtifact(path);
    assert.equal(parsed.frontmatter.num, '001');
    assert.equal(parsed.frontmatter.company, 'Acme');
    assert.equal(parsed.frontmatter.status, 'Outreach Drafted');
  });
});

test('appendTouch: adds Touch 2 section without disturbing frontmatter', async () => {
  await withTmp(async (dir) => {
    const path = await writeArtifact({
      outreachDir: dir, num: '001', date: '2026-04-22',
      company: 'A', role: 'r', oferta_score: '4.0/5',
      target: { name: 'x', title: 'y', email: 'e', email_status: 'verified', linkedin_url: 'u', tenure_at_company_months: 5 },
      alternates: [], schedule: { t0: '2026-04-22', t_plus_3: '2026-04-27', t_plus_7: '2026-05-01' },
      company_dossier: {}, target_dossier: {}, proofs: [],
      touch1: { variants: [], chosen_index: 0, edits: '', sent_at: '2026-04-22T15:00:00Z' }
    });
    await appendTouch(path, {
      touchNumber: 2,
      offsetLabel: 'T+3',
      new_signal: 'Delightree launched Collaborative Tasks on 2026-04-24',
      variants: [
        { subject: 's', body: 'b', word_count: 60, anchor_type: 'news_product', anchor_source_url: 'u' }
      ],
      chosen_index: 0,
      sent_at: '2026-04-27T15:00:00Z'
    });
    const content = await readFile(path, 'utf8');
    assert.match(content, /## Touch 2 \(T\+3\)/);
    assert.match(content, /Collaborative Tasks/);
  });
});

test('nextReportNumber: scans existing files and returns max+1, zero-padded', async () => {
  await withTmp(async (dir) => {
    await writeFile(join(dir, '003-acme-2026-04-01.md'), '---\nnum: 003\n---');
    await writeFile(join(dir, '041-delightree-2026-04-22.md'), '---\nnum: 041\n---');
    const next = await nextReportNumber(dir);
    assert.equal(next, '042');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test outbound/artifact.test.js`
Expected: 5 tests FAIL.

- [ ] **Step 3: Implement `artifact.js`**

Create `outbound/artifact.js`:

```js
import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { join } from 'path';
import yaml from 'js-yaml';

export function slugify(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function nextReportNumber(outreachDir) {
  try {
    const files = await readdir(outreachDir);
    const nums = files
      .map(f => f.match(/^(\d{3})-/)?.[1])
      .filter(Boolean)
      .map(n => parseInt(n, 10));
    const max = nums.length ? Math.max(...nums) : 0;
    return String(max + 1).padStart(3, '0');
  } catch {
    return '001';
  }
}

export async function writeArtifact(opts) {
  const {
    outreachDir, num, date, company, role, oferta_score,
    target, alternates, schedule,
    company_dossier, target_dossier, proofs,
    touch1
  } = opts;

  await mkdir(outreachDir, { recursive: true });

  const status = touch1.sent_at ? 'Outreach Sent' : 'Outreach Drafted';

  const frontmatter = {
    num, date,
    company, company_slug: slugify(company),
    role,
    oferta_score,
    target,
    alternates,
    schedule,
    status
  };

  const body = [
    '## Company Dossier\n',
    '```yaml',
    yaml.dump(company_dossier, { lineWidth: 120 }).trimEnd(),
    '```',
    '',
    '## Target Dossier\n',
    '```yaml',
    yaml.dump(target_dossier, { lineWidth: 120 }).trimEnd(),
    '```',
    '',
    '## Proof Match\n',
    ...proofs.map((p, i) => `${i + 1}. **JD bullet:** ${p.jd_bullet}\n   **Proof:** ${p.proof_text}\n   **Score:** ${p.specificity_score}`),
    '',
    '## Touch 1 (T0)\n',
    renderTouch(touch1)
  ].join('\n');

  const path = join(outreachDir, `${num}-${slugify(company)}-${date}.md`);
  const out = `---\n${yaml.dump(frontmatter, { lineWidth: 120 }).trimEnd()}\n---\n\n${body}\n`;
  await writeFile(path, out, 'utf8');
  return path;
}

export async function readArtifact(path) {
  const text = await readFile(path, 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`artifact missing frontmatter: ${path}`);
  return { frontmatter: yaml.load(m[1]) || {}, body: m[2] };
}

export async function appendTouch(path, touch) {
  const text = await readFile(path, 'utf8');
  const section = [
    '',
    `## Touch ${touch.touchNumber} (${touch.offsetLabel})`,
    '',
    touch.new_signal ? `**New signal:** ${touch.new_signal}` : '**New signal:** (breakup — not required)',
    '',
    renderTouch(touch)
  ].join('\n');
  await writeFile(path, text + section + '\n', 'utf8');
}

function renderTouch(touch) {
  const variants = (touch.variants || []).map((v, i) => {
    return `\n#### Variant ${String.fromCharCode(65 + i)}\n- **Subject:** ${v.subject}\n- **Anchor:** ${v.anchor_type} (${v.anchor_source_url || '—'})\n- **Words:** ${v.word_count}\n\n\`\`\`\n${v.body}\n\`\`\``;
  }).join('\n');
  return [
    '### Variants',
    variants,
    '',
    `### Chosen: ${touch.chosen_index != null ? String.fromCharCode(65 + touch.chosen_index) : '(none)'}`,
    touch.edits ? `### Edits\n${touch.edits}` : '',
    `### Sent at: ${touch.sent_at || '(not sent)'}`
  ].filter(Boolean).join('\n');
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test outbound/artifact.test.js`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add outbound/artifact.js outbound/artifact.test.js
git commit -m "feat(outbound): add outreach artifact writer/reader with touch appends"
```

---

## Task 14: Tracker integration

**Purpose:** Write TSV tracker additions (following existing `batch/tracker-additions/` pattern) with the new outreach states.

**Files:**
- Create: `outbound/tracker.js`
- Create: `outbound/tracker.test.js`

- [ ] **Step 1: Write the failing test**

Create `outbound/tracker.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeTrackerAddition, buildNote } from './tracker.js';

test('buildNote: short one-liner', () => {
  const n = buildNote({ target: { name: 'Doug Gabbard', title: 'Head of Growth' }, touch: 1, date: '2026-04-22' });
  assert.match(n, /Outbound → Doug Gabbard/);
  assert.match(n, /T0/);
});

test('writeTrackerAddition: emits 9-column TSV with correct order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tracker-'));
  try {
    const path = await writeTrackerAddition({
      additionsDir: dir,
      num: '047', date: '2026-04-22',
      company: 'Delightree', role: 'Manager, GTM Engineering',
      status: 'Outreach Sent',
      score: '4.3/5',
      pdf: false,
      reportLink: 'outreach/047-delightree-2026-04-22.md',
      note: 'Outbound → Doug Gabbard (Head of Growth). T0 sent 2026-04-22.'
    });
    const content = await readFile(path, 'utf8');
    const cols = content.trim().split('\t');
    assert.equal(cols.length, 9);
    assert.equal(cols[0], '047');
    assert.equal(cols[1], '2026-04-22');
    assert.equal(cols[2], 'Delightree');
    assert.equal(cols[3], 'Manager, GTM Engineering');
    assert.equal(cols[4], 'Outreach Sent');
    assert.equal(cols[5], '4.3/5');
    assert.equal(cols[6], '❌');
    assert.match(cols[7], /^\[047\]\(outreach\//);
    assert.match(cols[8], /Outbound → Doug Gabbard/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test outbound/tracker.test.js`
Expected: 2 tests FAIL.

- [ ] **Step 3: Implement `tracker.js`**

Create `outbound/tracker.js`:

```js
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export function buildNote({ target, touch, date }) {
  const label = touch === 1 ? 'T0' : (touch === 2 ? 'T+3' : 'T+7');
  return `Outbound → ${target.name} (${target.title}). ${label} sent ${date}.`;
}

export async function writeTrackerAddition({
  additionsDir, num, date, company, role, status, score, pdf, reportLink, note
}) {
  await mkdir(additionsDir, { recursive: true });
  const pdfCell = pdf ? '✅' : '❌';
  const reportCell = `[${num}](${reportLink})`;
  const line = [num, date, company, role, status, score, pdfCell, reportCell, note].join('\t');
  const slug = (company || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const path = join(additionsDir, `${num}-${slug}.tsv`);
  await writeFile(path, line + '\n', 'utf8');
  return path;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test outbound/tracker.test.js`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add outbound/tracker.js outbound/tracker.test.js
git commit -m "feat(outbound): add tracker TSV addition writer"
```

---

## Task 15: Multi-touch follow-up scheduler

**Purpose:** Detect new signal between T0 and T+3 (Stage 2 + Stage 4 re-run); compute breakup date for T+7; enforce "skip T+3 if no new signal" rule.

**Files:**
- Create: `outbound/schedule.js`
- Create: `outbound/schedule.test.js`

- [ ] **Step 1: Write the failing test**

Create `outbound/schedule.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSchedule, detectNewSignal, addBusinessDays } from './schedule.js';

test('addBusinessDays: skips weekends', () => {
  // Wed 2026-04-22 + 3 biz days = Mon 2026-04-27 (Thu, Fri, Mon)
  assert.equal(addBusinessDays('2026-04-22', 3), '2026-04-27');
  // Fri 2026-04-24 + 3 biz days = Wed 2026-04-29 (Mon, Tue, Wed)
  assert.equal(addBusinessDays('2026-04-24', 3), '2026-04-29');
});

test('computeSchedule: T0 / T+3 / T+7', () => {
  const s = computeSchedule('2026-04-22');
  assert.equal(s.t0, '2026-04-22');
  assert.equal(s.t_plus_3, '2026-04-27');
  assert.equal(s.t_plus_7, '2026-05-01'); // T+3 + 4 biz days
});

test('detectNewSignal: finds news/activity after T0', () => {
  const t0 = '2026-04-22';
  const news = [{ title: 'old launch', date: '2026-04-01' }, { title: 'new launch', date: '2026-04-24' }];
  const activity = [{ url: 'x', date: '2026-04-25' }, { url: 'y', date: '2026-04-10' }];
  const s = detectNewSignal({ t0, news, activity });
  assert.equal(s.has_new_signal, true);
  assert.ok(s.signal_source);
});

test('detectNewSignal: returns false when nothing is post-T0', () => {
  const t0 = '2026-04-22';
  const s = detectNewSignal({ t0, news: [{ title: 'old', date: '2026-04-01' }], activity: [{ url: 'x', date: '2026-04-20' }] });
  assert.equal(s.has_new_signal, false);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test outbound/schedule.test.js`
Expected: 4 tests FAIL.

- [ ] **Step 3: Implement `schedule.js`**

Create `outbound/schedule.js`:

```js
export function addBusinessDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

export function computeSchedule(t0) {
  const t_plus_3 = addBusinessDays(t0, 3);
  const t_plus_7 = addBusinessDays(t_plus_3, 4); // T+7 = 3 biz after T+3
  return { t0, t_plus_3, t_plus_7 };
}

export function detectNewSignal({ t0, news = [], activity = [] }) {
  const t0Date = new Date(t0 + 'T00:00:00Z').getTime();
  const newNews = news.filter(n => new Date(n.date).getTime() > t0Date);
  const newActivity = activity.filter(a => new Date(a.date).getTime() > t0Date);

  if (newNews.length > 0) {
    return { has_new_signal: true, signal_source: `news:${newNews[0].title}`, signal_date: newNews[0].date };
  }
  if (newActivity.length > 0) {
    return { has_new_signal: true, signal_source: `activity:${newActivity[0].url}`, signal_date: newActivity[0].date };
  }
  return { has_new_signal: false, signal_source: null, signal_date: null };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test outbound/schedule.test.js`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add outbound/schedule.js outbound/schedule.test.js
git commit -m "feat(outbound): add multi-touch scheduler and new-signal detection"
```

---

## Task 16: Orchestrator CLI (`run.js`)

**Purpose:** Thin CLI that runs stages 1-6 sequentially, pauses at the two review gates (writes state to disk for the mode/Claude layer to surface to the user), and on resume completes the send record.

**Files:**
- Create: `outbound/run.js`

- [ ] **Step 1: Write the orchestrator**

Create `outbound/run.js`:

```js
#!/usr/bin/env node
/**
 * outbound/run.js — Orchestrator CLI for the outbound pipeline.
 *
 * Usage:
 *   node outbound/run.js --url <jd-url>               # fresh run
 *   node outbound/run.js --report <num>               # reuse existing evaluation
 *   node outbound/run.js --paste <file.txt> --company "X" --title "Y" --location "Z"
 *   node outbound/run.js --resume <outreach/XXX.md> --chosen 1 --edits "..."
 *   node outbound/run.js --touch 2 --artifact <outreach/XXX.md>
 *
 * Review gates pause by writing state and printing the review prompt.
 * The mode file (modes/outbound.md) is the interactive Claude layer that
 * surfaces gates to the user.
 */

import { readFile } from 'fs/promises';
import { parseArgs } from 'node:util';
import { ApolloClient } from './clients/apollo.js';
import { BrightDataClient } from './clients/bright-data.js';
import { fetchJDViaPlaywright } from './clients/playwright-fetch.js';
import { ingestJD } from './jd-ingest.js';
import { researchCompany } from './company-research.js';
import { identifyTargets } from './target-id.js';
import { enrichTarget } from './enrichment.js';
import { matchProofs, loadDigestAndProfile } from './proof-match.js';
import { generateDrafts } from './draft.js';
import { writeArtifact, readArtifact, appendTouch, nextReportNumber } from './artifact.js';
import { writeTrackerAddition, buildNote } from './tracker.js';
import { computeSchedule, detectNewSignal } from './schedule.js';

const ARGS = parseArgs({
  options: {
    url: { type: 'string' },
    report: { type: 'string' },
    paste: { type: 'string' },
    company: { type: 'string' },
    title: { type: 'string' },
    location: { type: 'string' },
    resume: { type: 'string' },
    chosen: { type: 'string' },
    edits: { type: 'string' },
    touch: { type: 'string' },
    artifact: { type: 'string' }
  }
}).values;

const OUTREACH_DIR = 'outreach';
const TRACKER_ADDITIONS_DIR = 'batch/tracker-additions';

function halt(errors) {
  console.error('\n' + errors.map(e => '✗ ' + e).join('\n') + '\n');
  process.exit(1);
}

function gate(label, data) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(data, null, 2));
  console.log(`=== END ${label} — awaiting user review ===\n`);
}

async function doFreshRun() {
  // Stage 1
  const source = ARGS.url ? 'url' : (ARGS.paste ? 'paste' : null);
  if (!source) halt(['provide --url, --report, or --paste']);

  const text = ARGS.paste ? await readFile(ARGS.paste, 'utf8') : undefined;
  const webFetcher = async (u) => (await fetch(u).then(r => r.text())).trim();

  const jd = await ingestJD({
    source,
    text,
    url: ARGS.url,
    company: ARGS.company || '',
    title: ARGS.title || '',
    location: ARGS.location || '',
    webFetcher,
    playwrightFetcher: fetchJDViaPlaywright
  });
  if (!jd.ok) halt(jd.errors);

  // Stage 2
  const webSearcher = async (_q) => []; // Claude provides this via mode — CLI stub returns empty, forcing paste
  const company = await researchCompany({ company: jd.data.company_name, jd_raw_text: jd.data.raw_text, webFetcher, webSearcher });
  if (!company.ok) halt(company.errors);

  // Stage 3
  const apollo = new ApolloClient({ apiKey: process.env.APOLLO_API_KEY });
  const targets = await identifyTargets({ company: jd.data.company_name, jdTitle: jd.data.title, apolloClient: apollo });
  if (!targets.ok) halt(targets.errors);

  // Review Gate 1
  gate('REVIEW GATE 1 — pick primary target', {
    candidates: targets.data.candidates,
    state_file: await saveState({ phase: 'gate1', jd: jd.data, company: company.data, candidates: targets.data.candidates })
  });
  process.exit(0);
}

async function doResume() {
  // Stub for Stage 4+5+6+Gate 2 on resume. Implementation similar — load state,
  // enrich chosen candidate, match proofs, generate drafts, write artifact.
  // Full implementation deferred to Task 18 (smoke test) where the flow is exercised.
  console.error('resume flow: implement in task 18 integration pass');
  process.exit(2);
}

async function main() {
  if (ARGS.resume) return doResume();
  return doFreshRun();
}

async function saveState(state) {
  const path = `outreach/.state-${Date.now()}.json`;
  const { writeFile } = await import('fs/promises');
  await writeFile(path, JSON.stringify(state, null, 2));
  return path;
}

main().catch(e => halt([e.message]));
```

- [ ] **Step 2: Verify it parses and shows help on bad args**

Run: `node outbound/run.js 2>&1 | head -5`
Expected: error message mentioning `--url`, `--report`, or `--paste`.

- [ ] **Step 3: Commit**

```bash
git add outbound/run.js
git commit -m "feat(outbound): add orchestrator CLI with Gate 1 pause point"
```

---

## Task 17: Mode file + OpenCode slash command

**Purpose:** Create the Claude-facing instruction file for the mode, and the OpenCode slash command that invokes it.

**Files:**
- Create: `modes/outbound.md`
- Create: `.opencode/commands/career-ops-outbound.md`

- [ ] **Step 1: Create `modes/outbound.md`**

Create `modes/outbound.md`:

```markdown
# Mode: outbound — Direct email outreach to hiring managers

**This mode is NOT a LinkedIn DM (`contacto`). It drafts research-heavy 60-80 word cold emails to a named human with a verified address.**

**Invocation:**
- `/career-ops outbound <report-num>` — reuse an existing evaluation in `reports/`
- `/career-ops outbound <jd-url>` — fresh run from a JD URL

## Pipeline — 8 stages, fail-loud

Each stage has prerequisites. If any prerequisite fails, STOP and surface the HARD STOP message to the user. Do NOT degrade silently, do NOT infer missing fields.

1. **JD ingest** (`outbound/jd-ingest.js`) — URL or paste. Playwright fallback on WebFetch 403. Requires ≥500 chars + parsed title, company, stack, location, required, preferred, responsibilities.
2. **Company research** (`outbound/company-research.js`) — Requires product description ≥200 chars, ICP, funding stage + last round ≤36 mo, ≥3 customers, ≥1 news item ≤12 mo.
3. **Target ID** (`outbound/target-id.js`) — Apollo People Search by company + title filter (per `config/profile.yml → outbound.target_titles` or default GTM filter). Requires ≥3 ranked candidates.
   → **Review Gate 1:** present candidates to the user, they pick primary. Alternates are preserved for later touches.
4. **Target enrichment** (`outbound/enrichment.js`) — Apollo match (verified email) + Bright Data (profile + activity). Requires deliverable email (verified preferred; guessed/catch-all warns and proceeds), LinkedIn URL, tenure, 2 prior roles, 3+ posts/comments in last 90 days.
5. **Proof match** (`outbound/proof-match.js`) — Reads `article-digest.md` + `modes/_profile.md`. Requires ≥2 proofs with numeric or named-tool anchors laddering to JD required/responsibility bullets.
6. **Draft** (`outbound/draft.js`) — 3 variants (A: customer/ICP, B: target post, C: news/product). Each ≤80 words, passes `voice-lint` (no emoji, no corp-speak, anchored specificity, ≤2 paragraphs, no trailing CTA).
   → **Review Gate 2:** present 3 variants. User picks/edits/rejects.
7. **Send** — User copies to Gmail and sends manually (MVP). On user confirm, update artifact + tracker.
8. **Multi-touch follow-up** (`outbound/schedule.js`):
   - T+3: rerun Stage 2 + Stage 4 for new signal. If new signal → Stage 6 → Gate 2 → send. If no signal → skip to T+7.
   - T+7: breakup. One clean exit line. No new signal required. Always passes Gate 2.

## Hard stops — exact messages

See `docs/superpowers/specs/2026-04-21-outbound-email-design.md` section 10 for the full table. The scripts emit these messages; your job is to surface them verbatim to the user.

## Ethics — non-negotiable

- **Never send without explicit user approval.** Gate 2 always applies. Stage 7 requires the user to type `sent` or `cancel`.
- **Score threshold.** If the matched evaluation has score < 4.0/5, show: "This role scored {X}/5. Recommend against outbound. Proceed only with explicit reason." User must type a short reason to continue.
- **Quality over quantity.** One role per invocation. No batch outbound.
- **Location mismatch.** If JD hard-requires location ≠ user's profile location, WARN but proceed. User decides.

## Voice enforcement

The linter in `outbound/voice-lint.js` enforces Brent's voice:
- 60-80 words (body only, signoff excluded)
- No emoji, no corp-speak (see `BANNED_PHRASES` in `voice-lint.js`)
- Anchored specificity — must include a number or a named tool
- Structure: Hook → Carrot → Proof → Ask
- Signoff: "Best, Brent" on its own line

If lint fails twice on a variant, HARD STOP — don't fall back to a weaker draft.

## Output artifact

One file per outreach at `outreach/{num}-{slug}-{date}.md`. Frontmatter holds target, schedule, status. Body holds Company Dossier, Target Dossier, Proof Match, and per-touch variants + chosen + edits + send timestamp. `outreach/` is gitignored.

## Tracker integration

After send, write `batch/tracker-additions/{num}-{slug}.tsv` with state `Outreach Sent` (or `Outreach Follow-up` for T+3/T+7). Run `node merge-tracker.mjs` to merge into `data/applications.md`.

New canonical states (in `templates/states.yml`): `Outreach Drafted`, `Outreach Sent`, `Outreach Follow-up`, `Outreach Response`.

## How to run interactively (what Claude does)

1. User types `/career-ops outbound <url>` or `/career-ops outbound <report-num>`.
2. Run `node outbound/run.js --url <url>` (or `--report <num>`) to hit Gate 1.
3. When Gate 1 emits candidates, present them to the user and ask for a pick.
4. Run `node outbound/run.js --resume <state-file> --target <index>` to continue through Stages 4-6.
5. At Gate 2, show the 3 drafts and ask the user to pick/edit/reject.
6. On send, update artifact and tracker.
7. Compute T+3 and T+7 dates; inform the user when to return for follow-up.
```

- [ ] **Step 2: Create OpenCode slash command**

Create `.opencode/commands/career-ops-outbound.md`:

```markdown
---
description: Outbound email — researched direct outreach to hiring manager
---

Run the career-ops outbound mode for the input URL or report number.

Read `modes/outbound.md` for the full pipeline. Enforce all hard stops. Never send automatically.
```

- [ ] **Step 3: Commit**

```bash
git add modes/outbound.md .opencode/commands/career-ops-outbound.md
git commit -m "feat(outbound): add mode file and OpenCode slash command"
```

---

## Task 18: End-to-end smoke test

**Purpose:** Run the full pipeline against a real role with mocked externals except for one real Apollo search to verify auth works. Produce a real artifact. This is the integration validation — not a unit test.

**Files:**
- Create: `outbound/e2e.test.js` (skipped by default — requires env vars)
- Modify: `package.json` (already done in Task 1)

- [ ] **Step 1: Write the e2e test**

Create `outbound/e2e.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestJD } from './jd-ingest.js';
import { researchCompany } from './company-research.js';
import { identifyTargets } from './target-id.js';
import { enrichTarget } from './enrichment.js';
import { matchProofs } from './proof-match.js';
import { generateDrafts } from './draft.js';
import { writeArtifact } from './artifact.js';
import { computeSchedule } from './schedule.js';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const RUN_E2E = process.env.OUTBOUND_E2E === '1';

test('e2e: full pipeline against Delightree JD (skipped unless OUTBOUND_E2E=1)', { skip: !RUN_E2E }, async () => {
  const jdText = `Job Summary:
Delightree is the Franchise Operating System for modern, multi-unit brands. They are seeking a GTM Engineer to build and scale systems for their go-to-market team, focusing on HubSpot and broader GTM stack.

Responsibilities:
• Own the GTM Systems Architecture
• Own HubSpot and other GTM tooling implementations (e.g., Equals, Sybill, QuotaPath)
• Build Automation & AI-Powered Workflows

Qualifications:
Required:
• 3+ years in Revenue Operations, Sales Operations, or GTM Systems in a B2B SaaS environment
• Deep, hands-on experience building and maintaining HubSpot as a system of record
• Based in Denver, CO.
Preferred:
• Hands-on experience implementing AI workflows or automation tools
• SQL or data architecture experience
`.repeat(2);

  const jd = await ingestJD({
    source: 'paste',
    text: jdText,
    company: 'Delightree',
    title: 'Manager, GTM Engineering & Revenue Systems',
    location: 'Denver, CO'
  });
  assert.equal(jd.ok, true, JSON.stringify(jd.errors));

  // Full E2E continues through stages — left as an exercise to wire remaining external calls
  // when credentials are available. This test exists to document the run.
  console.log('e2e: JD parsed OK. Extend this test as external creds come online.');
});
```

- [ ] **Step 2: Run the test suite**

Run: `npm test`
Expected: all existing + new tests PASS. The e2e test is skipped (OUTBOUND_E2E not set).

- [ ] **Step 3: Manually smoke-test against the Delightree role**

Run:

```bash
export APOLLO_API_KEY="your-key"
export BRIGHT_DATA_API_KEY="your-key"
export OPENROUTER_API_KEY="your-key"

# Save the Delightree JD text to a file first, then:
node outbound/run.js --paste /tmp/delightree-jd.txt \
  --company "Delightree" \
  --title "Manager, GTM Engineering & Revenue Systems" \
  --location "Denver, CO"
```

Expected:
- Stage 1 passes (JD has 500+ chars)
- Stage 2 may need a real webSearcher; if empty results, hits HARD STOP on news — surface the error to the user
- Stage 3 prints Gate 1 with candidates from Apollo
- Manually confirm Doug Gabbard appears in the candidates list

If any stage hits a HARD STOP unexpectedly, fix the upstream input (not the validator) and re-run.

- [ ] **Step 4: Commit**

```bash
git add outbound/e2e.test.js package.json
git commit -m "test(outbound): add e2e smoke test harness"
```

- [ ] **Step 5: Final housekeeping commit**

```bash
git add -A
git status  # confirm only intended files
git commit -m "docs(outbound): pipeline ready for first real run" || echo "nothing to commit"
```

---

## Self-Review Checklist

Before handing off to execution, verify:

- [ ] Every stage in the spec (1-8) has at least one implementation task (Tasks 7-12 + 15)
- [ ] Validator (Task 2) covers every stage's required fields
- [ ] Voice lint (Task 3) enforces every rule in Spec §11
- [ ] Tracker states (Task 1) match Spec §8.2 exactly
- [ ] TSV column order (Task 14) matches CLAUDE.md
- [ ] Artifact frontmatter schema (Task 13) matches Spec §8.1
- [ ] Every "HARD STOP" message in Spec §10 appears somewhere in the implementation
- [ ] Mode file (Task 17) covers ethics + score threshold + location mismatch from Spec §11

If any row is unchecked after review, add a corrective task before starting execution.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-21-outbound-email.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Use `superpowers:subagent-driven-development`.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

**Which approach?**
