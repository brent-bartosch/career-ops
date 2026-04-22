# Article Digest — Brent Bartosch Proof Points & Voice

Compact reference for tailoring applications, outbound, and decision-maker emails. Pull from this instead of re-reading full case studies. When you need deeper detail, the linked sources in `evaluation/corpus-map.yml` point to full content at `../GTM_Services_Site/src/content/`.

---

## Voice — how Brent actually writes

This section governs any text generated "as Brent." Not optional.

### Tonal rules
- **Leads with the point, not pleasantries.** Never opens with "I'm excited to," "thrilled," "passionate," "reaching out because." Starts mid-thought or with the observation.
- **Practitioner authority.** Speaks from doing, not theorizing. Names specific tools, versions, configs, and numbers. "Here's what I built / what broke / what I fixed" — not "here's what you should consider."
- **Corrections before compliments.** If there is a compliment at all (one max, earned), it's usually a pivot: "Your point about X is right — here's what's also true."
- **No LinkedIn-bro energy.** No emoji, no "Great post!", no "Drop a 🚀 below," no trailing CTAs, no "Agreed!", no motivational closers.
- **Technical specificity is the tell.** "8-stage pipeline, 5 deterministic stages, 3 AI, 1 hybrid" beats "sophisticated pipeline." Numbers, tools, and mechanism are the differentiator.
- **Ends when the point is made.** 60–80 words for LinkedIn comments. 2–4 short paragraphs for outbound. No padding.

### Signature framings (pull directly or paraphrase)

From the worldview essay ("Funnels, Not Features"):

- "The advantage isn't in which tools you picked. It's in whether there's real infrastructure between the strategy you already have and the place you're actually trying to get to."
- "The pipe between them leaks at every joint. Pipeline stalls. Attribution drifts. The right lead sits in the wrong queue. The dashboards all look like they're working."
- "I think about that chasm the way a growth operator does, because I was one — years in performance marketing where the job was to move CAC, LTV, and conversion, not to write tickets about it. I also write the code, because somewhere along the way I got tired of watching good ideas stall at 'we'd need engineering to build that.'"
- "Not as a religion. As the right tool for a specific ceiling."
- "The kind of work that doesn't photograph well but moves the number."
- "Measurement, attribution, and accountability are designed in from the start — not bolted on after the demo."

### Diagnostic framing (he starts here)
Most engagements start with an audit, not a build. The standard phrasing:

> "Most engagements don't start with 'build me something new.' They start with 'here's where we are, here's where we're trying to get to — help me figure out what's between them.'"

Three shapes the fix takes: **Audit → Optimize → Build.** He names the spectrum explicitly; he doesn't pitch "build" as the default.

### Positioning (when asked "what do you do")

- **Primary:** "GTM Systems Architect" / "GTM Engineer & AI Systems Architect"
- **Frame:** "I build bespoke go-to-market infrastructure — lead intelligence, pipeline automation, trial conversion engines, outbound systems — wired directly to APIs, with AI embedded as an engineering component."
- **Differentiator one-liner:** "I don't assemble no-code stacks — I build custom TypeScript and Python pipelines using Claude Code, Supabase, and direct API integrations."
- **Unfair edge:** 7+ years enterprise SaaS sales (Skai, Conversion Logic) + 3+ years building production AI infrastructure. Most GTM engineers are pure technicians; most sales operators can't ship code. He's accountable to CAC/LTV/ROAS because he carried those numbers himself.

### What he refuses (scope discipline is a value signal)

- Not "we can build you anything." Says explicitly when the problem doesn't need a build.
- Not "AI for everything." AI is embedded where it earns its place — deterministic scaffolding, confidence scoring, typed output validation, independent quality gates.
- Not middleware. "API-direct: systems wire to CRM, enrichment, and analytics APIs directly. No Zapier, no Make, no middleware."

---

## The Seven Systems — one-liners + proof anchors

