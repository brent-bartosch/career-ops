# LinkedIn GTM Daily Scan — Design

**Date:** 2026-06-09
**Status:** Approved for planning
**Author:** Brent + Claude

## 1. Goal

Run a **daily** scrape of new LinkedIn job postings for **GTM Engineering** and
**Head of GTM (startup)** roles — targeting **Los Angeles (hybrid/full-time)**,
**Remote (USA)**, and **contract** positions — score them, and surface the catch
in a **visual Google Sheet** for triage. Compute runs on **Railway** as a
scheduled cron job. The system must **never lose Bright Data output** the way the
current manual sync-endpoint workflow does.

## 2. Context — what already exists (reuse, don't rebuild)

This is **not a new system**. The repo already contains an open-web job scanner:

| Existing asset | Reused for |
|---|---|
| `outbound/clients/bright-data.js` | Async Bright Data flow (`trigger → progress → snapshot`). Extend for the **jobs** dataset. |
| `scoring/archetype-matcher.js` | Tag postings by archetype. **Add** `gtm_engineer` + `head_of_gtm`. |
| `scoring/intent-scorer.js` | 0–100 intent score (title-agnostic — works as-is). |
| `scoring/llm-classifier.js` | country / employmentType / duration / roleFit / fitScore / dealBreakers. |
| `scoring/parse-posted-date.js` | Normalize posted date → ISO. |
| `scrapers/push-to-sheets.js` | Google Sheets writer (preserves user columns). **Extend** with visual columns. |
| `scrapers/query-templates.yml` | Pattern for the new `linkedin-queries.yml` config. |

The existing **SERP scanner** (`scrapers/scan.js`) already lists LinkedIn as a
platform, but Google `site:linkedin.com/jobs` returns thin snippets and is
heavily blocked. The **Bright Data Jobs dataset** (`gd_lpfll7v5hcqtkxl6l`) returns
the full structured record (full JD, salary, applicant count, seniority, recruiter,
logo, apply link). This project is a **better LinkedIn source adapter** feeding the
same scoring stack — kept **standalone** from the SERP hopper (Approach A).

## 3. Architecture

```
linkedin-queries.yml ─┐
                      ▼
            ┌──────────────────────┐
            │  input-matrix builder │  keywords × locations → input objects → chunks of 5
            └──────────┬───────────┘
                       ▼
            ┌──────────────────────┐     records every snapshot_id
            │  Bright Data jobs     │────────────────────────────────┐
            │  client (async)       │  trigger → progress → snapshot   │
            └──────────┬───────────┘                                  ▼
                       ▼                                   ┌────────────────────┐
            ┌──────────────────────┐                       │  Snapshot Ledger    │
            │  normalizer           │  BD record → posting  │  (_runs tab in Sheet)│
            └──────────┬───────────┘                       └────────────────────┘
                       ▼                                              ▲
            ┌──────────────────────┐  dedup vs Sheet job IDs          │ reconcile
            │  scoring (reuse)      │                                  │ pending/orphan
            └──────────┬───────────┘                                  │
                       ▼                                              │
            ┌──────────────────────┐                                  │
            │  Sheets writer        │  visual rows + provenance ───────┘
            └──────────────────────┘
```

### Components

- **`scrapers/linkedin-queries.yml`** — config: dataset id, defaults, location
  variants, archetype keyword lists. Tunable without code changes.
- **`scrapers/linkedin-source.js`** — Bright Data **jobs** adapter. Builds the
  input matrix, chunks it, triggers async jobs, polls, fetches **complete**
  snapshots (handles pagination/parts), normalizes records.
- **`scrapers/snapshot-ledger.js`** — reads/writes the `_runs` tab; reconcile
  logic (fetch pending, re-fetch ready-but-unfetched, adopt orphans).
- **`scrapers/linkedin-scan.js`** — orchestrator (entrypoint). Reconcile-first,
  then trigger new, then score new, then write rows.
- **`scoring/*`** — reused; `archetype-matcher.js` gains two archetypes.
- **`scrapers/push-to-sheets.js`** — extended writer (visual columns + `_runs` tab
  + env-based service-account auth for Railway).

## 4. Bright Data capture — reliability (the core problem this solves)

**Root cause of lost output:** the current workflow uses the **synchronous**
`/datasets/v3/scrape` endpoint. Large discover jobs stream back in blocks; when the
response times out or drops, the data is lost client-side even though Bright Data
scraped it successfully — forcing manual recovery from Bright Data's UI.

**Fix — three parts:**

1. **Async, never sync.** Use `/datasets/v3/trigger` → `/progress/{snapshot_id}` →
   `/snapshot/{snapshot_id}?format=json`. Every job becomes a durable
   `snapshot_id` that persists in Bright Data until pulled. (This is the flow
   `outbound/clients/bright-data.js` already implements.)

