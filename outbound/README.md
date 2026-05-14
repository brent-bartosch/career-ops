# Outbound Email Pipeline

Research-heavy direct email outreach to hiring managers — distinct from `modes/contacto.md` (LinkedIn 300-char DMs).

**8 stages, fail-loud, never auto-sends.** Built around the principle that the worst failure mode is not a script crash — it's a plausible-looking draft without grounding. Every stage validates inputs *before* doing work; missing or thin data = hard stop with a named error.

---

## Quick start

```bash
# 1. Set env vars (see "Environment setup" below)
export APOLLO_API_KEY=...
export BRIGHT_DATA_API_KEY=...
export BRIGHT_DATA_PROFILE_DATASET_ID=...
export BRIGHT_DATA_ACTIVITY_DATASET_ID=...
export OPENROUTER_API_KEY=...

# 2. Drop a JD URL or paste a JD file
node outbound/run.js --url 'https://example.com/job/123'
# or
node outbound/run.js --paste /tmp/delightree-jd.txt --company "Delightree" \
  --title "Manager, GTM Engineering" --location "Denver, CO"

# 3. Pipeline runs through stages 1-3, surfaces Gate 1 (candidate list)
# 4. Pick a target index, then:
node outbound/run.js --resume <state-file> --target 0

# 5. Pipeline runs through stages 4-6, surfaces Gate 2 (3 draft variants)
# 6. Pick variant + edit, then copy to Gmail and send manually
```

**Conversational invocation:** if you're inside Claude Code, just type `/career-ops outbound <url>` and Claude reads `modes/outbound.md` to drive the flow interactively (handles the review gates for you).

---

## Environment setup

Add to `.env` (which is already gitignored — see `.env.example` for the template format):

```bash
# Apollo — people search + email enrichment
# Get key: https://app.apollo.io/#/settings/integrations/api
APOLLO_API_KEY=...

# Bright Data — LinkedIn profile + activity scraping (trigger → poll → snapshot)
# Get key: https://brightdata.com/cp/setting
BRIGHT_DATA_API_KEY=...
BRIGHT_DATA_PROFILE_DATASET_ID=gd_l1viktl72bvl7bjuj0   # public LinkedIn profile dataset
BRIGHT_DATA_ACTIVITY_DATASET_ID=gd_lyy3tktm25m4avu764  # LinkedIn activity dataset

# OpenRouter — LLM for draft generation (default model: anthropic/claude-sonnet-4-5)
# Get key: https://openrouter.ai/keys
OPENROUTER_API_KEY=...
```

The Bright Data dataset IDs above are placeholders — replace with the IDs from your own Bright Data account if different. The sibling project `~/Development/Smoothed/career/linkedin-engagement/lib/brightdata.mjs` has the same IDs in use.

---

## How it works (architecture)

```
JD URL ──▶ Stage 1: JD ingest (WebFetch → Playwright fallback → paste)
              │
              ▼
          Stage 2: Company research (WebFetch + WebSearch → product, ICP, funding, customers, news)
              │
              ▼
          Stage 3: Target ID (Apollo people search → 3-5 candidates)
              │
              ▼
      ◆ REVIEW GATE 1 — you pick the primary target
              │
              ▼
          Stage 4: Enrichment (Apollo match + Bright Data profile + activity)
              │
              ▼
          Stage 5: Proof match (article-digest.md → 2+ proof points laddered to JD bullets)
              │
              ▼
          Stage 6: Draft (3 variants via OpenRouter; voice-lint retry per variant)
              │
              ▼
      ◆ REVIEW GATE 2 — you pick / edit / reject a variant
              │
              ▼
          Stage 7: You copy to Gmail and send manually
              │
              ▼
          Stage 8: Multi-touch follow-up (T+3 with new signal, T+7 breakup)
```