These are the systems on the Smoothed site and in `corpus-map.yml`. Map JD requirements to these when tailoring.

### 1. Trial Conversion Engine
**One-liner:** Behavioral signal extraction, ICP scoring, routing, follow-up generation — turns a raw trial signup into a scored, routed, sales-ready opportunity before it's 90 seconds old.
**Mechanism:** 8-stage pipeline (5 deterministic, 3 AI-powered, 1 hybrid). Deterministic where decisions need to be auditable; AI where tasks require judgment. Routing is never left to the LLM.
**Proof points:**
- ~10,300 LOC for the full build
- 7 ICP cohorts distilled from 40+ real customer stories + 1,500+ scraped pages of client web presence
- Full pipeline cost: under $0.04 per lead
- Independent quality gate — different LLM instance, different prompt, 6 numeric grading criteria
- First calibration run: 12 sample leads, 8 routed correctly, 4 misrouted — three root causes diagnosed, each scoped to a specific file and line
**Client context:** $30M B2B SaaS (UpKeep/CMMS), 4,000+ customers, Y Combinator 2017, profitable 6 years. Customers include Unilever, Shell, JetBlue, Marriott, Chick-fil-A. They'd already internally flagged trial conversion as "a significant opportunity area."

### 2. Lead Intelligence Layer
**One-liner:** Signal capture, intent classification, enrichment, and qualification — built on the platforms where buyers actually talk.
**Mechanism:** 6-stage pipeline. Four parallel scrapers (Reddit, GitHub, HackerNews, Twitter), Claude 3 Haiku classifier into 4 tiers, deterministic qualification scoring.
**Proof points:**
- **910 buying signals** captured in first cycle; **332 Tier 1 prospects → 36% quality rate** vs. 0.5–1% from cold list outbound
- By source: GitHub 532 (118 Tier 1), Reddit 135 (133 Tier 1), Twitter 100 (49 Tier 1), HackerNews 143 (32 Tier 1)
- **Reddit signals classified 99% Tier 1 or 2** — highest quality-to-volume ratio
- 200+ keyword taxonomy (product × cohort × intent)
- Classification cost: $0.001/signal; full pipeline <$0.05 per qualified lead
- 4-hour cycles via pg_cron; Slack webhook for Tier 1
**Client context:** Thor Data (proxy/SERP/scraping infrastructure). Entering US market against Bright Data and Oxylabs. **Self-demonstrating architecture** — every scraper runs on Thor Data's own APIs (Web Unlocker, SERP API, Scraper API), so the GTM system is also the flagship case study.

### 3. Outbound Intelligence System
**One-liner:** Proprietary data sourcing, multi-channel enrichment, and personalized outbound for markets the standard vendors don't index.
**Mechanism:** Four phases — Source → Enrich → Score & Segment → Execute. Independent enrichment channels (website, social, SERP, geo) with cross-validation.
**Proof points:**
- **240,000+ independent retailers** identified across 7 target categories — **20x Blingsting's existing customer base** (12K)
- **72%+ email discovery rate** where websites existed (direct scraping, not vendor lookups)
- **150+ non-target categories filtered** before outbound sent
- AI name normalization: **274,000+ cached names, 95%+ cache hit rate** → "Riverside Boutique," not "Riverside Boutique LLC DBA Riverside Gifts Inc."
- Pattern later deployed against marketplace data: **14,000 wholesale brands** classified by quality tier using AI text + visual analysis
**Client context:** Blingsting — $7M consumer safety brand. Lost Faire overnight (primary marketplace cut them off), losing access to 12,000 buyer relationships simultaneously. No CRM, no outbound, no owned data. Rebuilt pipeline from zero; ended up structurally better-positioned than before the crisis.

