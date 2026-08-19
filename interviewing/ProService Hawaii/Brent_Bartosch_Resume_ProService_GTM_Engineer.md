# Brent Bartosch

**GTM Engineer | AI-Native Growth Systems | Demand Capture → Pipeline**

+1-310-743-3616 • brent.bartosch@gmail.com • Los Angeles, CA (available Hawaii Standard Time hours)
linkedin.com/in/brent-bartosch • github.com/brent-bartosch • smoothed.io

---

## Summary

GTM Engineer who treats growth as an engineering problem — 7+ years carrying enterprise SaaS revenue paired with hands-on build depth in Claude Code, Python, TypeScript, SQL, APIs, and LLM workflows. I reason about CAC/LTV and then write the code that moves it: capturing demand, defining sales-worthy intent, enriching and scoring leads, and delivering decision-ready context to reps within minutes. Strong bias to action — I ship a working prototype, watch real numbers move, and iterate. Every system I build is instrumented for cost, conversion, and revenue from the start.

---

## Selected GTM Systems Built

- **Signal-to-action for reps:** Built a multi-source buying-signal pipeline (Reddit, Hacker News, X, GitHub) capturing ~1,100 signals/day into Supabase Edge Functions / pg_cron — LLM tiering, deterministic qualification scoring, and human-in-the-loop Slack routing that turns raw data into sales-ready intelligence under a 4-hour SLA.

- **ICP scoring & lead routing:** Built an 8-stage trial-conversion pipeline taking a raw signup to a scored, routed, sales-ready opportunity in under 90 seconds — intake validation, AI enrichment, product-signal extraction, hybrid ICP scoring, deterministic routing (ICP tier × engagement → sales motion), and AI dossier generation so reps receive context, not just lead objects. End-to-end cost under $0.04/lead.

- **Multi-channel prospecting + deliverability:** Architected an autonomous outbound and enrichment engine across 150+ mailboxes via Smartlead API — list build, qualification, personalization, A/B testing (sequences/subject lines/send times), reply-detection routing, and CRM sync — backed by deliverability infrastructure (SPF/DKIM/DMARC, automated domain warmup, rotation, bounce handling, reputation monitoring) that keeps it landing in the inbox. Launch time ~8 hours → ~3 minutes; client CAC down ~90%.

- **ABM & paid media:** Restructured an enterprise outbound motion into an account-based approach (+157% reply rate); audited Google Ads for a FedRAMP-authorized AI platform, surfaced $81K in misdirected spend plus a critical negative keyword blocking core-ICP searches, and rebuilt campaign architecture from scratch — connecting ad-platform engagement to down-funnel pipeline.

- **AI search & organic demand:** Built "The War Machine," an autonomous programmatic-SEO and competitive-intelligence engine connecting Google Ads keyword signals to LLM-generated content — operationalizing how a brand surfaces across search and AI-generated answers, with a feedback loop between paid signals and organic content strategy.

- **CRM data quality & integration:** Shipped production CRM integrations modeling Leads, Opportunities, Tasks, and custom objects across Close (API + webhooks), Day.ai (OAuth 2.0 + MCP), Twenty (GraphQL), HubSpot, and QuickBooks — routing logic, deduplication, and enrichment, not form-building.

- **Architecture discipline:** Separated deterministic logic from LLM judgment for routing, scoring, and validation; confidence scoring and independent AI quality gates at every stage — legible, auditable systems built to scale on Zapier/n8n-style event-driven patterns and custom code alike.

---

## Professional Experience

### Founder & Principal GTM Engineer
**Smoothed.io** | Los Angeles, CA — *Dec 2022 – Present*
*GTM engineering consultancy building revenue automation across inbound intake, product-signal scoring, enrichment, outbound, CRM workflows, analytics, and AI-assisted personalization for B2B SaaS and e-commerce clients.*

