# Article Digest — Brent Bartosch Proof Points

**Purpose:** Source of truth for grounded, cited, metric-bearing proof points used when drafting job-application materials (evaluations, outbound emails, CVs, interview prep). One entry per build/accomplishment. Pull 2–3 most relevant entries when drafting — do not paste wholesale.

**Rule:** Never fabricate metrics. If a number isn't here or in `cv.md`, flag `TBD — confirm with Brent`.

**Companion files:**
- `cv.md` — canonical CV, authoritative for dates/titles
- `modes/_profile.md` — positioning and approach narrative
- This file — metric-bearing proof anchors

---

## Voice rules (governs any text generated "as Brent")

- Leads with the point. Never opens with "excited," "thrilled," "passionate," "reaching out because."
- Practitioner authority. Names specific tools, versions, configs, numbers. "Here's what I built / what broke / what I fixed" — not theorizing.
- Technical specificity is the tell. "8-stage pipeline, 5 deterministic, 3 AI, 1 hybrid" beats "sophisticated pipeline."
- Corrections before compliments. One compliment max, earned, used as a pivot.
- No LinkedIn-bro energy. No emoji, no "Great post!", no trailing CTAs, no motivational closers.
- Ends when the point is made. 60–80 words for LinkedIn comments. 2–4 short paragraphs for outbound.

**Banned phrases:** excited to, thrilled, passionate, innovative, cutting-edge, best-in-class, leverage (as verb), unlock, synergy, move the needle, I'd love the opportunity, sound familiar?, does this resonate?

---

## Positioning one-liners

- **Title:** "GTM Systems Architect" / "GTM Engineer & AI Systems Architect"
- **Frame:** "I build bespoke go-to-market infrastructure — lead intelligence, pipeline automation, trial conversion engines, outbound systems — wired directly to APIs, with AI embedded as an engineering component."
- **Differentiator:** "I don't assemble no-code stacks — I build custom TypeScript and Python pipelines using Claude Code, Supabase, and direct API integrations."
- **Unfair edge:** 7+ years enterprise SaaS sales (Skai, Conversion Logic, Crealytics) + 3+ years building production AI infrastructure. Carried CAC/LTV/ROAS as a quota-carrying AE, now writes the code.

---

# Proof point entries

## Trial Conversion Engine (UpKeep / mid-market B2B SaaS)

**Context:** $30M B2B SaaS (UpKeep/CMMS), 4,000+ customers in asset-heavy industries, Y Combinator 2017, profitable 6 years. Customers include Unilever, Shell, JetBlue, Marriott, Chick-fil-A. They had already internally flagged trial conversion as "a significant opportunity area." Speculative build — Smoothed identified the problem, built the full system, used it as proof of capability.

**What I built:** 8-stage pipeline (5 deterministic, 3 AI-powered, 1 hybrid) that takes a raw trial signup to a scored, routed, sales-ready opportunity in under 90 seconds. Stages: intake → enrichment → behavioral signal extraction → ICP scoring → confidence-tiered routing → dossier generation → personalized email drafting → independent quality gate (different LLM instance, different prompt, 6 numeric grading criteria). Routing is never left to the LLM — deterministic where decisions must be auditable.

**Metrics / scale:**
- ~10,300 LOC for the full build
- 7 ICP cohorts distilled from 40+ real customer stories + 1,500+ scraped pages of client web presence
- Pipeline cost: under $0.04 per lead
- First calibration run: 12 sample leads, 8 routed correctly, 4 misrouted — three root causes diagnosed, each scoped to a specific file and line
- 3-view dashboard: Pipeline / Dossier / Observability

**Stack:** TypeScript, Node.js, Claude API, Supabase (Postgres + Edge Functions), Playwright, Cheerio, file-based JSON artifacts for audit trail.

**Outcome:** Shippable end-to-end system as proof of capability; self-demonstrated methodology. Calibration architecture surfaced defects with file-line precision rather than opaque model errors.

**Best used to prove:** Multi-stage pipeline architecture · Deterministic + AI hybrid systems · ICP scoring at scale · Independent quality gates · Confidence-tiered routing · Speculative build as sales mechanism · Pre-mortem / calibration methodology · Sub-$0.05 per-lead economics

---

## Lead Intelligence Layer (Thor Data)