### 4. CRM Orchestration Layer
**One-liner:** Direct-API automation for the last 20% of routing, lifecycle, and data quality that workflow builders can't express.
**Mechanism:** 4 components — Intake gate, Enrichment layer, Lifecycle engine, Action layer. Sits alongside HubSpot/Salesforce, not a replacement. Every lifecycle transition logged with the rule that triggered it + data that satisfied it.
**Key framing:** "Code for the cases the UI can't express." Most CRM automation belongs in workflow builders. This layer is reserved for fuzzy dedupe across company variations, enrichment-dependent routing, rule-based lifecycle transitions with a queryable audit trail.
**Proof points from shipped integrations:**
- **Close CRM (production):** SmartLead webhook → Supabase enrichment → Close Lead + Opportunity + Task + Note. 11 custom fields. 8 webhook event types handled.
- **Day.ai (production):** Built in **3 days**. OAuth 2.0 + MCP (Model Context Protocol) integration with 19 AI-native tools. 14 custom properties. Currently manages **8,233 brands, 386 contacts**.
- **Twenty CRM (designed):** Bi-directional sync spec complete, ready for implementation.
- **QuickBooks Desktop (production):** SOAP → REST via Conductor API, deployed on Supabase Edge Functions (Deno/TypeScript). Multi-tier exclusion logic. 7-day batch processing. Atomic state updates with audit trail.

### 5. Spend Attribution Engine
**One-liner:** Multi-channel attribution, anomaly detection, budget reallocation — built against your analytics APIs.
**Mechanism:** Forensic 4-stage methodology — platform audit (each channel independently) → cross-platform synthesis → channel quality scoring (engagement × volume, not raw traffic) → ongoing dashboard.
**Key framing:** "Channel quality over channel volume. 10,000 sessions at 20% engagement is worse than 3,000 at 60%."
**Proof points (FedRAMP AI platform engagement):**
- **$81,775 in Google Ads over 17 months** analyzed forensically
- CPA degraded **$160 → $909 (5.7x)** after an agency restructure that logged 217 changes in a single day
- **"Compliance" set as account-level negative keyword** — blocking core ICP searches entirely (5-min fix, immediate unblock)
- **Zero FedRAMP / NIST / DFARS / CUI keywords** in paid search despite being the company's strongest differentiator
- **Zero conversion events in GA4** across 32,940 sessions — flying blind
- 19 competitor comparison pages with zero body content, $53K conquest ads sending traffic to them
- **Organic outperformed paid 2.5x at $0 cost** — the story hidden in the data

### 6. Content Engine ("The War Machine")
**One-liner:** Keyword architecture, programmatic page generation, measurement — content production on the market's timeline, not the writer's queue.
**Mechanism:** 5 layers — Intelligence grid (5 monitoring agents) → Signal classification (THREAT / OPPORTUNITY / CONTENT_GAP / TREND) → Content pipeline (Analyst → Writer → Editor → Publisher, LangGraph-orchestrated) → Distribution (CMS, Ads, Social, Email) → Measurement loop.
**Key framing:** "Intelligence-driven, not calendar-driven. Content gets created because something happened in the market, not because it's Tuesday."
**Proof points:**
- **551-keyword corpus** built from SEMrush intelligence, organized by intent clusters
- **101 compliance-specific keywords** identified where client had zero presence (e.g., "fedramp marketplace" 8,100/mo, "nist 800-171" 4,400/mo, "cmmc certification" 2,900/mo)
- Programmatic pages shipped — competitor comparisons replacing 19 empty shells
- **Corpus enrichment pipeline: 998 lines, 27 passing tests** connecting Google Ads keyword data to backend knowledge bases
- Editor runs 5 verification gates: factual accuracy, brand voice, legal review, SEO quality, differentiation

### 7. Pipeline Conversion Engine
**One-liner:** Still being documented. Sibling framing to Trial Conversion Engine for pipeline-stage conversion (MQL → SQL → Opportunity).

---

## The Four Case Studies (compressed)