- Built an 8-stage product-led trial-conversion engine: raw trial signup → AI enrichment → product-signal extraction → hybrid ICP scoring → deterministic routing → AI lead-dossier + first-touch email → independent AI quality gate; signup to scored, routed, sales-ready opportunity in under 90 seconds at under $0.04/lead.
- Built a multi-source buying-signal pipeline (Reddit, Hacker News, X, GitHub) capturing ~1,100 signals/day into Supabase Edge Functions / pg_cron with LLM tiering, deterministic qualification scoring, and Slack-based human-in-the-loop routing for Tier-1 intent (<4hr SLA).
- Architected an autonomous outbound and enrichment engine managing 150+ mailboxes via Smartlead API — full workflow from list build and qualification to personalization, sequencing, reply capture, and CRM handoff, with SPF/DKIM/DMARC, warmup, rotation, and bounce handling; launch time ~8 hours → ~3 minutes.
- Reduced client CAC by ~90% through multi-source data pipelines with automated qualification, enrichment, deduplication, routing, and CRM handoff across Close, Day.ai, Twenty, and HubSpot.
- Designed a queue-based state-machine architecture with concurrent processing, checkpoint/resume recovery, stall detection, exponential backoff, retries, and failure handling — crash-safe across all workflows.

### Contract GTM Engineer
**GovSignals** | Remote — *2026 – Present*
*FedRAMP-authorized AI platform for government contractors. Embedded as sole GTM engineer across analytics infrastructure, paid acquisition, and data pipelines.*

- Audited Google Ads and uncovered $81K in misdirected spend plus a critical negative keyword blocking core-ICP searches; rebuilt campaign architecture from scratch.
- Built a custom executive-facing revenue analytics app (Vercel) integrating GA4, Google Ads, and Google Search Console with a BigQuery layer correlating ad performance to pipeline for full-funnel decision-making.
- Built a corpus enrichment pipeline (998 lines, 27 passing tests) connecting keyword data to backend knowledge bases using embeddings, chunking strategy, retrieval evaluation, and quality gates.

### Vice President of Sales
**Crealytics** | Los Angeles, CA — *Jul 2022 – Feb 2023*
*Predictive marketing intelligence platform and retail media SSP. Laid off due to company restructuring.*

- Closed 2 full-service clients accounting for $1.45M total revenue in first 5 months.
- Restructured outbound motion into an ABM approach, improving reply rate by +157%; hired and onboarded a BDR.

### Sales Director
**Skai (fka Kenshoo)** | Los Angeles, CA — *Jun 2020 – Jul 2022*
*Enterprise predictive marketing intelligence platform.*

- Exceeded quota: 143% Year 1, 111% Year 2; managed full-cycle enterprise sales with complex buying committees.
- Closed the company's largest app sale: HBO Max at $800K ACV; partnered with solutions architects and TAMs on custom API integrations and technical discovery.
- Managed enterprise compliance workflows involving PII, CCPA, and GDPR, translating buyer requirements into technical and operational next steps.

### Enterprise Account Executive / Team Lead, SDRs
**Conversion Logic** | Los Angeles, CA — *Sep 2017 – Jun 2020*
*Multi-touch attribution and marketing data platform.*

- Closed 2 accounts in first 60 days ($390K ARR); contributed to a 31% increase in total ARR during tenure.
- Partnered with Marketing, Data Science, and Engineering on attribution modeling integrations, data-ingestion standards, and enterprise analytics requirements.
- Oversaw 2 SDRs and improved MQL generation by +67% in Year 1.

---

## Technical Stack

**Languages:** SQL, Python, TypeScript, Node.js
**GTM / RevOps:** HubSpot, Salesforce, Smartlead, Clay, Zapier / n8n (event-driven automation), Mixpanel, PostHog, Google Ads API, GA4, Google Search Console, SEMrush
**Data / Infra:** Supabase, PostgreSQL, pgvector, BigQuery, Railway, Vercel, Edge Functions, pg_cron, OAuth, REST & GraphQL APIs, webhooks, database triggers, rate limiting, error handling
**AI / Automation:** Claude Code, Claude API, OpenRouter, multi-step AI agent workflows, RAG pipelines, embeddings, deterministic scoring & routing, output validation, evals
**Deliverability & ABM:** SPF/DKIM/DMARC, domain warmup, bounce handling, audience targeting, suppression & match-rate workflows

---

## Education & Certifications

BA, Business Administration — Loyola Marymount University • AWS Certified Cloud Practitioner (2023) • MEDDPICC Masterclass Certification (2023)
