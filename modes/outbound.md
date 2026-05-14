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