### Mid-Market SaaS Trial Conversion (UpKeep)
- **Context:** $30M B2B SaaS, 4,000+ customers in asset-heavy industries. Product good, GTM motion less so. $40–50K/mo on Google Ads, mostly branded. Trial conversion known internally as a "significant opportunity area."
- **Problem:** Trial funnel had no way to distinguish high-ICP prospects from tire-kickers. 7 distinct industry cohorts getting treated identically. Silent attrition on trial expiration.
- **Build:** Trial Conversion Engine — 8-stage pipeline, 10,300 LOC, 7 ICP cohorts, 3-view dashboard (Pipeline / Dossier / Observability), sub-$0.04 per lead.
- **Self-ran methodology:** Smoothed identified the problem, built the full system, and proved the approach — speculative build as proof of capability. "When we see a problem worth engineering against, we build it."

### Thor Data Lead Intelligence
- **Context:** Web infrastructure company (proxy, SERP, scraping APIs). Entering US against Bright Data and Oxylabs. The incumbent playbook (buy lists, run sequences) would put them in the same inbox as every other proxy vendor.
- **Problem:** Their buyers aren't in ZoomInfo. They're on Reddit asking which scraping tool to use, on GitHub filing issues, on HackerNews comparing providers, on Twitter complaining about outages. Intent data vendors (Bombora, G2) wouldn't help — same signals every competitor gets, delayed, account-level only.
- **Build:** Lead Intelligence Layer running on Thor Data's own APIs. 910 signals, 332 Tier 1 (36% rate), Reddit at 99% quality, pipeline cost <$0.05/lead.
- **Scope discipline:** Month 1 was 100% manual review. No automated outbound. No CRM sync. No ML classification. Structured Claude Haiku prompts instead — inspectable, tunable, no retraining.

### Blingsting Outbound Pipeline
- **Context:** $7M consumer safety brand. 12,000 retail customers. Faire was primary marketplace. Faire cut them off overnight → lost channel + customer relationship data simultaneously.
- **Problem:** Three compounding failures — no owned data, no discovery channel, no outbound infrastructure. Dependency-on-someone-else's-infrastructure problem crystallized.
- **Build:** Outbound Intelligence System. 240K retailers across 7 categories (20x existing customer base), 72%+ email discovery, 150+ non-target filters, 274K normalized-name cache.
- **Headline framing:** "Faire didn't fail Blingsting. Blingsting's pipeline architecture failed Blingsting." Ended up structurally better off than before the crisis.

### Compliance Platform Content Engine (FedRAMP / GovCon)
- **Context:** FedRAMP High-authorized AI platform (not Moderate, not inherited — independent High). Active defense contractor deployments. Competitors 6–12 months from equivalent authorization. Strongest moat in the category had **zero market visibility.**
- **Problem:** $81K in Google Ads spent over 17 months, CPA degraded 5.7x, "compliance" set as account-level negative keyword, zero FedRAMP/NIST/DFARS keywords targeted, zero GA4 conversion events across 32,940 sessions, 19 competitor comparison pages with empty bodies.
- **Build:** 30-day engagement. 5 independent platform audits + cross-platform synthesis. 551-keyword corpus. Page opportunity matrix. Programmatic pages shipped. Measurement foundation fixed. War Machine architecture specified for scaling.
- **Headline outcome:** Organic outperformed paid 2.5x at $0 cost — the story was sitting in the data, just not connected.

---

## Prior Experience (the revenue side — matters for "been there" credibility)