**Fail-loud thresholds** (every stage hard-stops if these aren't met — see `validator.js`):

| Stage | Minimum |
|---|---|
| 1 JD ingest | raw_text ≥500 chars + parsed title, company, stack, location, required[], preferred[], responsibilities[] |
| 2 Company research | product description ≥200 chars, ICP, funding stage + round ≤36 months, ≥3 customers, ≥1 news ≤12 months |
| 3 Target ID | ≥3 ranked Apollo candidates |
| 4 Enrichment | verified email (guessed/catch-all warns), LinkedIn URL, tenure, ≥2 prior roles, ≥3 posts/comments in last 90 days |
| 5 Proof match | ≥2 proofs anchored to numeric or named-tool specificity |
| 6 Draft | 3 variants × ≤80 words × voice-lint pass (no emoji, no corp-speak, anchored specificity) |

**Voice lint rules** (`voice-lint.js`):

- 60-80 words (body only — signoff stripped before counting)
- No emoji
- No corp-speak: `passionate about`, `leverag*`, `synerg*`, `cutting-edge`, `seamless`, `robust`, `spearhead*`, `facilitated`, `rock star`, `thought leader`, `game-changer`, `move the needle`, `circle back`, `touch base`
- No praise openers (`Great post!`, `Love this!`, etc.)
- Must anchor to a number OR a named tool
- No multi-paragraph trailing CTA

Two retries per variant on lint failure; second failure = hard stop.

---

## Outputs

Each outreach produces one markdown file at:

```
outreach/{num}-{slug}-{date}.md
```

The file contains YAML frontmatter (target, schedule, status) + body sections (Company Dossier, Target Dossier, Proof Match, per-touch variants with chosen + edits + send timestamp).

The `outreach/` directory is gitignored — it holds verified target emails and shouldn't be committed.

**Tracker integration:** after a touch is sent, write a row to `batch/tracker-additions/{num}-{slug}.tsv` and run `npm run merge` to fold into `data/applications.md`. New canonical states (in `templates/states.yml`):

- `Outreach Drafted` — variant exists, not yet sent
- `Outreach Sent` — Touch 1 (T0) sent
- `Outreach Follow-up` — Touch 2 or 3 sent
- `Outreach Response` — target replied (terminal)

---

## File map

```
outbound/
├── README.md                   # this file
├── validator.js                # shared stage-prerequisite validator
├── voice-lint.js               # post-generation draft linter
├── jd-ingest.js                # Stage 1
├── company-research.js         # Stage 2
├── target-id.js                # Stage 3
├── enrichment.js               # Stage 4
├── proof-match.js              # Stage 5
├── draft.js                    # Stage 6 (OpenRouter LLM call)
├── artifact.js                 # outreach/{num}-*.md writer/reader
├── tracker.js                  # TSV addition writer
├── schedule.js                 # T0/T+3/T+7 + new-signal detection
├── run.js                      # orchestrator CLI
├── e2e.test.js                 # smoke test harness (gated on OUTBOUND_E2E=1)
└── clients/
    ├── apollo.js               # Apollo People Search + Match
    ├── bright-data.js          # LinkedIn profile + activity (trigger → poll → snapshot)
    └── playwright-fetch.js     # JD fetch fallback when WebFetch blocked

modes/outbound.md               # mode instructions for Claude
.opencode/commands/career-ops-outbound.md  # OpenCode slash command
docs/superpowers/specs/2026-04-21-outbound-email-design.md   # design spec
docs/superpowers/plans/2026-04-21-outbound-email.md          # implementation plan
```

All `.test.js` files pair 1:1 with their module. Run `npm run test:outbound` for outbound-only tests; `npm test` for the whole suite (currently 152 pass, 1 skipped e2e).

---

## Known gaps / what's NOT in MVP

1. **Stage 7 send is manual** — `run.js` reaches Gate 2 and exits. You copy the chosen variant into Gmail yourself. Gmail API auto-draft is deferred to v2.
2. **`run.js` doesn't wire the artifact/tracker writes from Gate 2 onward** — the modules (`artifact.js`, `tracker.js`, `schedule.js`) exist and are tested; Claude in mode-driven invocation handles this conversationally. CLI-only users will need to call those modules directly.
3. **`run.js` `webSearcher` is a stub** — returns `[]` in CLI-direct mode. The mode layer (Claude) injects real WebSearch results when invoked conversationally. CLI-direct will hard-stop at Stage 2 unless you pre-research and inject company data via state file.
4. **No multi-role batch** — explicit design choice. One role per invocation. No `/career-ops batch outbound`.
5. **Sales Navigator integration** — deferred. Bright Data covers data extraction; InMail not supported.

---

## article-digest.md TBDs

The proof-match stage reads `article-digest.md` for substance. The current file has 12 entries from prior portfolio work, with 10 fields marked `TBD — confirm with Brent:`. Populating these makes Stage 5 sharper:

1. Autonomous outbound — total clients, emails/month, meetings booked
2. Signals pipeline — client count beyond Thor Data
3. Klaviyo/Shopify — client name, revenue attributed, period
4. Trial Conversion Engine — production adoption status at UpKeep + live metrics
5. Thor Data — sustained metrics vs. first-cycle
6. Blingsting — downstream outcomes (retailers contacted, meetings, revenue)
7. FedRAMP/GovCon — externally citeable client or keep generic?
8. Day.ai / Close / Twenty / QuickBooks — NDA vs. citeable-by-name status
9. Delicious Impressions — confirm "$2M / 7-person team" phrasing still preferred
10. Wagner Bartosch / Sugarmade — confirm "20% market share / 57% COGS / 52% profit" externally citeable

The proof-match scorer rewards named tools and numbers, so filling these TBDs raises proof specificity scores significantly.

---

## Troubleshooting — hard-stop messages

| Message | What to do |
|---|---|
| `HARD STOP: Could not fetch JD from <url>. Paste the JD text to continue.` | The site blocked both WebFetch and Playwright. Copy the JD text manually. |
| `HARD STOP: JD is too thin (got N chars, need ≥500).` | Paste the full JD, not just a summary. |
| `HARD STOP: insufficient customer references found. Need ≥3.` | Company is too obscure or webSearcher returned thin results. Skip the company or paste customer references. |
| `HARD STOP: no recent news (≤12 months) found.` | A cold email without a news hook will feel generic. Find a news hook or skip. |
| `HARD STOP: Apollo returned N candidates for titles ...` | Broaden the title filter (edit `target-id.js` `TITLE_FILTERS_GTM`) or identify a target manually via LinkedIn. |
| `HARD STOP: APOLLO_API_KEY missing or invalid.` | Check `.env` — verify the key is set and active. |
| `HARD STOP: Apollo rate limit hit. Retry after Ns.` | Wait the specified seconds, then re-run. |
| `HARD STOP: BRIGHT_DATA_API_KEY missing or invalid.` | Check `.env` — verify the key is set. |
| `HARD STOP: Bright Data dataset ID missing — set BRIGHT_DATA_PROFILE_DATASET_ID or BRIGHT_DATA_ACTIVITY_DATASET_ID.` | Set the env vars per "Environment setup" above. |
| `HARD STOP: <name> has no LinkedIn activity (< 3 posts/comments) in the last 90 days.` | Pick an alternate target — this one has too little signal for a personalized hook. |
| `HARD STOP: No deliverable email for <name>.` | Apollo couldn't reveal an email. Pick an alternate target. |
| `HARD STOP: article-digest.md is empty or missing.` | Populate proof points before first outbound (see TBDs above). |
| `HARD STOP: Only N proof points matched JD bullets.` | Update article-digest.md with entries that ladder to those bullet topics, or skip the role. |
| `HARD STOP: Draft variant X failed after 2 attempts: ...` | LLM couldn't produce a voice-compliant draft after retry. Review the failure list, edit manually if you want to proceed. |

---

## Testing

```bash
npm run test:outbound   # outbound modules only
npm test                # full suite (~152 tests)
OUTBOUND_E2E=1 npm test # includes the paste-path e2e smoke test
```

Real-credential e2e: set all the env vars, drop a real JD URL, and run `node outbound/run.js --url ...`. The first run will surface any wiring gaps not caught by unit tests (Apollo response shape variation, Bright Data dataset config, OpenRouter model availability).

---

## Design references

- **Spec:** `docs/superpowers/specs/2026-04-21-outbound-email-design.md` — 13 sections, full architectural rationale, error message catalog, ethics + voice rules
- **Plan:** `docs/superpowers/plans/2026-04-21-outbound-email.md` — 18 tasks of TDD steps that built this module