2. **Chunk inputs to ≈5 per trigger.** Aligns our failure boundary with Bright
   Data's natural batching ("blocks of five"). A failed chunk re-runs alone, not
   the whole job.

3. **Snapshot Ledger + Reconciler** (the `_runs` tab):
   - Record each `snapshot_id` **the instant it's triggered, before any fetch**.
     Columns: `trigger_time`, `inputs_summary`, `snapshot_id`, `status`
     (`triggered`/`ready`/`fetched`/`failed`), `rows_captured`, `error`.
   - **Reconcile-first** on every run: poll each non-`fetched` snapshot; when
     `ready`, pull the **complete** snapshot and mark `fetched`. Re-pull anything
     `ready`-but-not-`fetched` (idempotent — dedup by job ID).
   - **Orphan adoption backstop:** list recent snapshots for the dataset via Bright
     Data's snapshot-list endpoint; adopt any `snapshot_id` not in the ledger
     (covers a crash between trigger and ledger-write).

   Net: a run can crash anywhere; the next run recovers everything. Zero manual
   transfer. The `_runs` tab doubles as the run-management dashboard.

> **Verify during implementation:** exact path/shape of Bright Data's
> snapshot-list endpoint and whether large snapshots paginate via `?part=` or
> `format=jsonl`. Pull the full set regardless of mechanism.

## 5. Query / input matrix

`linkedin-queries.yml` (illustrative — tunable):

```yaml
dataset_id: gd_lpfll7v5hcqtkxl6l
defaults:
  country: US
  time_range: "Past 24 hours"   # daily cadence
  experience_level: ""           # don't over-filter; rely on scoring
chunk_size: 5
locations:
  - { label: la_hybrid,         location: "Los Angeles",  remote: "Hybrid",  job_type: "Full-time" }
  - { label: la_onsite,         location: "Los Angeles",  remote: "On-site", job_type: "Full-time" }
  - { label: remote_us_ft,      location: "United States", remote: "Remote", job_type: "Full-time" }
  - { label: remote_us_contract,location: "United States", remote: "Remote", job_type: "Contract" }
  - { label: la_contract,       location: "Los Angeles",  remote: "",        job_type: "Contract" }
discovery_archetypes: [gtm_engineer, head_of_gtm]   # cost control: discover narrow
archetypes:
  gtm_engineer:
    keywords:
      - "GTM engineer"
      - "go-to-market engineer"
      - "growth engineer"
      - "marketing engineer"
      - "automation engineer"
      - "revenue operations engineer"
      - "GTM systems"
      - "GTM automation"
      - "forward deployed engineer"
  head_of_gtm:
    keywords:
      - "head of GTM"
      - "head of go-to-market"
      - "VP GTM"
      - "founding GTM"
      - "head of growth"
      - "head of revenue"
      - "GTM lead"
```

**Input builder:** cartesian product of `discovery_archetypes` keywords ×
`locations` → input objects of the form Bright Data expects
(`{location, keyword, country, time_range, job_type, remote, experience_level,
company:"", location_radius:""}`) → chunked into groups of `chunk_size`.

**Cost control:** discovery runs only `gtm_engineer` + `head_of_gtm` keywords;
`Past 24 hours` + Sheet-dedup keep daily volume to tens of rows. Widening
discovery to the other four archetypes is a one-line `discovery_archetypes` edit.

## 6. Scoring reuse + new archetypes

- **`archetype-matcher.js`** — add:
  - `gtm_engineer`: titleKeywords (`gtm engineer`, `go-to-market engineer`,
    `growth engineer`, `marketing engineer`, `automation engineer`,
    `revenue operations engineer`, `forward deployed engineer`),
    responsibilityKeywords (`clay`, `outbound automation`, `workflow automation`,
    `gtm stack`, `api integration`, `data enrichment`, `n8n`, `zapier`).
  - `head_of_gtm`: titleKeywords (`head of gtm`, `head of go-to-market`, `vp gtm`,
    `founding gtm`, `gtm lead`, `head of growth`, `head of revenue`),
    responsibilityKeywords (`go-to-market strategy`, `pipeline`, `founding`,
    `revenue`, `cross-functional`, `sales and marketing`).
- **Classification tags all six archetypes** (existing four + two new) regardless
  of discovery scope — no signal lost on returned postings.
- **`intent-scorer.js`**, **`llm-classifier.js`**, **`parse-posted-date.js`** —
  used unchanged. Classify only postings above the existing intent threshold
  (cost control on the LLM step).

## 7. Google Sheet — visual surface

Main tab columns (system-managed + user columns preserved):