- **Skai (fka Kenshoo), Sales Director (2020–2022):** Enterprise predictive marketing intel. HBO Max — $800K ACV custom API integration. PII/CCPA/GDPR workflows. Paid-search operations at scale across client portfolio.
- **Conversion Logic (acquired by VideoAmp), Enterprise AE (2017–2020):** Multi-touch attribution / MMM. Led application integration projects with Data Science & Engineering; set integration standards for ingestion workflows supporting attribution modeling.
- **Crealytics, Enterprise AE (2022):** Retail media SSP, predictive marketing intel. SOC 2 compliance workflows.
- **Delicious Impressions, Founder (2014–2017):** Alternative out-of-home media. $2M revenue by year 2. Managed 7-person domestic/global sales team.
- **Wagner Bartosch (acquired by Sugarmade), Director of Strategic Partnerships (2010–2014):** CPG eCommerce. 20% market share (1,200 stores). Reduced COGS 57%, improved profit 52%.

---

## Ancillary / Integration Portfolio (proof of breadth)

- **Klaviyo + Shopify revenue attribution:** Multi-touch tracking, profile search via Klaviyo API v2023-12-15, UTM + campaign extraction, days-to-conversion, Claude-assisted matching for ambiguous cases. High/Medium/Low confidence scoring.
- **SmartLead API wrapper:** 34+ production methods. Campaign management, lead management, account health monitoring, 8 webhook event types, custom reply system, in-thread replies at scale with rate limiting.
- **API Toolkit (personal):** Lightweight Python framework, lazy-loaded service modules (~500 tokens each). **~180x more context-efficient** than MCP servers for equivalent services. Covers Supabase, SmartLead, BrightData, Metabase, Render, Context7.
- **Automated Job Discovery Platform (personal):** Multi-source scraping (Greenhouse API, Lever HTML, Google Search), 3-tier keyword classification, GitHub Actions daily automation, Google Sheets delivery. **42 companies monitored, 118+ jobs tracked daily.** (This repo.)

---

## Hardcoded proof points (for quick citation)

| Claim | Number | Source |
|---|---|---|
| Enterprise SaaS sales experience | 7+ years | Skai, Conversion Logic, Crealytics |
| Building production AI infrastructure | 3+ years | Smoothed.io |
| Campaign launch time reduction | ~8 hours → ~3 minutes | SmartLead automation |
| Client acquisition cost reduction | ~90% | Multi-source pipeline |
| Mailboxes under management | 150+ | Outlook + Gmail via Smartlead API |
| Largest trial conversion build | ~10,300 LOC, 7 ICP cohorts | UpKeep / mid-market SaaS |
| Trial pipeline cost per lead | < $0.04 | Trial Conversion Engine |
| Lead intelligence qualified rate | 36% Tier 1 (vs. 0.5–1% cold) | Thor Data |
| Reddit signal quality | 99% Tier 1 or 2 | Thor Data |
| Proprietary dataset built | 240,000+ retailers | Blingsting |
| Email discovery rate | 72%+ where websites exist | Blingsting |
| Name normalization cache | 274,000+ names, 95%+ hit rate | Blingsting |
| Day.ai CRM integration time | 3 days (OAuth + MCP + sync) | Day.ai |
| Day.ai managed scale | 8,233 brands, 386 contacts | Day.ai |
| Ad spend forensically audited | $81,775 | FedRAMP/GovCon platform |
| Keyword corpus | 551 keywords | FedRAMP/GovCon platform |
| Corpus enrichment pipeline | 998 lines, 27 passing tests | FedRAMP/GovCon platform |
| Daily signals captured (live) | ~1,100 | Signals pipeline |
| API toolkit efficiency vs. MCP | ~180x | Personal dev tooling |
| HBO Max custom integration | $800K ACV | Skai |

---

## Technical stack (for JD keyword alignment)

