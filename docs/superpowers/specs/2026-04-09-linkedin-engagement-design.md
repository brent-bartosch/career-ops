# LinkedIn Engagement System — Design Spec

**Date:** 2026-04-09
**Status:** Draft
**Location:** `~/Development/Smoothed/career/linkedin-engagement/` (new repo, sibling to career-ops)

---

## 1. Purpose

A LinkedIn engagement pipeline that ingests AI engineering news (starting with Latent Space), extracts commentable topics, discovers substantive LinkedIn posts via Bright Data, and drafts voice-matched comments and weekly articles — all optimized for career positioning first, authentic thought leadership second.

### Goals

- **Primary:** Build visible credibility with hiring managers and recruiters through substantive LinkedIn engagement
- **Secondary:** Genuine contribution to AI engineering discourse
- **Non-goal:** Autonomous posting. The user always reviews and posts manually.

### Success Criteria

- 3-5 drafted comments per week, ready to review and post
- 1 short article draft per week (300-500 words)
- Drafts sound like the user, not like AI — validated by the user over the first 2-3 weeks
- Total manual effort per session: ~10 minutes (choose topic, review drafts, post)

---

## 2. System Architecture

```
~/Development/Smoothed/career/
├── career-ops/                  # existing, untouched
└── linkedin-engagement/         # new project
    ├── CLAUDE.md                # project instructions + voice guide
    ├── .env                     # Bright Data API key, Gmail OAuth tokens
    ├── config/
    │   ├── profile.yml          # identity, target roles, companies
    │   ├── voice.yml            # writing style rules + anti-patterns
    │   └── sources.yml          # Latent Space + future sources
    ├── samples/
    │   └── writing-samples.md   # real comments/posts for voice calibration
    ├── inbox/                   # forwarded email digests land here
    ├── digests/                 # parsed + analyzed digests (archived)
    ├── drafts/                  # generated comments + articles awaiting review
    ├── posted/                  # approved drafts (engagement history + voice training data)
    ├── lib/
    │   ├── ingest.mjs           # Gmail API polling, email parsing, hyperlink extraction
    │   ├── analyze.mjs          # topic extraction + ranking from digest
    │   ├── discover.mjs         # Bright Data LinkedIn post search + quality filter
    │   └── voice.mjs            # voice calibration utilities
    ├── templates/
    │   ├── comment.md           # comment drafting prompt template
    │   └── article.md           # article drafting prompt template
    └── package.json
```

Design principle: every stage produces a file. The pipeline is inspectable, debuggable, and any stage can be re-run independently.

---

## 3. Pipeline Flow

### Shared Stages (both comment and article pipelines)

#### Stage 1: Ingest

**Trigger:** Gmail API poll detects new Latent Space email (matched by sender/label).

**Process:**
1. Download email body via Gmail API (Google OAuth)
2. Strip email chrome (headers, footers, unsubscribe links)
3. Convert to clean markdown
4. Extract all hyperlinks, group by topic cluster
5. Follow top 10 links: pull title, first ~500 words, key claims from each
6. Output: `digests/YYYY-MM-DD-digest.md` — structured topic clusters with summaries and deep-linked source material

**Authentication:** Google OAuth token for Gmail API. Stored in `.env`.

#### Stage 2: Analyze + Present Topics

**Process (Claude Code skill invocation — user runs a command, Claude analyzes conversationally):**
1. Claude reads the parsed digest
2. Scores topics by:
   - Recency and momentum
   - Controversy or correction potential (is there something to push back on?)
   - User's domain relevance (informed by `config/profile.yml`)
   - Practical workflow impact (practitioners care about this)
3. Presents **4 topic picks** to the user, each with:
   - One-line summary of what happened
   - Why it's commentable (what's the angle?)
   - Relevance to career positioning
4. User chooses one or more topics

### Comment Pipeline

#### Stage 3: Discover (Bright Data)

**Process:**
1. Extract 3-5 search keywords from chosen topic
2. Hit Bright Data LinkedIn posts API with keywords + "past 7 days" time filter
3. Receive ~20-50 candidate posts (structured: content, author, engagement counts, timestamps)
4. Run quality + visibility scoring on each post (see Section 5)
5. Rank by combined score
6. Present **top 3-5 posts** to user with: author name/headline, post excerpt, engagement stats, quality score, and commentable angle