**Context:** Thor Data — proxy/SERP/scraping infrastructure company entering US market against Bright Data and Oxylabs. Incumbent playbook (buy lists, run sequences) would put them in the same inbox as every other proxy vendor. Their buyers aren't in ZoomInfo — they're on Reddit, GitHub, HackerNews, Twitter. Bombora/G2 intent wouldn't help (same signals every competitor sees, delayed, account-level only). **Self-demonstrating architecture:** every scraper runs on Thor Data's own APIs, so the GTM system is also the flagship case study.

**What I built:** 6-stage signal intelligence pipeline. Four parallel scrapers (Reddit, GitHub, HackerNews, Twitter) → Claude 3 Haiku classifier into 4 tiers → deterministic qualification scoring → Slack webhook for Tier 1. 200+ keyword taxonomy organized by product × cohort × intent. Structured prompts over ML — inspectable, tunable, no retraining cycles.

**Metrics / scale:**
- 910 buying signals captured in first cycle
- 332 Tier 1 prospects → 36% quality rate (vs. 0.5–1% industry standard from cold list outbound)
- By source: GitHub 532 (118 Tier 1), Reddit 135 (133 Tier 1), Twitter 100 (49 Tier 1), HackerNews 143 (32 Tier 1)
- Reddit signals classified 99% Tier 1 or 2 — highest quality-to-volume ratio observed
- Classification cost: $0.001/signal; full pipeline <$0.05 per qualified lead
- 4-hour cycles via pg_cron
- Live ongoing: ~1,100 daily signals captured

**Stack:** TypeScript, Thor Data APIs (Web Unlocker, SERP API, Scraper API), Claude 3 Haiku, Supabase Edge Functions (Deno), pg_cron, Slack webhooks.

**Outcome:** Scope-disciplined build — Month 1 deliberately 100% manual review, no automated outbound, no CRM sync. Classification accuracy proven before routing logic. 36x improvement over cold-list benchmarks.

**Best used to prove:** Multi-source signal capture · LLM classification with structured prompts · Scope discipline (manual before automated) · Intent data sourced where buyers actually talk · Self-demonstrating product usage · Cost-per-signal economics · Source-quality differentiation (Reddit vs. GitHub vs. HN)

---

## Outbound Intelligence System (Blingsting)

**Context:** Blingsting — $7M consumer safety brand. Faire was primary marketplace and cut them off overnight, losing channel access and 12,000 buyer relationships simultaneously. No CRM, no outbound, no owned data. Dependency-on-someone-else's-infrastructure problem crystallized. Rebuild from zero.

**What I built:** Outbound Intelligence System organized in four phases — Source → Enrich → Score & Segment → Execute. Independent enrichment channels (website, social, SERP, geo) with cross-validation. AI name normalization layer to deduplicate across LLC / DBA / variants. Separate filter layer to drop non-target categories before email send.

**Metrics / scale:**
- 240,000+ independent retailers identified across 7 target categories
- 20x Blingsting's existing customer base (12K)
- 72%+ email discovery rate where websites existed (direct scraping, not vendor lookups)
- 150+ non-target categories filtered before outbound sent
- 274,000+ cached normalized names, 95%+ cache hit rate
- Pattern later deployed against marketplace data: 14,000 wholesale brands classified by quality tier using AI text + visual analysis

**Stack:** TypeScript, Playwright, Cheerio, Claude API for normalization + tier classification, Supabase for cache layer, SERP API for discovery.

**Outcome:** Ended up structurally better positioned than before the Faire cutoff. Owned pipeline replaced single-marketplace dependency. Headline framing: "Faire didn't fail Blingsting. Blingsting's pipeline architecture failed Blingsting."

**Best used to prove:** Proprietary dataset construction · Cache-first architecture at 95%+ hit rates · AI-driven text normalization · Email discovery via direct scraping · Filter layers before send (precision over volume) · Rebuild-after-platform-cutoff resilience patterns

---

## CRM Orchestration Layer (multi-platform)

**Context:** Several clients needed the last 20% of CRM routing, lifecycle, and data-quality logic that workflow builders (HubSpot Workflows, Salesforce Flow) can't express — fuzzy dedupe across company variations, enrichment-dependent routing, rule-based lifecycle transitions with queryable audit trails. Sits alongside the CRM, not a replacement.