**Languages:** JavaScript/Node.js · TypeScript · Python · SQL (advanced PostgreSQL)
**Runtime/Infra:** Claude Code · Supabase (Postgres + Edge Functions / Deno) · BigQuery · Vercel · Render · GitHub Actions · AWS (Cloud Practitioner cert)
**GTM Stack:** Smartlead · Clay · Apollo · Outreach · Lavender · Unify · CommonRoom
**CRM:** Close CRM · Day.ai · Twenty · Salesforce · HubSpot · Pipedrive · QuickBooks Desktop (via Conductor)
**Analytics:** GA4 · Google Search Console · Google Ads · Looker Studio · Metabase
**E-commerce:** Shopify · Klaviyo · Faire
**Scraping/Data:** BrightData · Serper · Playwright · Cheerio
**AI/LLM:** Claude API (Anthropic) · OpenRouter · LangGraph · prompt engineering · MCP (Model Context Protocol)
**Protocols:** OAuth 2.0 · REST · Webhooks · SOAP-to-REST · pg_cron
**Engineering patterns:** Queue-based state machines · Circuit breaker · Exponential backoff · Checkpoint/resume · Cache-first · Idempotent event processing · Independent quality gates · Confidence scoring at every AI stage
**Compliance exposure:** SOC 2 · GDPR · CCPA · FedRAMP (GTM-side) · PII handling
**Certifications:** AWS Cloud Practitioner (2023) · MEDDPICC Masterclass (2023)

---

## Role-fit angle library (use to pick what to lead with)

| Target role | Lead with |
|---|---|
| **Head of Growth Engineering** | Full-stack system ownership, cost consciousness, marketing tool integration. Worldview essay. Trial Conversion Engine. Spend Attribution (FedRAMP). |
| **GTM Engineer / Solutions Engineer** | Multi-platform integration (scraping → email → CRM). API wrapper breadth. CRM orchestration. Day.ai 3-day build. |
| **Growth Engineer** | Scale of processing, resilience patterns, LLM-for-personalization, queue-based state machines. Thor Data signal pipeline. |
| **Marketing Engineer / MOps** | Cold email deliverability (150+ mailboxes), CRM integration, campaign analytics, revenue attribution. Klaviyo+Shopify. |
| **Revenue Operations** | CRM implementations (Close, Day.ai, Twenty), lead routing, webhook orchestration, data normalization, CRM Orchestration Layer. |
| **Head of Applied AI / AI Engineer (GTM-adjacent)** | Multi-agent orchestration with guardrails, independent quality gates, confidence scoring, pre-mortem methodology, LangGraph. War Machine. |
| **Paid Media / Performance Marketing (senior)** | $81K forensic audit, CPA degradation diagnosis, ICP keyword corpus, channel quality scoring methodology, Looker Studio dashboard. |

---

## Interview / pitch story bank (ready-to-use STAR seeds)

**"Tell me about yourself" (compact)**
Enterprise SaaS AE for 7+ years at Skai and Conversion Logic — carried quota, owned HBO Max's $800K ACV integration, lived in attribution and retail media. Started Smoothed in late 2022 to build the systems I kept watching stall at "we'd need engineering for that." Three years in now, running a production stack in TypeScript and Python — Trial Conversion Engine at 10,300 LOC, signal-driven lead intelligence capturing 900+ buying signals per cycle at 36% Tier 1 rate, 150+ mailbox outbound infrastructure. I build bespoke, not no-code.

**"Most impactful project"** → FedRAMP/GovCon engagement. $81K forensically audited, 217-change agency restructure diagnosed, 551-keyword corpus built, "compliance" negative keyword removed as a 5-minute fix, organic-vs-paid 2.5x advantage surfaced. 30-day engagement, measurable unblock.

**"Conflict / judgment call"** → Thor Data scope discipline. Month 1 deliberately manual review, no CRM sync, no ML classification. Pushed back on pressure to automate before calibration was proven. Structured prompts over a trained model so the system stayed inspectable. Shipped classification accuracy before routing logic.

**"Failure / what went wrong"** → Trial Conversion Engine first calibration: 12 sample leads, 8 routed correctly, 4 misrouted. Three independent root causes (hospitality cohort gap, churned-behavior threshold too restrictive, Tier 2 engagement sub-rules missing). Each issue scoped to a specific file and line number. The architecture made this recoverable. Real systems need calibration; architecture is designed for it.

