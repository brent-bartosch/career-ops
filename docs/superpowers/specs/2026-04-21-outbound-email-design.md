# Outbound Email — Design Spec

**Date:** 2026-04-21
**Status:** Draft (for review)
**Mode file (to be created):** `modes/outbound.md`
**Invocation:** `/career-ops outbound <report-num>` or `/career-ops outbound <jd-url>`

---

## 1. Problem & Motivation

The default job-search loop — apply via portal, wait for ATS triage — is a queue Brent does not want to be in. He is a GTM Systems Architect with a B2B sales background. He knows that a resume on a pile is fruitless and that a researched, specific, written-like-a-human email to a hiring manager beats a generic submission.

`modes/contacto.md` already exists for LinkedIn connection requests (300 characters, gated by LinkedIn's UI). That is a different tool with a different constraint set: shorter, more social, no file attachments, no verified deliverability. It is not a substitute for direct email.

Direct email gives:

- No character limit — room for a proof point and a specific ask
- A verified, deliverable channel to a named human
- An artifact (sent message + reply) that lives outside LinkedIn's walled garden
- Multi-touch sequencing that LinkedIn DMs do not support cleanly

Goal: a research-heavy, manual-per-role outbound playbook that turns evaluated offers into named-target email sequences — without degrading into mass mail.

---

## 2. Scope

### In scope (MVP)

- New mode: `modes/outbound.md` (English only; DACH/FR deferred)
- 8-stage pipeline, fail-loud, one target per role per run
- Apollo API integration for people search + email enrichment
- Bright Data integration for LinkedIn profile + recent activity (reuse tooling from sibling `linkedin-engagement/` project)
- Playwright as JD ingest fallback (reuse existing headless pattern)
- 3-variant draft generation, user picks/edits
- Multi-touch cadence (T0 / T+3 / T+7-10) with new-signal gate at T+3
- New canonical tracker states and TSV-based tracker integration
- Outreach artifact per run at `outreach/{num}-{company-slug}-{date}.md`

### Out of scope (explicitly deferred to v2)

- Gmail API auto-draft creation (user copies/pastes into Gmail manually in MVP)
- Sales Navigator integration (InMail, advanced discovery)
- Bright Data deep account research beyond person-level
- Sequence analytics / open-tracking / reply-rate dashboards
- Auto-send of any kind
- Mass/batch outbound across many roles at once

### Non-goals

- Mail merge. Every send is 1:1 and hand-reviewed.
- Generic templates. Each touch runs the full research-backed flow.
- Contact discovery outside Apollo + Bright Data (no scraping Google, no buying lists).

---

## 3. Architecture

### 3.1 Data flow

```
 ┌──────────────────────────────────────────────────────────────────┐
 │  /career-ops outbound {report-num | jd-url}                      │
 └──────────────────────────────────────────────────────────────────┘
           │
           ▼
 ┌──────────────────┐     prereq fail      ┌──────────────────────┐
 │ Stage 1: JD      ├─────────────────────►│ HARD STOP:           │
 │ Ingest           │                      │ "paste JD text"      │
 │ (WebFetch →      │                      └──────────────────────┘
 │  Playwright)     │
 └────────┬─────────┘
          │  jd.json (title, company, stack, required, preferred)
          ▼
 ┌──────────────────┐     prereq fail      ┌──────────────────────┐
 │ Stage 2: Company ├─────────────────────►│ HARD STOP:           │
 │ Research         │                      │ "insufficient        │
 │ (WebFetch +      │                      │  company data"       │
 │  WebSearch)      │                      └──────────────────────┘
 └────────┬─────────┘
          │  company.json (product, ICP, funding, customers, news)
          ▼
 ┌──────────────────┐     <3 candidates    ┌──────────────────────┐
 │ Stage 3: Target  ├─────────────────────►│ HARD STOP:           │
 │ ID (Apollo       │                      │ "broaden title       │
 │  people search)  │                      │  filter"             │
 └────────┬─────────┘
          │  candidates[] (3-5 ranked)
          ▼
     [REVIEW GATE 1] — user picks primary target
          │
          ▼
 ┌──────────────────┐     no activity      ┌──────────────────────┐
 │ Stage 4:         ├─────────────────────►│ HARD STOP:           │
 │ Enrichment       │                      │ "verify LI URL or    │
 │ (Apollo + Bright │                      │  mark low-signal"    │
 │  Data)           │                      └──────────────────────┘
 └────────┬─────────┘
          │  target.json (email, LI, tenure, posts[])
          ▼
 ┌──────────────────┐     empty digest     ┌──────────────────────┐
 │ Stage 5: Proof   ├─────────────────────►│ HARD STOP:           │
 │ Match            │                      │ "populate article-   │
 │ (article-digest  │                      │  digest.md first"    │
 │  + _profile.md)  │                      └──────────────────────┘
 └────────┬─────────┘
          │  proofs[] (≥2 mapped to JD bullets)
          ▼
 ┌──────────────────┐
 │ Stage 6: Draft   │  Hook → Carrot → Proof → Ask, ≤80 words, 3 variants
 └────────┬─────────┘
          │
          ▼
     [REVIEW GATE 2] — user picks / edits variant
          │
          ▼
 ┌──────────────────┐
 │ Stage 7: Send    │  user copies to Gmail, confirms sent; tracker updates
 └────────┬─────────┘
          │
          ▼
 ┌──────────────────┐
 │ Stage 8:         │  T+3 value-add (requires new signal)
 │ Follow-up        │  T+7-10 breakup (no new signal required)
 └──────────────────┘
```

### 3.2 Files touched / produced per run

| Path | Role | Layer |
|---|---|---|
| `jds/{slug}.md` | Raw JD persisted (if URL run) | User |
| `reports/{num}-{slug}-{date}.md` | Read-only, used for scoring context | User |
| `outreach/{num}-{slug}-{date}.md` | New artifact — full dossier + drafts + send log | User |
| `batch/tracker-additions/{num}-{slug}.tsv` | Tracker row | System path, user content |
| `data/applications.md` | Updated status on send/response | User |
| `templates/states.yml` | Extended with outreach states | System |
| `article-digest.md` | Read-only (source of proof points) | User |
| `cv.md`, `modes/_profile.md` | Read-only | User |

New directory: `outreach/` — gitignored by default, same posture as `reports/` (user layer).

---

## 4. Prerequisites & Fail-Loud — Core Design Constraint

**Every stage declares its required inputs as a precondition. The stage runner validates those preconditions BEFORE executing. If anything is missing or thin, the stage halts with a named error and a specific user-facing message. No silent degradation. No "best-effort" drafts. No inferring a title from a URL.**

This exists because the failure mode we are designing against is not a script crash — it is a plausible-looking email that was drafted without grounding. A draft produced from a half-scraped JD and a guessed title looks fine and reads fine and will still get ignored because it has no specificity. Fail-loud surfaces the real blocker (no Apollo data, no proof points, no LinkedIn activity) so the user can fix the input, not the output.

Concretely:

- Every stage has an `inputs` list. All must be non-empty and meet stated thresholds.
- The validator runs first, before any tool call that costs money or quota (Apollo, Bright Data).
- On failure, emit the exact user-facing message listed in section 10 and exit. Do not proceed partially.
- Nothing is inferred. If a field isn't in the source, it's missing.

---

## 5. Stage Detail

### Stage 1 — JD Ingest

**Purpose:** Produce a structured JD object from a URL, a local file, or a report reference.

**Inputs:**
- `<jd-url>` OR `<report-num>` OR pasted JD text

**Tooling:**
- WebFetch (primary)
- Playwright `browser_navigate` + `browser_snapshot` (fallback on 403 / bot-wall / empty body)
- Read (if `<report-num>` → load `reports/{num}-*.md` and pull `**URL:**` field and parsed JD)

**Outputs:**
- `jd.json` in-memory object with: `title`, `company_name`, `location`, `stack[]`, `required[]`, `preferred[]`, `responsibilities[]`, `raw_text`

**Validation rules (ALL required):**
- `raw_text.length >= 500`
- `title` non-empty
- `company_name` non-empty
- `stack[].length >= 1`
- `required[].length >= 1`
- `preferred[].length >= 1`
- `responsibilities[].length >= 1`

**Failure modes:**
- WebFetch 4xx/5xx → try Playwright once
- Playwright returns footer-only / no JD body → HARD STOP with paste-JD prompt
- Parsed text < 500 chars → HARD STOP ("JD too thin, paste full text")
- Missing any required parsed field → HARD STOP listing exactly which field is missing

**Note on location mismatch:** If `jd.location` hard-requires on-site in a region that does not match `config/profile.yml`, emit a WARN and proceed. Not a hard stop — user decision.

---

### Stage 2 — Company Research

**Purpose:** Build the company context the outbound message will anchor to. Hooks come from specifics; specifics come from here.

**Inputs:**
- `jd.company_name`
- `jd.raw_text` (often has ICP/customer hints)

**Tooling:**
- WebFetch on company site (homepage + /about + /customers + /blog if linkable)
- WebSearch queries:
  - `"{company}" funding` (Crunchbase/Pitchbook/TechCrunch results)
  - `"{company}" customers OR case study`
  - `"{company}" news 2025..2026`
  - `"{company}" {product} launch OR release`

**Outputs:**
- `company.json`: `product_description`, `icp`, `funding_stage`, `last_round`, `customers[]`, `news[]` (each with title, date, url, one-line summary)

**Validation rules (ALL required):**
- `product_description.length >= 200` chars
- `icp` non-empty
- `funding_stage` non-empty AND `last_round` dated within last 36 months
- `customers[].length >= 3`
- `news[].length >= 1` AND at least one item dated within last 12 months

**Failure modes:**
- Company site WebFetch blocked → Playwright fallback
- No funding data findable → HARD STOP ("couldn't verify funding stage — paste Crunchbase/site link")
- < 3 customers findable → HARD STOP ("insufficient customer data — paste references or skip company")
- No news ≤ 12 mo → HARD STOP ("no recent news signal — cold email will feel generic")

---

### Stage 3 — Target Identification

**Purpose:** Generate a ranked list of plausible primary recipients.

**Inputs:**
- `jd.company_name`
- `jd.title` (for seniority/function inference)
- `config/profile.yml` target-role metadata

**Tooling:**
- Apollo People Search API
  - Endpoint: `POST /api/v1/mixed_people/search`
  - Filters: `organization_names[]={company}`, `person_titles[]=` (derived from JD function — e.g., for a GTM Systems role: "VP RevOps", "Head of Growth", "Director of Marketing Ops", "CRO", "VP Marketing")
  - Seniority tiers: director / VP / C-level preferred; manager tier accepted only if no senior candidates surface
- Title-filter heuristic lives in `modes/outbound.md` and is customizable

**Outputs:**
- `candidates[]` — 3-5 entries, each: `name`, `title`, `seniority`, `apollo_person_id`, `rank_reason` (one-line why-this-person)

**Validation rules:**
- `candidates[].length >= 3`
- Each candidate has a non-empty `rank_reason`

**Failure modes:**
- Apollo returns < 3 → HARD STOP ("broaden title filter or manually identify target via LinkedIn")
- Apollo auth error → HARD STOP ("APOLLO_API_KEY missing/invalid")
- Apollo rate limit → HARD STOP with retry-after guidance (do not silently wait)

**Review gate 1:** Present the ranked list to the user. User picks the primary. Alternates are preserved in `outreach/{num}-*.md` under "Alternates" for later touches if the primary does not respond.

---

### Stage 4 — Target Enrichment

**Purpose:** Verify deliverability and gather post-level signal for authentic hook generation.

**Inputs:**
- `candidates[primary].apollo_person_id`
- `candidates[primary].linkedin_url` (if returned by search; otherwise enrich)

**Tooling:**
- Apollo Email Enrichment
  - Endpoint: `POST /api/v1/people/match`
  - Request email reveal; capture `email`, `email_status` (verified / guessed / catch-all), `linkedin_url`, `employment_history[]`
- Bright Data LinkedIn profile scraper (reuse patterns from `~/Development/Smoothed/career/linkedin-engagement/`)
  - Profile detail endpoint: current role, tenure, headline, about
  - Activity endpoint: posts + comments, last 90 days

**Outputs:**
- `target.json`: `name`, `title`, `email`, `email_status`, `linkedin_url`, `tenure_at_company_months`, `prior_roles[]` (most recent 2), `recent_activity[]` (min 3 items, each: `type` (post/comment), `url`, `text_snippet`, `date`, `topic_tags[]`)

**Validation rules (ALL required):**
- `email` present; no email returned → HARD STOP
- `email_status`: `verified` → proceed silently; `guessed` or `catch-all` → WARN and proceed (see Open Question #6 for stricter posture); anything else → HARD STOP
- `linkedin_url` present and reachable
- `tenure_at_company_months` is a number
- `prior_roles[].length >= 2`
- `recent_activity[].length >= 3` (fewer than 3 posts/comments in the last 90 days → HARD STOP)

**Failure modes:**
- Apollo email reveal fails / no verified email → WARN if `guessed`, HARD STOP if no email at all ("no deliverable address — pick an alternate target")
- Bright Data returns no activity in 90 days → HARD STOP ("target has no recent LinkedIn activity — verify LI URL or mark low-signal and pick alternate")
- Bright Data auth error → HARD STOP ("BRIGHT_DATA_API_KEY missing/invalid")

---

### Stage 5 — Proof Match

**Purpose:** Map the user's real work to the JD's explicit asks. This is the specificity firewall.

**Inputs:**
- `article-digest.md` (authoritative for metrics; see `modes/_shared.md` rule)
- `modes/_profile.md` (positioning, archetype framing)
- `cv.md` (context, roles, dates)
- `jd.required[]` and `jd.responsibilities[]`

**Processing:**
- For each JD required/responsibility bullet, search digest + profile for matching proof points
- A match = a concrete artifact or metric (tool version, LOC, latency, conversion rate, pipeline stage count, etc.) that lands on the JD bullet
- Rank matches by specificity (named tool + number > named tool > general claim)

**Outputs:**
- `proofs[]`: each `{jd_bullet, proof_text, source_file, specificity_score}`; return top-ranked, minimum 2

**Validation rules:**
- `article-digest.md` exists and non-empty
- `proofs[].length >= 2`
- Each proof has a numeric or named-tool anchor (no "contributed to", no "helped with")

**Failure modes:**
- `article-digest.md` empty or missing → HARD STOP ("populate proof points before first outbound — outbound without proofs is noise")
- < 2 matching proofs → HARD STOP listing which JD bullets had no match and suggesting digest updates

---

### Stage 6 — Draft (3 variants)

**Purpose:** Generate three distinct, voice-matched, anchored drafts for the user to choose from.

**Inputs:**
- All prior stage outputs
- `modes/_profile.md` voice rules
- Brent's voice constraints (see section 11)

**Formula (applied per variant):**

```
Hook    — one specific observation about their company, recent news, or their own recent LinkedIn post
Carrot  — the thing they care about (hiring signal from JD + ICP pain from company research)
Proof   — one proof point from Stage 5, with a number or named tool
Ask     — one clear low-friction ask (15-min call OR reply with a question)
```

**Variant differentiation:**
- Variant A — anchored on a customer/ICP pain from Stage 2
- Variant B — anchored on a recent target post from Stage 4
- Variant C — anchored on a product/news item from Stage 2

**Outputs:** `drafts[3]` each with `subject`, `body`, `word_count`, `anchor_type`, `anchor_source_url`

**Validation rules (ALL required):**
- `drafts.length == 3`
- Each `word_count <= 80`
- Each variant anchors to a different Stage 2/4 artifact (no two variants with same hook source)
- Voice rules (section 11) are enforced: no emoji, no "passionate about", no "leveraged", no trailing multi-paragraph CTAs, no "Great post!", no more than one compliment

**Failure modes:**
- Any variant exceeds 80 words → regenerate that variant (max 2 retries) → HARD STOP
- Two variants anchor to the same source → regenerate (max 1 retry) → HARD STOP
- Voice-rule violation detected by post-generation lint → regenerate (max 1 retry) → HARD STOP with the violation listed

**Review gate 2:** Present the three variants side-by-side with their anchor sources visible. User picks one, edits inline, or rejects all (triggers regenerate).

---

### Stage 7 — Send

**Purpose:** Record the send and update state. MVP is manual (Gmail API deferred).

**Inputs:**
- Approved variant from Review Gate 2
- `target.email`

**Process (MVP):**
1. Display the final approved draft + subject + target email in a copy-friendly block
2. Ask: "Send now? Reply `sent` when done, or `cancel` to abort."
3. On `sent`: record `sent_at` timestamp and update artifact + tracker
4. On `cancel`: keep dossier, mark status `Outreach Drafted`, do not record send

**Outputs:**
- Updated `outreach/{num}-{slug}-{date}.md` with the send record
- Updated `data/applications.md` status via TSV merge: `Outreach Sent`

**Validation rules:**
- Explicit user confirmation string received
- Timestamp recorded

**Failure modes:**
- No user confirmation → remain in `Outreach Drafted`; do not mark sent
- User types anything other than `sent` or `cancel` → re-prompt

---

### Stage 8 — Multi-Touch Follow-up

**Purpose:** A two-touch follow-up sequence after T0, each with its own review gate.

**Cadence:**

| Touch | Offset from prior touch | Type | New-signal required? |
|---|---|---|---|
| T+3 | 3 business days after T0 | Value-add | YES |
| T+7 to T+10 | 4-7 business days after T+3 | Breakup | NO |

**T+3 value-add:**
- Re-run Stage 2 (news) and Stage 4 (activity) to look for a new signal since T0
- A new signal = company news published after T0, OR a new post/comment by the target after T0, OR a product release after T0
- If a new signal exists → run Stage 6 again with that signal as the Hook → Review Gate 2 → Send
- If no new signal exists → HARD STOP ("skip T+3, go to T+7 breakup") — do NOT send a content-free follow-up

**T+7 breakup:**
- Allowed without a new signal
- Template: acknowledge no response, offer one clean exit line, no guilt, no "just circling back"
- Still runs Stage 6 (3 variants) and Review Gate 2

**Inputs per touch:**
- All prior touch artifacts (subjects + bodies, for de-duplication)
- Latest Stage 2 / Stage 4 re-runs

**Outputs:**
- Append-only updates to the outreach artifact under `## Touch 2` / `## Touch 3`

**Validation rules:**
- T+3 requires `new_signal` field populated
- T+7 requires `touch_type: breakup` and no reuse of T0/T+3 hooks
- Both touches run Review Gate 2

**Failure modes:**
- Target replied between touches → skip remaining touches; set status `Outreach Response`
- No new signal at T+3 → skip T+3, schedule T+7 directly
- User cancels at any gate → keep dossier, status returns to `Outreach Follow-up`

---

## 6. Review Gates

The user intervenes at exactly two points per touch. No more, no fewer.

### Gate 1 — Target selection (Stage 3 → 4)

**What the user sees:**
- 3-5 candidates in a ranked table: `name | title | seniority | rank_reason`
- For each: Apollo person id, LinkedIn URL (if returned)

**What the user approves:**
- Picks one primary by index
- Optionally marks 1-2 alternates for future touches

**What can't be bypassed:**
- At least one primary must be selected. No auto-pick.

### Gate 2 — Draft selection (Stage 6 → 7, applies per touch)

**What the user sees:**
- Three full drafts (subject + body) with anchor source URLs
- Word count per variant
- Voice-lint results (pass/fail per rule)

**What the user approves:**
- Picks one variant verbatim, OR
- Picks one and edits inline, OR
- Rejects all (triggers one regenerate cycle with anchor-change guidance)

**What can't be bypassed:**
- Send will not proceed without an approved final body + subject
- User confirmation string at Stage 7 is a separate hard gate

---

## 7. Multi-touch Sequence Logic

Summary of the state machine:

```
[Evaluated] → /career-ops outbound → [Outreach Drafted]
   │
   ├── user cancels at Gate 2 → stays [Outreach Drafted]
   │
   └── user confirms sent at Stage 7 → [Outreach Sent]
             │
             ├── target replies anytime → [Outreach Response]
             │
             ├── T+3 with new signal → Stage 6 → Gate 2 → [Outreach Follow-up]
             │      └── no new signal → skip to T+7 branch
             │
             ├── T+7 breakup → Stage 6 → Gate 2 → [Outreach Follow-up]
             │
             └── no response after T+7 → remains [Outreach Follow-up] (terminal for this sequence)
```

**New-signal detection (T+3):**
- Pull `news[]` from Stage 2 re-run; compare max published date to T0
- Pull `recent_activity[]` from Stage 4 re-run; compare max post date to T0
- New signal present iff at least one item is strictly after T0

**Breakup rules (T+7):**
- One variant is required to be a clean exit line: "If now isn't the right time, no follow-up needed — happy to close the loop."
- No guilt, no "I know you're busy", no "last email I'll send" drama
- Allowed hooks: recap one-line of the original proof with a concrete deliverable + clean exit

**Scheduling:**
- MVP computes target dates and surfaces them in the outreach artifact under `## Schedule`
- User runs `/career-ops outbound <num> --touch 2` manually on or after the date
- Recurring execution (via `/loop` or `/schedule`) is a v2 convenience, not required for correctness

---

## 8. Data Model

### 8.1 Outreach artifact — `outreach/{num}-{company-slug}-{date}.md`

**Frontmatter:**

```yaml
---
num: 047
date: 2026-04-22
company: Acme
company_slug: acme
role: Head of RevOps
role_report: reports/047-acme-2026-04-22.md
oferta_score: 4.3/5
target:
  name: Jane Doe
  title: VP RevOps
  email: jane@acme.com
  email_status: verified
  linkedin_url: https://linkedin.com/in/janedoe
  tenure_months: 14
alternates:
  - name: John Smith
    title: Director of Growth Ops
    linkedin_url: https://linkedin.com/in/johnsmith
schedule:
  t0: 2026-04-22
  t_plus_3: 2026-04-27
  t_plus_7: 2026-05-01
status: Outreach Sent
---
```

**Body sections:**

```
## Company Dossier           — Stage 2 output, full
## Target Dossier            — Stage 4 output, full (incl. recent activity with URLs)
## Proof Match               — Stage 5 output, JD bullet → proof mapping
## Touch 1 (T0)
  ### Variants
    - A | B | C (full subject + body + anchor + word count + lint)
  ### Chosen
  ### Edits
  ### Sent at
## Touch 2 (T+3)             — same schema; includes new_signal field
## Touch 3 (T+7)             — same schema; includes touch_type: breakup
## Response log              — any replies pasted by the user
```

### 8.2 Tracker states (add to `templates/states.yml`)

| State | When to use |
|---|---|
| `Outreach Drafted` | Touch 1 draft exists, not yet sent |
| `Outreach Sent` | Touch 1 confirmed sent |
| `Outreach Follow-up` | Touch 2 or Touch 3 sent; awaiting response |
| `Outreach Response` | Target replied (terminal for this mode; user decides next action in other modes) |

Existing states (`Applied`, `Responded`, `Interview`, etc.) continue to apply for downstream actions. An outbound sequence does not replace an application — a user may both apply via portal and run an outbound sequence on the same role.

### 8.3 TSV tracker addition

Follow existing `batch/tracker-additions/{num}-{slug}.tsv` format exactly. No new columns. The `status` field uses one of the new canonical states above. The `notes` field carries a one-liner like `"Outbound → Jane Doe (VP RevOps). T0 sent 2026-04-22."`.

### 8.4 Follow-up state persistence

All follow-up state lives in the outreach artifact's frontmatter and body sections. No separate state file. Rationale: the artifact is already the single source of truth; a sidecar state DB drifts.

`data/applications.md` reflects only the latest canonical state. Historical touches live in the artifact.

---

## 9. Tooling & Integrations

### 9.1 Apollo

**Env:** `APOLLO_API_KEY`

**Endpoints used:**

| Endpoint | Method | Purpose | Stage |
|---|---|---|---|
| `/api/v1/mixed_people/search` | POST | People search by company + title | 3 |
| `/api/v1/people/match` | POST | Email + LinkedIn enrichment by person id | 4 |

**Quota posture:** 1 search + 1 match per target per run. T+3 and T+7 re-runs do not re-call Apollo (target already resolved). Stage 2 re-runs for new-signal detection use WebSearch/WebFetch only.

**Auth failure:** HARD STOP with setup instructions ("export APOLLO_API_KEY; see outbound.md").

### 9.2 Bright Data

**Env:** `BRIGHT_DATA_API_KEY` (reuse naming from sibling project — confirm at implementation time)

**Reuse:** Patterns, client, and schemas from `~/Development/Smoothed/career/linkedin-engagement/`. Do not re-implement; import or copy the minimal client surface.

**Endpoints used:**

| Endpoint | Purpose | Stage |
|---|---|---|
| LinkedIn profile scrape | Detail + tenure + headline | 4 |
| LinkedIn activity scrape | Posts + comments, last 90 days | 4, 8 (T+3 re-run) |

**Quota posture:** 1 profile + 1 activity pull at T0. At T+3, 1 activity pull only. Cache responses in the outreach artifact body; do not re-fetch.

### 9.3 Playwright

**Reuse:** Existing headless Chromium pattern from `generate-pdf.mjs`. New helper file (e.g., `lib/jd-fetch.mjs`) imports the browser launch + navigate helpers rather than forking.

**Rule from `CLAUDE.md`:** Never run 2+ agents with Playwright in parallel. Outbound mode is single-run by design; no conflict.

### 9.4 WebFetch / WebSearch

Built-in. Used for: JD ingest primary, company research primary, news signal detection at T+3. Standard WebFetch caveat applies — not trusted for offer-live verification (that belongs to `oferta`, not outbound).

### 9.5 Gmail API — deferred

v2. MVP is copy-paste. Rationale: Gmail OAuth is a separate setup with consent screen + token refresh plumbing. Not worth blocking MVP on. When v2 lands, the Send stage writes a Gmail draft instead of prompting for manual copy; Review Gate 2 still applies.

---

## 10. Failure Modes — Exact User-Facing Messages

| Stage | Condition | Message |
|---|---|---|
| 1 | WebFetch + Playwright both fail | `HARD STOP: Could not fetch JD. Paste the JD text to continue.` |
| 1 | JD text < 500 chars | `HARD STOP: JD is too thin (got {N} chars, need ≥500). Paste the full JD.` |
| 1 | Parsed field missing | `HARD STOP: JD missing required field: {field}. Paste a fuller JD or fix the source.` |
| 2 | Can't find funding stage | `HARD STOP: Could not verify funding stage for {company}. Paste a Crunchbase link or the company's about page.` |
| 2 | < 3 customer logos | `HARD STOP: Found only {N} customer references for {company}. Need ≥3 for specificity. Paste references or skip this company.` |
| 2 | No news ≤ 12 mo | `HARD STOP: No recent news found for {company}. A cold email without a news hook will feel generic. Paste a link or skip.` |
| 3 | Apollo < 3 candidates | `HARD STOP: Apollo returned {N} candidates for "{title_filter}" at {company}. Broaden the title filter or manually identify a target via LinkedIn.` |
| 3 | Apollo auth | `HARD STOP: APOLLO_API_KEY missing or invalid. Set it and re-run.` |
| 3 | Apollo rate limit | `HARD STOP: Apollo rate limit hit. Retry after {retry_after}.` |
| 4 | No deliverable email | `HARD STOP: No deliverable email for {target.name}. Pick an alternate target.` |
| 4 | No LI activity in 90 days | `HARD STOP: {target.name} has no LinkedIn activity in the last 90 days. Verify LinkedIn URL or mark as low-signal and pick an alternate.` |
| 4 | Bright Data auth | `HARD STOP: BRIGHT_DATA_API_KEY missing or invalid. Set it and re-run.` |
| 5 | article-digest.md empty | `HARD STOP: article-digest.md is empty or missing. Populate proof points before first outbound — outbound without proofs is noise.` |
| 5 | < 2 proof matches | `HARD STOP: Only {N} proof points matched JD bullets: {unmatched_bullets}. Update article-digest.md or pick a different role.` |
| 6 | Variant > 80 words after retry | `HARD STOP: Draft variant {V} still over 80 words after retry. Review voice enforcement.` |
| 6 | Voice lint fail after retry | `HARD STOP: Draft variant {V} violated voice rule: {rule}. Review and edit manually.` |
| 7 | User did not confirm | `Held at Outreach Drafted. Re-run with "sent" when ready.` |
| 8 | T+3 no new signal | `Skipping T+3 value-add — no new signal since T0. Scheduling T+7 breakup only.` |
| 8 | Target replied mid-sequence | `Target replied. Status → Outreach Response. Sequence halted. Next action is manual.` |

Location mismatch (not a hard stop):

> `WARN: JD requires on-site in {jd_location}; profile is {user_location}. Proceeding. Consider whether this is worth the outreach.`

---

## 11. Ethics & Guardrails

From `CLAUDE.md` (restated, non-negotiable):

- **Never submit/send on behalf of the user.** MVP is copy-paste; v2 Gmail API still gates on explicit user confirmation.
- **Score threshold.** If `oferta_score < 4.0/5`, display a prominent warning: `"This role scored {X}/5. Recommend against outbound. Proceed only with explicit reason."` User must type `override` to continue.
- **Quality over quantity.** Outbound mode is single-role per invocation by design. No batch outbound in MVP. No `/career-ops batch outbound`.
- **Respect recipient time.** All drafts must be ≤80 words, anchored to a specific artifact, and carry one concrete proof point. Enforced at Stage 6 via lint.

### Voice enforcement — Brent's rules (from memory)

Applied as a post-generation lint at Stage 6. A draft that fails any rule regenerates once; failing twice is a HARD STOP.

| Rule | Check |
|---|---|
| No emoji | regex: any emoji unicode range → fail |
| No "passionate about" / "results-oriented" / "leveraged" / "spearheaded" / "facilitated" / "synergies" / "cutting-edge" / "seamless" / "robust" | substring match → fail |
| No "Great post!" / "Love this" / generic praise opener | opener regex → fail |
| No trailing multi-paragraph CTA | paragraph count after Ask > 0 → fail |
| At most one compliment | compliment-phrase count > 1 → fail |
| 60-80 words | word count outside [60, 80] → fail |
| Anchored specificity | no number AND no named tool/product in body → fail |
| Named tools / configs / versions preferred | soft-preferred; not a hard fail, but scored |

All of this lives in `modes/outbound.md` and references `modes/_profile.md` for Brent-specific additions. System-layer voice defaults live in `modes/_shared.md`; user-layer enforcement overrides live in `modes/_profile.md`.

---

## 12. Out of Scope / Deferred (with rationale)

| Item | Deferred to | Rationale |
|---|---|---|
| Gmail API auto-draft | v2 | OAuth plumbing is a full sub-project. Copy-paste preserves the review gate with zero setup friction. |
| Sales Navigator integration | v2 | InMail adds a second channel with separate auth, separate rate limits, separate voice. One channel done well > two channels half-done. |
| Bright Data deep account research | v2 | Person-level is sufficient for MVP. Account-level (org chart, tech stack, intent data) is a multiplier, not a blocker. |
| Sequence analytics (opens, replies, rates) | v2 | Requires Gmail API + open-tracking infra. Irrelevant at 5 sends/week scale. |
| Batch outbound across multiple roles | Never (violates ethics) | Kills the quality-over-quantity premise. |
| Auto-send at any stage | Never | Violates CLAUDE.md ethical use. |
| DACH / FR outbound modes | v2+ | English MVP first. Translate once the playbook is proven. |
| Recurring scheduler for T+3 / T+7 | v2 convenience | MVP: user invokes follow-up manually. `/loop` or `/schedule` integration is a nice-to-have, not correctness. |
| A/B learning from reply rates | v2+ | Requires reply ingestion. Not until Gmail API lands. |

---

## 13. Open Questions — Resolved Defaults

**Approved 2026-04-21.** All items below default to the recommended option. Items 4 and 6 remain open for implementation-time adjustment.


1. **Apollo title-filter defaults.** What is the default target-title set for a GTM Systems Architect positioning? Candidates: `VP RevOps`, `Head of Growth`, `Director of Marketing Ops`, `CRO`, `VP Marketing`, `Head of GTM`, `Chief of Staff (Revenue)`. Should the mode hardcode this in `modes/outbound.md` or read from `config/profile.yml → outbound.target_titles`? Preference likely the latter for customizability — confirm.
2. **Score-threshold override mechanic.** `override` keyword, `--force` flag, or just "type yes and a one-line reason"? The last option captures intent for future learning; the first two are lighter.
3. **Alternates re-use.** If Touch 3 breakup goes unanswered, should the mode offer to re-run against an alternate target, or is that a manual decision that exits the sequence entirely? Recommend manual for MVP — confirm.
4. **Bright Data env var name.** Spec assumes `BRIGHT_DATA_API_KEY`. The sibling `linkedin-engagement/` project may use a different name — confirm at implementation so the two projects stay consistent.
5. **Outreach artifact gitignore.** `outreach/` contains target emails and enrichment data. Gitignore by default (user layer, like `reports/`) or opt-in commit? Recommend gitignore — confirm.
6. **Email deliverability status.** Accept `guessed` / `catch-all` as warnings, or hard-stop on anything not `verified`? MVP spec says warn-and-proceed; stricter is safer. Confirm preference.
7. **T+3 new-signal freshness window.** "After T0" is the spec. Should we also require the signal to be ≤ 5 business days old to stay fresh, or is any post-T0 signal fair game? Leaning strictly post-T0 for MVP simplicity.
8. **Interaction with `oferta` re-scoring.** If the user runs `/career-ops oferta` again on a role mid-outbound-sequence and the score drops below 4.0, should the sequence auto-pause? Spec currently says no (user decides). Confirm.