**What I built:** Reusable 4-component architecture — Intake gate → Enrichment layer → Lifecycle engine → Action layer. Every lifecycle transition logged with the triggering rule + data that satisfied it. Deployed across multiple CRM targets with the same scaffold.

**Metrics / scale:**
- **Close CRM (production):** SmartLead webhook → Supabase enrichment → Close Lead + Opportunity + Task + Note. 11 custom fields. 8 webhook event types handled.
- **Day.ai (production):** Built in 3 days. OAuth 2.0 + MCP (Model Context Protocol) integration exposing 19 AI-native tools. 14 custom properties. Managing 8,233 brands, 386 contacts.
- **Twenty CRM:** Bi-directional sync spec complete, ready for implementation.
- **QuickBooks Desktop (production):** SOAP → REST bridge via Conductor API, deployed on Supabase Edge Functions. Multi-tier exclusion logic. 7-day batch processing. Atomic state updates with audit trail.
- **SmartLead wrapper (separate, production):** 34+ production API methods, 8 webhook event types, rate limiting + exponential backoff, in-thread reply handling.

**Stack:** Node.js, TypeScript, Deno (Supabase Edge Functions), OAuth 2.0, MCP, REST, SOAP-to-REST via Conductor, pg_cron, webhook dispatch.

**Outcome:** Repeatable pattern — new CRM targets ship in days, not quarters. Day.ai integration from zero to production in 3 days including full OAuth + MCP tool surface.

**Best used to prove:** Direct-API CRM integration (no Zapier/Make/iPaaS) · OAuth 2.0 implementations · MCP tool authoring · Webhook orchestration · SOAP-to-REST bridging · Fuzzy dedupe logic · Queryable lifecycle audit trails · Multi-CRM portability of one core design

---

## Spend Attribution Engine (FedRAMP / GovCon platform)

**Context:** FedRAMP High-authorized AI platform (independent authorization — not Moderate, not inherited). Active defense contractor deployments. Strongest moat in the category but zero market visibility. $81K spent on Google Ads over 17 months with degrading returns. CPA had shifted 5.7x worse after a previous agency restructure logged 217 changes in a single day.

**What I built:** Forensic 4-stage attribution methodology — platform audit (each channel independently) → cross-platform synthesis → channel quality scoring (engagement × volume, not raw traffic) → ongoing Looker Studio dashboard. 30-day engagement. Framing: "Channel quality over channel volume. 10,000 sessions at 20% engagement is worse than 3,000 at 60%."

**Metrics / scale:**
- $81,775 in Google Ads forensically analyzed across 17 months
- CPA degradation diagnosed: $160 → $909 (5.7x worse) traced to 217-change single-day restructure
- "Compliance" discovered as account-level negative keyword — blocking core ICP searches entirely (5-min fix, immediate unblock)
- Zero FedRAMP / NIST / DFARS / CUI keywords in paid search despite being the company's strongest differentiator
- Zero conversion events in GA4 across 32,940 sessions — flying blind
- 19 competitor comparison pages with zero body content, $53K conquest ads sending traffic to them
- Organic outperformed paid 2.5x at $0 cost — the story hidden in the data

**Stack:** Google Ads API, GA4, Google Search Console, BigQuery, Looker Studio, SEMrush.

**Outcome:** 5-minute fixes unblocked entire keyword categories. Measurement foundation restored. Spend re-routed off ghost pages. Full War Machine content architecture specified for scaling organic advantage.

**Best used to prove:** Forensic paid-media audits · CPA regression root-causing · GA4 conversion debugging · Negative-keyword diagnostics · Channel quality vs. volume framing · Organic-vs-paid attribution · Multi-platform dashboard construction · FedRAMP/GovCon market context

---

## Content Engine — "The War Machine" (FedRAMP / GovCon platform)

**Context:** Same FedRAMP client. Content production was on the writer's queue, not the market's timeline. 101 compliance-specific keywords where the client had zero presence — e.g., "fedramp marketplace" (8,100/mo search volume), "nist 800-171" (4,400/mo), "cmmc certification" (2,900/mo).