**"Why GTM engineering / what's your thesis"** → "Funnels, not features." The advantage isn't the tools you picked, it's the infrastructure between the strategy you have and the place you're trying to get to. Most GTM teams have the important things figured out — ICP, goal, strategy. The chasm is where the pipes leak. I was a growth operator (accountable to CAC, LTV, conversion) and I write the code. That combination is rare, and it's the whole point of how I engage.

---

## Outbound / decision-maker email patterns (templates calibrated to voice)

### Pattern A — Cold outbound to a hiring manager (VP Growth / CMO / Head of RevOps)

Opening hooks (pick one, never stack):

- "Saw your [team / company / post] is [specific thing]. I've shipped a system that solved [the specific problem underneath that]. Quick note on what it looked like."
- "[Company] ships [X]. If the motion underneath that looks like [specific thing I'd expect], there's a pattern from a build I did at [Client] that's probably worth 10 minutes of your time."
- "Read [specific article / job posting / change they made]. [One-sentence technical observation that demonstrates I actually read it]. Reason I'm writing —"

Body structure (3 short paragraphs max):
1. **Their problem, in their language** — one or two sentences. Do not summarize their business.
2. **A thing I built that solved it** — specific system, one or two hard numbers, no adjectives ("sophisticated," "robust," "comprehensive" all banned).
3. **What I'd want 15 minutes to ask / what I'd propose** — a question, not a CTA. "If you're open to it, I'd like to ask [specific thing] — 15 minutes, not a pitch."

Never close with "Looking forward to hearing from you" / "Happy to chat!" / anything inert. Close on a question or a forward-action statement.

### Pattern B — Application cover (one-pager, not a cover letter)

Per `generation/cover.md`, four sections:
1. **Their problem** (2–3 sentences, their language)
2. **A system I've built** (one paragraph + real metrics)
3. **What I'd build for you** (3–5 concrete first-90-days bullets — not consulting-speak)
4. **Direct CTA** — "I'd like to walk you through how this would work for [company]. Calendar link."

### Pattern C — LinkedIn comment (career positioning)

From the LinkedIn voice rules: 60–80 words, leads with correction/addition, names specific tools/numbers/configs, one compliment max only when earned as a pivot, no emoji, ends when the point is made.

Example pattern:
> "[Short correction or addition]. [One sentence of practitioner-specific technical detail — tool, version, number, mechanism]. [If warranted: one sentence pivot that adds something on top of the post's point.]"

### Pattern D — Warm intro / decision-maker referral email

- Subject: specific and functional. Never "Quick question" or "Introducing myself."
- Open with the referrer's name and the specific reason they suggested the connection. ("[Name] said you're thinking about [specific problem]" — not "[Name] thought we should connect.")
- One paragraph of relevant proof. One ask. Done.

---

## What to avoid when writing "as Brent"

Banned words/phrases (signal inauthenticity immediately):
- "Excited to," "thrilled," "passionate," "hoping to learn more"
- "Innovative," "cutting-edge," "best-in-class," "world-class," "revolutionary"
- "Leverage" (as a verb), "unlock," "synergy," "move the needle"
- "I'd love the opportunity to" / "I'd welcome the chance"
- "Drop a 🚀" / any emoji in professional outbound
- Any trailing motivational closer
- Rhetorical questions ("Sound familiar?", "Does this resonate?")

Banned patterns:
- Restating the company's own value proposition back to them
- Listing skills without demonstrating a system they produced
- Apologizing for the outreach ("Sorry for the cold email, but...")
- Asking for permission ("Would it be okay if I...")
- Meta-commentary ("I wanted to reach out because...")

---

## Update discipline

When a new evaluation, application, or engagement surfaces a proof point worth citing, append it to this file. Keep raw numbers; keep the source. Voice examples go in the voice section. Don't genericize — specificity is the differentiator.