| Col | Source | Notes |
|---|---|---|
| Logo | `company_logo` | `=IMAGE(url)` renders inline |
| Posted | `parsePostedDate` | ISO, sortable |
| Posted (raw) | `job_posted_time` | "53 minutes ago" |
| Company | `company_name` + `company_url` | `=HYPERLINK(url, name)` |
| Title | `job_title` + `url` | `=HYPERLINK(url, title)` |
| Location | `job_location` | |
| Type / Remote | `job_employment_type` + matrix `remote` | |
| Salary | `job_base_pay_range` / `base_salary` | |
| Applicants | `job_num_applicants` | early-signal sort |
| Seniority | `job_seniority_level` | |
| Archetypes | matcher output | comma list |
| Intent | `intent-scorer` | 0–100 |
| Fit / Role Fit | `llm-classifier` | score + good/partial/poor |
| Apply | `apply_link` | `=HYPERLINK(link,"Apply")` |
| Recruiter | `job_poster.name` + `.url` | warm-intro signal |
| **Status** | user | preserved on re-push |
| **Notes** | user | preserved |
| **Priority** | user | preserved |
| Snapshot ID | provenance | links row → `_runs` |
| Found At | provenance | ISO |

**Dedup:** read existing `job_posting_id`s from the main tab before writing; append
only new rows. The Sheet is the source of truth — no separate DB/volume.

`_runs` tab: the Snapshot Ledger from §4.

## 8. Deployment — Railway

- **Primitive:** Railway **cron job** (container runs on schedule, exits) — not an
  always-on service. No live dashboard yet (YAGNI; the `_runs` tab covers run
  visibility).
- **Schedule:** daily, e.g. `0 13 * * *` UTC ≈ 6:00 AM PT.
- **Entrypoint:** `node scrapers/linkedin-scan.js` (reconcile-first, then trigger,
  score, write).
- **Secrets (Railway env vars):** `BRIGHT_DATA_API_KEY`,
  `BRIGHT_DATA_JOBS_DATASET_ID` (=`gd_lpfll7v5hcqtkxl6l`), `OPEN_ROUTER_API_KEY`,
  `GOOGLE_SERVICE_ACCOUNT_JSON` (full JSON string), `SHEET_ID`.
- **Auth adaptation:** `push-to-sheets.js` currently reads
  `credentials/sheets-sa.json`. Extend to accept `GOOGLE_SERVICE_ACCOUNT_JSON`
  from env (parse to credentials object) so no secret file is needed on Railway.
- **Build:** Nixpacks (Node auto-detected) or a minimal Dockerfile.

## 9. Phasing

- **Phase 1 — validate content (local or one-off Railway run).** Build the
  source + normalizer + scoring + Sheets writer + ledger. Run it a few times.
  Inspect the Sheet: are the right roles surfacing? Do logos/hyperlinks render?
  Is scoring sensible? Tune `linkedin-queries.yml` and archetype keywords.
- **Phase 2 — schedule on Railway.** Once content quality is confirmed, deploy the
  daily cron + env secrets. Add a more-frequent `--reconcile`-only cron later
  **only if** discover jobs routinely run long.

## 10. Error handling

- Bright Data trigger/progress/snapshot failures → mark ledger row `failed` with
  error; never silently swallow (fail-loud). Reconcile retries bounded (e.g. 3
  attempts) then surfaces in the run summary.
- Snapshot timeout → leave `triggered`/`ready`; next run reconciles (no data loss).
- Sheets API / auth failure → abort the write, leave ledger intact so the next run
  re-pushes; log clearly.
- LLM classifier failure on a posting → keep the posting with intent score only;
  mark fit fields empty (don't drop the row).
- Missing config / secrets → fail fast at startup with a clear message.

## 11. Testing

Co-located `*.test.js` (matching existing `scoring/` and `outbound/` convention):

- `linkedin-source.test.js` — input-matrix builder (cartesian + chunking);
  normalizer maps the sample JSON → posting shape.
- `snapshot-ledger.test.js` — reconcile state machine (pending→fetched,
  ready-but-unfetched re-pull, orphan adoption) with a mocked fetch + Sheet.
- `archetype-matcher.test.js` — extend with GTM-engineer / head-of-GTM fixtures.
- `push-to-sheets` — visual cell formatting (`=IMAGE`, `=HYPERLINK`), user-column
  preservation on re-push.
- Use the existing `Linkedin Jobs/keyword_output_linkedin_jobs.JSON` as a fixture.

## 12. Out of scope (YAGNI)

- Postgres/Supabase store (Phase-2+ only if the Sheet creaks).
- Always-on service / web dashboard.
- Merging into the SERP `postings.json` hopper (kept standalone).
- Auto-applying or outreach (separate `outbound/` system).
- Widening discovery to all six archetypes (config flip when wanted).

## 13. Open questions

- Confirm Bright Data snapshot-list endpoint path + large-snapshot pagination.
- Confirm acceptable daily Bright Data spend at the default matrix size
  (~16 keywords × 5 locations ÷ 5 per chunk ≈ 16 triggers/day).
- Confirm `remote` enum values Bright Data accepts (`Remote`/`Hybrid`/`On-site`).
```