**Fallback:** If Bright Data returns thin results (niche topic, low volume), user pastes a LinkedIn post URL directly and pipeline skips to Stage 4.

**Cost:** ~50 posts/week scanned = ~200/month = well under $1/month on pay-as-you-go ($1.50/1K records).

#### Stage 4: Draft Comments

**Process:**
1. For each candidate post, Claude drafts a comment using:
   - Voice profile (`config/voice.yml` + `samples/writing-samples.md`)
   - Source material from Stage 1 (adding depth the poster doesn't have)
   - The poster's specific claims (direct response, not generic)
2. Each draft saved to `drafts/YYYY-MM-DD-comment-{n}.md`

#### Stage 5: Review + Post

1. User reads drafts, edits as needed
2. User posts manually on LinkedIn
3. Approved drafts moved to `posted/` — becomes voice training data over time

### Article Pipeline

#### Stage 6: Draft Article

1. From the chosen topic, Claude drafts a 300-500 word short take
2. Structure: hook, what happened, why it matters for practitioners, user's take from experience
3. Uses same voice profile
4. Draft saved to `drafts/YYYY-MM-DD-article.md`
5. User reviews, edits, posts

---

## 4. Voice Calibration

### voice.yml — Hard Constraints

```yaml
tone:
  - Lead with the correction, addition, or insight — never with praise
  - Practitioner voice: speak from doing, not theorizing
  - Technical specificity: name the tool, version, flag, config
  - One compliment max, only when genuinely earned
  - 60-80 words for comments, 300-500 for articles

avoid:
  - Emoji
  - "Great post!", "Love this!", "This is so important"
  - Rhetorical questions ("But have you considered...?")
  - Hedge words ("I think maybe", "it seems like")
  - Listicle energy ("Here are 3 reasons...")
  - Signing off with a CTA ("What do you think?", "Agree?")
  - Generic agreement that adds nothing

patterns:
  - Correct or extend a specific claim with evidence
  - Share a gotcha or non-obvious detail from real usage
  - Acknowledge what they got right in one short clause, then pivot to the addition
  - End when the point is made — no summary, no wrap-up
```

### writing-samples.md — Few-Shot Examples

Seeded with the user's existing comment (LSP/Claude Code critique). Over time, approved drafts from `posted/` are periodically pulled back into `writing-samples.md` as reference examples. The voice sharpens with use.

### Draft-Time Application

The comment/article prompt templates reference both `voice.yml` and `writing-samples.md`. Claude receives the voice rules as hard constraints, the writing samples as few-shot examples, and the instruction: "if this draft could have been written by anyone, rewrite it."

No external style-matching frameworks for v1. Real writing samples are a better signal. Revisit if drafts don't converge on the user's voice within 2-3 weeks.

---

## 5. Scoring System

Content quality is the primary rank. Timing and comment saturation are tiebreaker bonuses — they never penalize a good post. Follower count is displayed for context but does not affect the score.

### Content Quality (primary, 0-11 range)

| Signal | Score |
|--------|-------|
| Specific technical claims (versions, benchmarks, configs) | +3 |
| Shows own work ("I built/tried/deployed X") | +3 |
| Links to source material (repos, papers, docs) | +2 |
| Nuanced take (tradeoffs, caveats, conditions) | +2 |
| Commentable angle (something to add or correct) | +1 |

### Disqualifiers (auto-skip)

| Signal | Action |
|--------|--------|
| Engagement bait phrases ("Comment X for...") | Skip |
| No substance behind claim | Skip |
| Heavy self-promo (every post links their product/course) | Skip |
| Platitude density ("AI is changing everything") | Skip |

### Timing Bonus (tiebreaker, never negative)

| Post Age | Bonus |
|----------|-------|
| Under 2 hours | +3 |
| 2-6 hours | +2 |
| 6-12 hours | +1 |
| Over 12 hours | 0 |

### Saturation Bonus (tiebreaker, never negative)

| Comment Count | Bonus |
|---------------|-------|
| Under 5 | +2 |
| 5-15 | +1 |
| Over 15 | 0 |

### Minimum Threshold

Combined score (quality + bonuses) must be >= 6 to surface as a candidate.

Author follower count is captured in the output for user context but has zero weight in ranking.

---

## 6. Output Formats

### Comment Draft (`drafts/YYYY-MM-DD-comment-{n}.md`)

```markdown
# Comment Draft — {date}

## Topic: {topic summary}

## Target Post
**Author:** {name}
**Headline:** {their LinkedIn headline}
**Followers:** {count}
**Post Age:** {hours since posted}
**Engagement:** {likes} likes, {comments} comments
**Quality Score:** {score}
**Post excerpt:**
> {relevant excerpt from their post}

## Source Material
- {digest source + key facts that inform the comment}

## Angle
{One line: what you're correcting, extending, or adding}

## Draft Comment
{Voice-matched comment, 60-80 words}
```

### Article Draft (`drafts/YYYY-MM-DD-article.md`)

```markdown
# Article Draft — {date}

## Topic: {topic}
## Hook: {one-line opener}
## Word count target: 300-500

---

{Draft body}

---

## Sources
- {linked throughout}
```

### Posted Archive (`posted/`)

Same format as drafts with an added `## Posted: {timestamp}` and the final text as actually submitted. Serves as engagement history and voice training data.

---

## 7. Email Ingestion Details

### Gmail Setup

1. Gmail filter: match Latent Space / Substack sender, auto-label (e.g., `latent-space`)
2. Google OAuth token for Gmail API access
3. `ingest.mjs` polls for emails with that label, downloads body, saves to `inbox/`

### Ingestion Processing

```
Raw email (HTML)
    ↓
Strip email chrome (headers, footers, unsubscribe)
    ↓
Convert to clean markdown
    ↓
Extract all hyperlinks → group by topic cluster
    ↓
Follow top 10 links (configurable)
    ↓
For each link: title, first ~500 words, key claims
    ↓
Output: digests/YYYY-MM-DD-digest.md
```

### Frequency

Latent Space free tier sends a few times per week. The system processes whatever lands in `inbox/`. No fixed schedule — process on arrival.

### Scheduling (v1)

Manual trigger: `npm run ingest` to poll and process. Can be upgraded to cron or Claude Code scheduled agent later.

---

## 8. Configuration

### config/profile.yml

```yaml
candidate:
  name: "Brent Bartosch"
  linkedin: "{URL}"
  target_roles: []           # populated from career-ops or manually
  target_companies: []       # optional: prioritize posts from people at these companies

engagement:
  comments_per_week: 3-5
  articles_per_week: 1
  max_comment_words: 80
  max_article_words: 500
```

### config/sources.yml

```yaml
sources:
  - name: "Latent Space"
    type: "email"
    sender: "latent.space"
    label: "latent-space"
    follow_links: 10
    # Future sources can be added here (e.g., RSS feeds, other newsletters)
```

### .env

```
BRIGHTDATA_API_KEY=
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
```

---

## 9. Tech Stack

- **Runtime:** Node.js (ESM modules, .mjs files) — matches career-ops
- **Gmail:** Google APIs Node.js client (`googleapis`)
- **LinkedIn Discovery:** Bright Data REST API (`axios`)
- **HTML Parsing:** Cheerio (for email + hyperlink content extraction)
- **Config:** YAML (`js-yaml`)
- **Data:** Markdown files throughout, no database
- **AI Drafting:** Claude Code skill — invoked conversationally or via `claude -p`

---

## 10. Automation Ramp

### v1 (now)
- Manual `npm run ingest` to poll Gmail
- Claude presents 4 topics, user chooses
- Bright Data discovery is automated
- Claude drafts comments + article
- User reviews and posts manually

### v2 (once cadence is established)
- Scheduled ingest (cron or Claude Code scheduled agent)
- Topic picks delivered proactively (notification or summary file)
- User can approve topics async

### v3 (future, if desired)
- Auto-select topics based on learned preferences
- LinkedIn posting via browser automation (Playwright)
- Voice model refined from posted history

---

## 11. Constraints and Non-Goals

- **Never auto-post.** User always reviews and submits manually.
- **No LinkedIn scraping.** All discovery goes through Bright Data's API.
- **No fake engagement.** No like-bots, no engagement pods, no reciprocal comment schemes.
- **Career-ops stays untouched.** This is a sibling project, not a modification.
- **v1 is CLI-first.** No web UI, no dashboard. Markdown files and terminal.