**What I built:** 5-layer architecture — Intelligence grid (5 monitoring agents) → Signal classification (THREAT / OPPORTUNITY / CONTENT_GAP / TREND) → Content pipeline (Analyst → Writer → Editor → Publisher, LangGraph-orchestrated) → Distribution (CMS, Ads, Social, Email) → Measurement loop. Editor runs 5 verification gates: factual accuracy, brand voice, legal review, SEO quality, differentiation. Framing: "Intelligence-driven, not calendar-driven. Content gets created because something happened in the market, not because it's Tuesday."

**Metrics / scale:**
- 551-keyword corpus built from SEMrush intelligence, organized by intent clusters
- 101 compliance-specific keywords identified with zero client presence
- Corpus enrichment pipeline: 998 lines of code, 27 passing tests, connecting Google Ads keyword data to backend knowledge bases
- Programmatic pages shipped replacing 19 empty competitor-comparison shells
- 5 editor verification gates per piece before publish

**Stack:** TypeScript, Python, LangGraph (multi-agent orchestration), Claude API, SEMrush API, Google Ads API, Astro (site framework), Supabase, BigQuery.

**Outcome:** Empty competitor-comparison pages filled with real content. Compliance keyword categories moved from zero visibility to targeted pages. Feedback loop wired from paid search signals to organic content strategy.

**Best used to prove:** Multi-agent LLM orchestration (LangGraph) · Programmatic SEO at scale · Content quality gates (editor with 5 verification passes) · Market-signal-driven content triggers · Keyword corpus construction · Ads-to-organic feedback loops · Astro / site framework proficiency

---

## Autonomous Outbound Infrastructure (150+ mailbox engine)

**Context:** Recurring need across Smoothed clients — campaigns were launching too slowly because every stage required a handoff. List build in Clay, enrichment in another tool, personalization in a third, send in SmartLead, reply handling manual, CRM sync manual. Each handoff was a queue.

**What I built:** Fully event-driven outbound engine. Multi-source collection → LLM-powered enrichment → automated qualification → personalized outreach → reply classification → CRM graduation → multi-touch attribution. Webhooks and database triggers replace every handoff. 150+ mailboxes across Outlook and Gmail with automated warmup, rotation, and reputation monitoring via Smartlead API.

**Metrics / scale:**
- 150+ managed mailboxes across Outlook and Gmail
- Campaign launch time: ~8 hours → ~3 minutes
- Client acquisition cost reduction: ~90% (multi-source pipeline + automated qualification + routing)
- SmartLead API wrapper: 34+ production methods, 8 webhook event types, custom reply system, in-thread replies at scale with rate limiting
- TBD — confirm with Brent: total clients live on this infrastructure, aggregate emails sent per month, aggregate meetings booked

**Stack:** TypeScript, Node.js, SmartLead API, Supabase (Postgres + Edge Functions), Claude API for personalization + reply classification, webhook orchestration.

**Outcome:** Launch friction approaching zero. Reply classification and CRM routing no longer require a human in the loop for the deterministic majority.

**Best used to prove:** Cold-email deliverability at scale · Mailbox warmup / rotation / reputation · Event-driven architecture · Webhook + database trigger orchestration · Reply classification · CRM graduation logic · 90% CAC reduction via pipeline redesign · Clay / SmartLead / Apollo stack fluency

---

## Signals Pipeline Generator (personal + client deployments)

**Context:** Reusable scaffold for multi-source intent capture, extended beyond Thor Data to general buyer-signal harvesting.

**What I built:** Reddit / HN / Twitter / GitHub scrapers with Supabase Edge Functions, pg_cron scheduling on 4-hour cycles, deduplicated storage, Slack alerts on Tier 1. Automated LLM tiering, company extraction, and lead creation downstream.

**Metrics / scale:**
- ~1,100 daily signals captured (live)
- 4-hour cycle cadence via pg_cron
- 4-tier classification (Claude Haiku)
- TBD — confirm with Brent: number of clients currently running this scaffold

**Stack:** TypeScript, Deno (Supabase Edge Functions), pg_cron, Claude 3 Haiku, Slack webhooks.

**Outcome:** Portable signal-capture pattern; deployable to new clients in under a week.

**Best used to prove:** Scrape orchestration (Reddit / HN / Twitter / GitHub) · pg_cron scheduling · Deduplication at ingest · Tiered LLM classification · Slack alerting patterns · Reusable GTM scaffolding

