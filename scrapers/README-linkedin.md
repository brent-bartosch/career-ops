# LinkedIn GTM Daily Scan

Daily Bright Data scan of new LinkedIn **GTM Engineering** / **Head of GTM** / **Contract-Fractional** postings
(LA hybrid/onsite, Remote-US, contract) → scored → archetype-gated → appended to a
visual Google Sheet. Reliability core: async snapshots + a `_runs` ledger that makes
lost output impossible. Deployed as a Railway cron.

## Run (local)

```bash
node scrapers/linkedin-scan.js                 # full daily run (trigger + reconcile + classify)
node scrapers/linkedin-scan.js --no-trigger    # reconcile/recover only — spends no Bright Data credits
node scrapers/linkedin-scan.js --no-classify   # scrape + append, skip the LLM classify step (cheaper)
```

## Config — `scrapers/linkedin-queries.yml`

- `dataset_id` — Bright Data LinkedIn jobs dataset (`gd_lpfll7v5hcqtkxl6l`).
- `chunk_size` — inputs per Bright Data trigger (default 5; failure boundary).
- `require_archetype_match` — `true` (default): only append postings matching ≥1
  archetype, which strips the ~76% off-target noise LinkedIn's keyword search returns.
  Set `false` to append everything.
- `locations` — the LA-hybrid / LA-onsite / Remote-US-FT / Remote-US-contract / LA-contract variants.
- `discovery_archetypes` — which archetypes are **discovered** (cost control). Classification
  in `scoring/archetype-matcher.js` still tags **all** archetypes on returned postings.
- `archetypes.*.keywords` — the LinkedIn search keywords per archetype.

Default matrix ≈ 35 keywords × 5 locations = 175 inputs ⇒ ~35 Bright Data jobs/day.

## Environment

| Var | Used for | Notes |
|-----|----------|-------|
| `BRIGHT_DATA_API_KEY` | Bright Data Dataset API bearer | `BRIGHTDATA_API_KEY` also accepted (repo convention) |
| `OPEN_ROUTER_API_KEY` | LLM classification | reused from the existing scan |
| `LINKEDIN_SHEET_ID` | target Google Sheet id | the long string in the Sheet URL between `/d/` and `/edit` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Sheets auth on Railway | full service-account JSON (one line). Locally, `credentials/sheets-sa.json` is used instead |

The target Sheet must be shared (Editor) with the service-account email
(`client_email` in `credentials/sheets-sa.json`). The scan creates two tabs:
`Postings` (the catch) and `_runs` (the snapshot ledger).

## Reliability — the `_runs` tab

Every Bright Data `snapshot_id` is written to `_runs` **before** it is fetched.
Each run **reconciles first**: it polls pending snapshots, fetches ready ones
(idempotent — dedup is by LinkedIn Job ID), and **adopts orphans** (snapshots the
dataset has but the ledger doesn't). So an interrupted run self-heals on the next
run with zero manual transfer. Statuses: `triggered → ready → fetched | failed`
(`failed` is terminal). To force a recovery without new scraping: `--no-trigger`.

## Railway deployment

1. **Service:** create a Railway service from this repo. It builds via the `Dockerfile`.
2. **Cron:** set the service type to Cron, schedule `0 13 * * *` (≈ 06:00 PT),
   start command `node scrapers/linkedin-scan.js`.
3. **Variables:** set `BRIGHT_DATA_API_KEY`, `OPEN_ROUTER_API_KEY`, `LINKEDIN_SHEET_ID`,
   and `GOOGLE_SERVICE_ACCOUNT_JSON` (paste the full service-account JSON). The Sheet
   must already be shared with that service account's email.
4. **Verify:** trigger a manual run; confirm logs show triggers + reconcile and the
   Sheet gains rows. Confirm the `_runs` tab updates. Re-run with `--no-trigger` to
   confirm reconcile-only recovers anything left pending.

Secrets are never baked into the image — `.dockerignore` excludes `.env` and
`credentials/`; everything comes from Railway env vars at runtime.