---

## Klaviyo + Shopify Revenue Attribution (ancillary / breadth)

**Context:** Standard Shopify + Klaviyo deployments lose attribution on any send that isn't a trivial click-through. Multi-touch, delayed conversions, UTM decay — all invisible.

**What I built:** Multi-touch tracking layer. Profile search via Klaviyo API v2023-12-15. UTM + campaign extraction. Days-to-conversion calculation. Claude-assisted matching for ambiguous cases with High / Medium / Low confidence scoring.

**Metrics / scale:**
- Klaviyo API v2023-12-15 (versioned integration)
- 3-tier confidence scoring (High / Medium / Low) on matched conversions
- TBD — confirm with Brent: client name, revenue attributed, period covered

**Stack:** TypeScript, Klaviyo API, Shopify API, Claude API for ambiguous-case matching, Supabase.

**Outcome:** Conversion attribution restored on complex multi-touch paths that standard Klaviyo/Shopify reporting misses.

**Best used to prove:** Klaviyo API depth · Shopify integration · Multi-touch attribution · Confidence-scored matching · E-commerce revenue ops

---

## API Toolkit (personal dev infrastructure)

**Context:** MCP servers are heavy — every tool carries its full schema into context. Building on Claude Code with many integrations meant context bloat was becoming the bottleneck.

**What I built:** Lightweight Python framework with lazy-loaded service modules (~500 tokens each). Token-efficient alternative to MCP servers. Covers Supabase, SmartLead, BrightData, Metabase, Render, Context7.

**Metrics / scale:**
- ~180x more context-efficient than MCP servers for equivalent service coverage
- ~500 tokens per service module at load time
- 6 services covered: Supabase, SmartLead, BrightData, Metabase, Render, Context7

**Stack:** Python, lazy-loading module pattern.

**Outcome:** Context budget reclaimed. More integrations simultaneously loadable.

**Best used to prove:** LLM context-budget engineering · Framework design · MCP alternatives · Python tooling

---

## Automated Job Discovery Platform (this repo / personal)

**Context:** Evaluating 40+ target companies weekly was unscalable manually. Building the job-search system itself.

**What I built:** Multi-source scraping (Greenhouse API, Lever HTML, Google Search), 3-tier keyword classification, GitHub Actions daily automation, Google Sheets delivery.

**Metrics / scale:**
- 42 companies monitored
- 118+ jobs tracked daily
- GitHub Actions daily cadence
- 3-tier keyword classification

**Stack:** Node.js (mjs modules), Greenhouse API, Lever HTML scraping, Google Search, GitHub Actions, Google Sheets API, Playwright.

**Outcome:** Automated the evaluate-shortlist-track loop for own job search.

**Best used to prove:** Multi-source job-board scraping · GitHub Actions scheduling · Google Sheets as delivery surface · Self-applied tooling discipline

---

## Approach & Methodology (cross-cutting)

**Context:** Several principles show up in every build and distinguish the work from no-code / iPaaS alternatives. Surface these when the JD is asking for "how you think" rather than "what you've shipped."

**What I practice:**
- **API-direct.** Systems wire to CRM, enrichment, and analytics APIs directly. No Zapier, no Make, no middleware. Stated explicitly as scope discipline.
- **AI as engineering component.** AI is embedded where it earns its place. Deterministic scaffolding around LLM calls, confidence scoring at every AI stage, typed output validation, independent quality gates (different model / different prompt for verification).
- **Pre-mortem methodology.** Failure modes identified before implementation. Assumption extraction, cascading business-impact analysis, quantitative scenario modeling.
- **Speculative builds.** "When we see a problem worth engineering against, we build it." Full systems shipped as proof of capability — Trial Conversion Engine, Thor Data Lead Intelligence.
- **Scope discipline.** Month 1 manual before automated. Classification accuracy before routing logic. Shipping slower = shipping sustainable.
- **Audit → Optimize → Build.** Most engagements start with an audit, not a build. Named spectrum; "build" is not the default pitch.
- **Engineering patterns used across builds:** Queue-based state machines · Circuit breaker · Exponential backoff · Checkpoint/resume recovery · Cache-first · Idempotent event processing · Independent quality gates · Confidence scoring at every AI stage

**Stack:** Applies to all work — Claude Code, TypeScript, Python, Supabase, direct APIs.

**Outcome:** Durability of builds (no middleware to break), inspectability (structured prompts over trained models), recoverability (calibration architecture surfaces defects with file-line precision).

**Best used to prove:** Architectural judgment · API-direct discipline · AI-as-component framing · Pre-mortem / risk methodology · Scope discipline · Diagnostic-first consulting posture

---

# Hardcoded proof points (quick citation table)

| Claim | Number | Source |
|---|---|---|
| Enterprise SaaS sales experience | 7+ years | Skai, Conversion Logic, Crealytics |
| Building production AI infrastructure | 3+ years | Smoothed.io |
| Campaign launch time reduction | ~8 hours → ~3 minutes | SmartLead automation |
| Client acquisition cost reduction | ~90% | Multi-source pipeline |
| Mailboxes under management | 150+ | Outlook + Gmail via Smartlead |
| Trial Conversion Engine scale | ~10,300 LOC, 7 ICP cohorts | UpKeep |
| Trial pipeline cost per lead | < $0.04 | Trial Conversion Engine |
| Lead intelligence qualified rate | 36% Tier 1 (vs. 0.5–1% cold) | Thor Data |
| Reddit signal quality | 99% Tier 1 or 2 | Thor Data |
| Proprietary dataset built | 240,000+ retailers | Blingsting |
| Email discovery rate | 72%+ where websites exist | Blingsting |
| Name normalization cache | 274,000+ names, 95%+ hit rate | Blingsting |
| Day.ai CRM integration time | 3 days (OAuth + MCP + sync) | Day.ai |
| Day.ai managed scale | 8,233 brands, 386 contacts | Day.ai |
| Ad spend forensically audited | $81,775 | FedRAMP/GovCon |
| CPA degradation diagnosed | $160 → $909 (5.7x) | FedRAMP/GovCon |
| GA4 conversion events | 0 across 32,940 sessions | FedRAMP/GovCon |
| Keyword corpus | 551 keywords | FedRAMP/GovCon |
| Corpus enrichment pipeline | 998 LOC, 27 passing tests | FedRAMP/GovCon |
| Daily signals captured (live) | ~1,100 | Signals pipeline |
| API toolkit efficiency vs. MCP | ~180x | Personal dev tooling |
| Jobs tracked daily | 118+ across 42 companies | This repo |
| HBO Max custom integration | $800K ACV | Skai |

---

# TBD items — confirm with Brent

Items referenced but not numerically grounded in source material. Flag for confirmation before citing externally.

1. **Autonomous Outbound Infrastructure** — Total clients live on this infrastructure, aggregate emails sent per month, aggregate meetings booked / pipeline sourced.
2. **Signals Pipeline Generator** — Number of clients currently running this scaffold (beyond Thor Data).
3. **Klaviyo + Shopify Revenue Attribution** — Client name, revenue attributed, period covered.
4. **Trial Conversion Engine** — Final production deployment status with UpKeep (was speculative build — did it get adopted, and if so what were the live-deployment numbers?).
5. **Thor Data Lead Intelligence** — Current live metrics vs. first-cycle metrics (910 / 332 / 36% were first-cycle; what's the sustained rate?).
6. **Blingsting** — Pipeline outcomes downstream of the 240K dataset — actual retailers contacted, meetings booked, revenue recovered vs. Faire baseline.
7. **FedRAMP / GovCon client name** — Is this citeable externally or does it need to stay generic?
8. **Day.ai / Close / Twenty / QuickBooks** — Which of these deployments are under NDA vs. citeable by name?
9. **Delicious Impressions** (prior founder role, 2014–2017) — Currently on CV at "$2M revenue by year 2, 7-person team" — confirm still the phrasing Brent wants to lead with.
10. **Wagner Bartosch / Sugarmade** — CV references "20% market share (1,200 stores), 57% COGS reduction, 52% profit improvement" — confirm these are externally citeable.

---

# Update discipline

When a new evaluation, application, or engagement surfaces a proof point worth citing, append a new entry using the same schema. Keep raw numbers. Keep the source. Voice rules at the top are the standing reference. Don't genericize — specificity is the differentiator.
