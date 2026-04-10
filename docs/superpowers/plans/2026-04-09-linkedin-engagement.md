# LinkedIn Engagement System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a LinkedIn engagement pipeline that ingests AI engineering newsletters, discovers substantive posts via Bright Data, and drafts voice-matched comments and articles for career positioning.

**Architecture:** New Node.js project at `~/Development/Smoothed/career/linkedin-engagement/`. Pipeline stages produce markdown files: ingest (Gmail → digest) → discover (Bright Data → scored candidates) → draft (Claude → comments/articles). Each stage is independent and re-runnable. AI analysis and drafting handled via Claude Code skill, not standalone scripts.

**Tech Stack:** Node.js (ESM/.mjs), googleapis (Gmail), axios (HTTP/Bright Data), cheerio (HTML parsing), js-yaml (config), dotenv (env vars), Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-04-09-linkedin-engagement-design.md` (in career-ops repo)

---

### Task 1: Project Scaffolding

**Files:**
- Create: `~/Development/Smoothed/career/linkedin-engagement/package.json`
- Create: `~/Development/Smoothed/career/linkedin-engagement/.gitignore`
- Create: `~/Development/Smoothed/career/linkedin-engagement/.env.example`
- Create: `~/Development/Smoothed/career/linkedin-engagement/config/profile.yml`
- Create: `~/Development/Smoothed/career/linkedin-engagement/config/voice.yml`
- Create: `~/Development/Smoothed/career/linkedin-engagement/config/sources.yml`
- Create: `~/Development/Smoothed/career/linkedin-engagement/samples/writing-samples.md`

- [ ] **Step 1: Create project directory and init git repo**

```bash
mkdir -p ~/Development/Smoothed/career/linkedin-engagement
cd ~/Development/Smoothed/career/linkedin-engagement
git init
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "linkedin-engagement",
  "version": "1.0.0",
  "type": "module",
  "description": "LinkedIn engagement pipeline: ingest news, discover posts, draft voice-matched comments",
  "scripts": {
    "ingest": "node lib/ingest.mjs",
    "discover": "node lib/discover.mjs",
    "test": "node --test lib/**/*.test.mjs"
  },
  "license": "MIT",
  "dependencies": {
    "axios": "^1.15.0",
    "cheerio": "^1.2.0",
    "dotenv": "^17.4.1",
    "googleapis": "^148.0.0",
    "js-yaml": "^4.1.1",
    "turndown": "^7.2.0"
  }
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
.env
inbox/
drafts/
posted/
```

- [ ] **Step 4: Create .env.example**

```
# Bright Data — get from https://brightdata.com/cp/setting
BRIGHTDATA_API_TOKEN=

# Gmail OAuth — see docs/gmail-setup.md for instructions
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
```

- [ ] **Step 5: Create config/profile.yml**

```yaml
candidate:
  name: "Brent Bartosch"
  linkedin: ""
  target_roles: []
  target_companies: []

engagement:
  comments_per_week: 5
  articles_per_week: 1
  max_comment_words: 80
  max_article_words: 500
```

- [ ] **Step 6: Create config/voice.yml**

```yaml
tone:
  - Lead with the correction, addition, or insight — never with praise
  - Practitioner voice: speak from doing, not theorizing
  - Technical specificity: name the tool, version, flag, config
  - One compliment max, only when genuinely earned

word_limits:
  comment: 80
  article: 500

avoid:
  phrases:
    - "Great post!"
    - "Love this!"
    - "This is so important"
    - "Here are 3 reasons"
    - "Most people don't know"
    - "What do you think?"
    - "Agree?"
    - "I think maybe"
    - "it seems like"
  patterns:
    - emoji
    - rhetorical_questions
    - hedge_words
    - listicle_format
    - trailing_cta
    - generic_agreement

writing_patterns:
  - Correct or extend a specific claim with evidence
  - Share a gotcha or non-obvious detail from real usage
  - Acknowledge what they got right in one short clause, then pivot to the addition
  - End when the point is made — no summary, no wrap-up
```

- [ ] **Step 7: Create config/sources.yml**

```yaml
sources:
  - name: "Latent Space"
    type: "email"
    sender: "hello@latent.space"
    label: "latent-space"
    follow_links: 10
```

- [ ] **Step 8: Create samples/writing-samples.md**

```markdown
# Writing Samples

Real comments and posts by Brent. Used as few-shot examples for voice calibration.

---

## Sample 1: Claude Code LSP Comment

**Context:** Responding to a post by Daniel Sutton about Claude Code's LSP support.

**Original post claim:** Claude Code has native LSP support since v2.0.74 that makes grep-based navigation obsolete.

**Comment:**
Even with LSP enabled, Claude Code still defaults to grep because grep is familiar and in its training distribution. Having the tools available doesn't automatically mean Claude will use them. You need explicit CLAUDE.md instructions telling it to prefer LSP tools over grep for navigation. This is exactly the kind of thing that belongs in the agent_docs setup.

Your catalogue vs. shelf-label analogy is perfect.

**What makes this work:**
- Leads with a correction based on real experience
- Names specific artifacts (CLAUDE.md, agent_docs)
- Short acknowledgment of what they got right
- 62 words
```

- [ ] **Step 9: Create empty pipeline directories**

```bash
mkdir -p inbox digests drafts posted
touch inbox/.gitkeep digests/.gitkeep
```

Note: `drafts/` and `posted/` are gitignored. `inbox/` is gitignored. `digests/` is tracked (archived analysis).

- [ ] **Step 10: Install dependencies and commit**

```bash
npm install
git add -A
git commit -m "scaffold: init linkedin-engagement project with config and voice profile"
```

---

### Task 2: Email Parser Module (TDD)

Parses raw HTML email into structured markdown with extracted links grouped by topic. Pure function, no I/O — takes HTML string, returns structured object.

**Files:**
- Create: `~/Development/Smoothed/career/linkedin-engagement/lib/parse-email.mjs`
- Create: `~/Development/Smoothed/career/linkedin-engagement/lib/parse-email.test.mjs`
- Create: `~/Development/Smoothed/career/linkedin-engagement/fixtures/sample-email.html`

- [ ] **Step 1: Create test fixture**

Create `fixtures/sample-email.html` with a simplified Latent Space email structure. Use this realistic HTML:

```html
<!DOCTYPE html>
<html>
<head><title>AINews</title></head>
<body>
<div class="email-header">
  <p>Forwarded this email? <a href="https://latent.space/subscribe">Subscribe here</a></p>
</div>
<div class="content">
  <h1>[AINews] Gemma 4 crosses 2 million downloads</h1>
  <p>a quiet day lets us give due respect to the enormously successful Gemma 4 launch</p>
  <p>Apr 7</p>

  <h2>AI Twitter Recap</h2>
  <h3>Gemma 4's Rapid Local Adoption and the On-Device Open Model Moment</h3>
  <p>Gemma 4 is driving a sharp "local-first" wave: multiple posts pointed to Gemma 4 becoming the top trending model on <a href="https://huggingface.co">Hugging Face</a>. The strongest signal was how quickly people were running it on consumer Apple hardware: <a href="https://twitter.com/adrgrondin">@adrgrondin</a> showed Gemma 4 E2B on an iPhone 17 Pro at roughly 40 tok/s with <a href="https://github.com/ml-explore/mlx">MLX</a>.</p>
  <p>The commercial implication is pressure on paid chat subscriptions: <a href="https://twitter.com/AlexEngineerAI">@AlexEngineerAI</a> argued that Gemma 4 running locally closes enough of the gap to make a Claude subscription less compelling for some users.</p>

  <h3>Hermes Agent's Self-Improving Agent Loop</h3>
  <p>Hermes Agent was the dominant agent-framework story: the core narrative is that Nous' system combines persistent memory and self-generated skills. The launch of a <a href="https://github.com/nousresearch/hermes">Manim skill</a> by <a href="https://twitter.com/NousResearch">@NousResearch</a> demonstrated an agent skill that produces technical animations.</p>
  <p>The contrast with OpenClaw centered on architecture: <a href="https://turingpost.com/hermes-vs-openclaw">The Turing Post</a> summarized the distinction as human-authored skills vs self-forming skills.</p>

  <h3>New Research Signals</h3>
  <p><a href="https://arxiv.org/abs/2026.12345">FIPO</a> from Alibaba Qwen assigns more credit to tokens that strongly affect future steps. Results included reasoning traces extending from 4K to 10K+ tokens.</p>
</div>
<div class="email-footer">
  <p><a href="https://latent.space/unsubscribe">Unsubscribe</a> | <a href="https://latent.space/preferences">Preferences</a></p>
</div>
</body>
</html>
```

- [ ] **Step 2: Write the failing test**

Create `lib/parse-email.test.mjs`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEmail } from './parse-email.mjs';

const sampleHtml = readFileSync(
  new URL('../fixtures/sample-email.html', import.meta.url),
  'utf-8'
);

describe('parseEmail', () => {
  it('extracts topic sections from email HTML', () => {
    const result = parseEmail(sampleHtml);
    assert.ok(Array.isArray(result.topics), 'should return topics array');
    assert.ok(result.topics.length >= 3, 'should find at least 3 topic sections');
    assert.ok(
      result.topics.some(t => t.title.includes('Gemma 4')),
      'should find Gemma 4 topic'
    );
  });

  it('extracts links with context per topic', () => {
    const result = parseEmail(sampleHtml);
    const gemma = result.topics.find(t => t.title.includes('Gemma 4'));
    assert.ok(gemma.links.length >= 3, 'Gemma topic should have at least 3 links');
    assert.ok(
      gemma.links.some(l => l.url.includes('huggingface.co')),
      'should include Hugging Face link'
    );
  });

  it('strips email chrome (header/footer/unsubscribe)', () => {
    const result = parseEmail(sampleHtml);
    const allText = result.topics.map(t => t.body).join(' ');
    assert.ok(!allText.includes('Unsubscribe'), 'should strip footer');
    assert.ok(!allText.includes('Subscribe here'), 'should strip header');
  });

  it('each link has url, text, and surrounding context', () => {
    const result = parseEmail(sampleHtml);
    const firstLink = result.topics[0].links[0];
    assert.ok(firstLink.url, 'link should have url');
    assert.ok(firstLink.text, 'link should have text');
    assert.ok(firstLink.context, 'link should have context');
  });

  it('returns markdown body text per topic', () => {
    const result = parseEmail(sampleHtml);
    const gemma = result.topics.find(t => t.title.includes('Gemma 4'));
    assert.ok(
      gemma.body.includes('local-first'),
      'body should contain topic content'
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd ~/Development/Smoothed/career/linkedin-engagement
node --test lib/parse-email.test.mjs
```

Expected: FAIL — `parseEmail` does not exist yet.

- [ ] **Step 4: Write the implementation**

Create `lib/parse-email.mjs`:

```javascript
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const turndown = new TurndownService({ headingStyle: 'atx' });

/**
 * Parse a newsletter HTML email into structured topics with links.
 * @param {string} html - Raw email HTML
 * @returns {{ topics: Array<{ title: string, body: string, links: Array<{ url: string, text: string, context: string }> }> }}
 */
export function parseEmail(html) {
  const $ = cheerio.load(html);

  // Remove email chrome
  $('.email-header, .email-footer, [class*="footer"], [class*="header"]').remove();
  $('a[href*="unsubscribe"]').closest('div, p').remove();
  $('a[href*="subscribe"]').filter((_, el) => {
    return $(el).text().toLowerCase().includes('subscribe');
  }).closest('div, p').remove();

  // Find topic sections — split on h3 or h2 tags inside content
  const topics = [];
  const headings = $('h2, h3');

  headings.each((i, heading) => {
    const title = $(heading).text().trim();
    if (!title || title.length < 5) return;

    // Collect content between this heading and the next
    const bodyParts = [];
    const links = [];
    let el = $(heading).next();

    while (el.length && !el.is('h2, h3')) {
      const html = $.html(el);
      const text = el.text().trim();
      if (text) bodyParts.push(text);

      // Extract links from this element
      el.find('a[href]').each((_, a) => {
        const url = $(a).attr('href');
        const linkText = $(a).text().trim();
        if (
          url &&
          !url.startsWith('mailto:') &&
          !url.includes('unsubscribe') &&
          !url.includes('subscribe')
        ) {
          links.push({
            url,
            text: linkText,
            context: text.slice(0, 200),
          });
        }
      });

      el = el.next();
    }

    if (bodyParts.length > 0) {
      topics.push({
        title,
        body: bodyParts.join('\n\n'),
        links,
      });
    }
  });

  return { topics };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
node --test lib/parse-email.test.mjs
```

Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add fixtures/sample-email.html lib/parse-email.mjs lib/parse-email.test.mjs
git commit -m "feat: add email parser — extracts topics and links from newsletter HTML"
```

---

### Task 3: Link Follower Module (TDD)

Fetches a URL, extracts the page title and first ~500 words of content. Used to add depth to digest topics by following the hyperlinks in the newsletter.

**Files:**
- Create: `~/Development/Smoothed/career/linkedin-engagement/lib/follow-links.mjs`
- Create: `~/Development/Smoothed/career/linkedin-engagement/lib/follow-links.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `lib/follow-links.test.mjs`:

```javascript
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { extractContent, followLinks } from './follow-links.mjs';

const sampleHtml = `
<html>
<head><title>Gemma 4 Launch Blog</title></head>
<body>
  <nav>Navigation here</nav>
  <article>
    <h1>Gemma 4: A New Era for On-Device AI</h1>
    <p>Google DeepMind released Gemma 4 last week with impressive benchmarks.
    The model runs at 40 tokens per second on iPhone 17 Pro using MLX.
    This represents a significant leap in local inference capabilities.</p>
    <p>The key innovation is the new quantization approach that reduces
    memory footprint without sacrificing quality. Engineers can now run
    production-grade models on consumer hardware.</p>
    <p>Early adopters report that the model handles tool-use scenarios
    surprisingly well, though it still falls short of cloud-hosted models
    for complex multi-step reasoning chains.</p>
  </article>
  <footer>Copyright 2026</footer>
</body>
</html>`;

describe('extractContent', () => {
  it('extracts title from HTML', () => {
    const result = extractContent(sampleHtml);
    assert.equal(result.title, 'Gemma 4 Launch Blog');
  });

  it('extracts body text without nav/footer', () => {
    const result = extractContent(sampleHtml);
    assert.ok(result.body.includes('Google DeepMind released'));
    assert.ok(!result.body.includes('Navigation here'));
    assert.ok(!result.body.includes('Copyright'));
  });

  it('truncates body to approximately 500 words', () => {
    const longHtml = `<html><head><title>Test</title></head><body>
      <article>${'word '.repeat(1000)}</article></body></html>`;
    const result = extractContent(longHtml);
    const wordCount = result.body.split(/\s+/).length;
    assert.ok(wordCount <= 550, `should be ~500 words, got ${wordCount}`);
  });
});

describe('followLinks', () => {
  it('fetches multiple URLs and returns extracted content', async () => {
    const links = [
      { url: 'https://example.com/post1', text: 'Post 1', context: 'ctx' },
      { url: 'https://example.com/post2', text: 'Post 2', context: 'ctx' },
    ];

    // Mock axios via dependency injection
    const mockFetch = async (url) => ({
      data: `<html><head><title>${url}</title></head>
             <body><article><p>Content for ${url}</p></article></body></html>`,
    });

    const results = await followLinks(links, { fetchFn: mockFetch, maxLinks: 2 });
    assert.equal(results.length, 2);
    assert.ok(results[0].title.includes('post1'));
    assert.ok(results[0].body.includes('Content for'));
  });

  it('skips failed URLs gracefully', async () => {
    const links = [
      { url: 'https://example.com/good', text: 'Good', context: 'ctx' },
      { url: 'https://example.com/bad', text: 'Bad', context: 'ctx' },
    ];

    const mockFetch = async (url) => {
      if (url.includes('bad')) throw new Error('404');
      return {
        data: '<html><head><title>Good</title></head><body><article><p>OK</p></article></body></html>',
      };
    };

    const results = await followLinks(links, { fetchFn: mockFetch, maxLinks: 2 });
    assert.equal(results.length, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test lib/follow-links.test.mjs
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/follow-links.mjs`:

```javascript
import * as cheerio from 'cheerio';
import axios from 'axios';

const MAX_WORDS = 500;

/**
 * Extract title and body text from an HTML page.
 * @param {string} html
 * @returns {{ title: string, body: string }}
 */
export function extractContent(html) {
  const $ = cheerio.load(html);

  const title = $('title').first().text().trim() ||
    $('h1').first().text().trim() ||
    'Untitled';

  // Remove non-content elements
  $('nav, footer, header, script, style, aside, [role="navigation"]').remove();

  // Prefer article/main content
  let container = $('article, main, [role="main"]').first();
  if (!container.length) container = $('body');

  const text = container.text().replace(/\s+/g, ' ').trim();

  // Truncate to ~500 words
  const words = text.split(/\s+/);
  const body = words.length > MAX_WORDS
    ? words.slice(0, MAX_WORDS).join(' ') + '...'
    : text;

  return { title, body };
}

/**
 * Follow a list of links and extract content from each.
 * @param {Array<{ url: string, text: string, context: string }>} links
 * @param {{ fetchFn?: Function, maxLinks?: number }} options
 * @returns {Promise<Array<{ url: string, title: string, body: string }>>}
 */
export async function followLinks(links, options = {}) {
  const fetchFn = options.fetchFn || ((url) => axios.get(url, { timeout: 10000 }));
  const maxLinks = options.maxLinks || 10;

  const toFollow = links.slice(0, maxLinks);
  const results = [];

  for (const link of toFollow) {
    try {
      const response = await fetchFn(link.url);
      const { title, body } = extractContent(response.data);
      results.push({ url: link.url, title, body });
    } catch {
      // Skip failed URLs — log silently in production
      continue;
    }
  }

  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test lib/follow-links.test.mjs
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/follow-links.mjs lib/follow-links.test.mjs
git commit -m "feat: add link follower — extracts title and body from URLs"
```

---

### Task 4: Post Scorer Module (TDD)

Pure scoring functions implementing the quality + visibility scoring system from the spec. No I/O — takes post data, returns scores.

**Files:**
- Create: `~/Development/Smoothed/career/linkedin-engagement/lib/score.mjs`
- Create: `~/Development/Smoothed/career/linkedin-engagement/lib/score.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `lib/score.test.mjs`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scorePost, isDisqualified, timingBonus, saturationBonus, rankPosts } from './score.mjs';

describe('isDisqualified', () => {
  it('disqualifies engagement bait', () => {
    assert.ok(isDisqualified('Comment "AI" below and I\'ll send you my framework'));
  });

  it('disqualifies platitudes with no substance', () => {
    assert.ok(isDisqualified('AI is changing everything. The future is here. Are you ready?'));
  });

  it('does not disqualify substantive posts', () => {
    assert.ok(!isDisqualified(
      'We deployed Gemma 4 on our inference cluster last week. ' +
      'Throughput improved 2.3x over Gemma 3 at the same quantization level. ' +
      'The key was the new KV-cache sharing across batch requests.'
    ));
  });
});

describe('scorePost', () => {
  it('scores a high-quality technical post', () => {
    const post = {
      content: 'We benchmarked Gemma 4 27B vs Qwen 3.5 on our production pipeline. ' +
        'Gemma 4 hit 42 tok/s on A100 with vLLM 0.8.2. I built a custom eval harness ' +
        'that tests tool-use accuracy. Results: https://github.com/example/eval',
      numComments: 3,
      hoursAgo: 1,
    };
    const score = scorePost(post);
    assert.ok(score.quality >= 8, `quality should be >= 8, got ${score.quality}`);
    assert.ok(score.total >= 11, `total should be >= 11, got ${score.total}`);
  });

  it('scores a low-quality opinion post lower', () => {
    const post = {
      content: 'Gemma 4 is interesting. Google is really stepping up their game. ' +
        'Open source models are the future.',
      numComments: 30,
      hoursAgo: 15,
    };
    const score = scorePost(post);
    assert.ok(score.quality <= 3, `quality should be <= 3, got ${score.quality}`);
  });
});

describe('timingBonus', () => {
  it('gives +3 for posts under 2 hours old', () => {
    assert.equal(timingBonus(1), 3);
  });

  it('gives +2 for posts 2-6 hours old', () => {
    assert.equal(timingBonus(4), 2);
  });

  it('gives +1 for posts 6-12 hours old', () => {
    assert.equal(timingBonus(8), 1);
  });

  it('gives 0 for posts over 12 hours old', () => {
    assert.equal(timingBonus(24), 0);
  });
});

describe('saturationBonus', () => {
  it('gives +2 for posts with under 5 comments', () => {
    assert.equal(saturationBonus(3), 2);
  });

  it('gives +1 for posts with 5-15 comments', () => {
    assert.equal(saturationBonus(10), 1);
  });

  it('gives 0 for posts with over 15 comments', () => {
    assert.equal(saturationBonus(50), 0);
  });
});

describe('rankPosts', () => {
  it('ranks posts by total score descending', () => {
    const posts = [
      { content: 'Low quality opinion post.', numComments: 40, hoursAgo: 20 },
      {
        content: 'I deployed vLLM 0.8.2 with Gemma 4 on our cluster. ' +
          'Custom KV-cache config reduced TTFT from 800ms to 340ms. ' +
          'Code here: https://github.com/example/vllm-config',
        numComments: 2,
        hoursAgo: 1,
      },
    ];
    const ranked = rankPosts(posts);
    assert.ok(ranked[0].score.total > ranked[1].score.total);
  });

  it('filters out posts below minimum threshold', () => {
    const posts = [
      { content: 'AI is amazing. The future is now.', numComments: 50, hoursAgo: 30 },
    ];
    const ranked = rankPosts(posts, { minScore: 6 });
    assert.equal(ranked.length, 0);
  });

  it('filters out disqualified posts', () => {
    const posts = [
      { content: 'Comment "AGENT" below for my free framework!', numComments: 2, hoursAgo: 1 },
    ];
    const ranked = rankPosts(posts);
    assert.equal(ranked.length, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test lib/score.test.mjs
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/score.mjs`:

```javascript
/**
 * Post quality + visibility scoring.
 * Quality is primary rank. Timing and saturation are tiebreaker bonuses (never negative).
 * Follower count is not scored — displayed for context only.
 */

const ENGAGEMENT_BAIT = [
  /comment\s+["'].+["']\s+(below|and|for|to)/i,
  /drop\s+a\s+["']/i,
  /type\s+["'].+["']\s+in/i,
  /tag\s+someone/i,
  /share\s+this\s+(if|with)/i,
  /repost\s+for/i,
  /follow\s+me\s+for/i,
  /link\s+in\s+(bio|comments|first\s+comment)/i,
  /DM\s+me\s+["']/i,
];

const PLATITUDE_PHRASES = [
  'ai is changing everything',
  'the future is here',
  'the future is now',
  'this changes everything',
  'game changer',
  'are you ready',
  'if you\'re not using ai',
  'ai will replace',
  'wake up people',
];

/**
 * Check if post content triggers a disqualifier.
 */
export function isDisqualified(content) {
  const lower = content.toLowerCase();

  // Engagement bait
  if (ENGAGEMENT_BAIT.some(re => re.test(content))) return true;

  // Platitude density — 2+ platitude hits = disqualify
  const platitudeHits = PLATITUDE_PHRASES.filter(p => lower.includes(p)).length;
  if (platitudeHits >= 2) return true;

  // No substance — very short posts with no specifics
  const words = content.split(/\s+/).length;
  const hasNumbers = /\d+(\.\d+)?[%xX]|\d+\s*(tok|token|ms|GB|MB|K\b)/i.test(content);
  const hasUrls = /https?:\/\//.test(content);
  if (words < 30 && !hasNumbers && !hasUrls) return true;

  return false;
}

/**
 * Score content quality (0-11 range).
 */
function qualityScore(content) {
  let score = 0;

  // +3: Specific technical claims (versions, benchmarks, configs)
  const hasTechClaims = /v?\d+\.\d+|benchmark|tok\/s|latency|throughput|TTFT|quantiz/i.test(content);
  if (hasTechClaims) score += 3;

  // +3: Shows own work
  const showsWork = /\b(I|we)\s+(built|deployed|tested|benchmarked|shipped|ran|tried|migrated|implemented)/i.test(content);
  if (showsWork) score += 3;

  // +2: Links to source material
  const hasLinks = /https?:\/\/(github\.com|arxiv\.org|huggingface\.co|docs\.|blog\.)/.test(content);
  if (hasLinks) score += 2;

  // +2: Nuanced take (tradeoffs, caveats)
  const hasNuance = /\b(but|however|tradeoff|caveat|downside|limitation|though|except|unless|compared to)\b/i.test(content);
  if (hasNuance) score += 2;

  // +1: Commentable angle (assertions that can be extended or corrected)
  const hasAssertion = /\b(better than|worse than|replaces|obsolete|don't need|should use|the key is|the problem is)\b/i.test(content);
  if (hasAssertion) score += 1;

  return score;
}

/**
 * Timing bonus — tiebreaker, never negative.
 */
export function timingBonus(hoursAgo) {
  if (hoursAgo < 2) return 3;
  if (hoursAgo < 6) return 2;
  if (hoursAgo < 12) return 1;
  return 0;
}

/**
 * Comment saturation bonus — tiebreaker, never negative.
 */
export function saturationBonus(numComments) {
  if (numComments < 5) return 2;
  if (numComments <= 15) return 1;
  return 0;
}

/**
 * Score a single post.
 * @param {{ content: string, numComments: number, hoursAgo: number }} post
 * @returns {{ quality: number, timing: number, saturation: number, total: number, disqualified: boolean }}
 */
export function scorePost(post) {
  const disqualified = isDisqualified(post.content);
  const quality = qualityScore(post.content);
  const timing = timingBonus(post.hoursAgo);
  const saturation = saturationBonus(post.numComments);
  return {
    quality,
    timing,
    saturation,
    total: quality + timing + saturation,
    disqualified,
  };
}

/**
 * Rank posts by total score, filter disqualified and below-threshold.
 * @param {Array} posts
 * @param {{ minScore?: number }} options
 * @returns {Array<{ post: object, score: object }>}
 */
export function rankPosts(posts, options = {}) {
  const minScore = options.minScore ?? 6;

  return posts
    .map(post => ({ post, score: scorePost(post) }))
    .filter(({ score }) => !score.disqualified && score.total >= minScore)
    .sort((a, b) => b.score.total - a.score.total);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test lib/score.test.mjs
```

Expected: All 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/score.mjs lib/score.test.mjs
git commit -m "feat: add post scorer — quality + visibility scoring with disqualifiers"
```

---

### Task 5: Voice Loader + Draft Validator (TDD)

Loads voice config and writing samples for prompt injection. Validates draft text against voice rules (word count, banned phrases). Used by the Claude Code skill at draft time.

**Files:**
- Create: `~/Development/Smoothed/career/linkedin-engagement/lib/voice.mjs`
- Create: `~/Development/Smoothed/career/linkedin-engagement/lib/voice.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `lib/voice.test.mjs`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadVoice, validateDraft } from './voice.mjs';

describe('loadVoice', () => {
  it('loads voice config and writing samples from project root', async () => {
    const voice = await loadVoice(
      new URL('../config/voice.yml', import.meta.url).pathname,
      new URL('../samples/writing-samples.md', import.meta.url).pathname
    );
    assert.ok(voice.config.tone.length > 0, 'should load tone rules');
    assert.ok(voice.config.avoid.phrases.length > 0, 'should load avoid phrases');
    assert.ok(voice.samples.length > 0, 'should load writing samples');
  });
});

describe('validateDraft', () => {
  const voiceConfig = {
    word_limits: { comment: 80, article: 500 },
    avoid: {
      phrases: ['Great post!', 'Love this!', 'What do you think?'],
      patterns: ['emoji', 'rhetorical_questions'],
    },
  };

  it('passes a valid comment draft', () => {
    const draft = 'Even with LSP enabled, Claude Code still defaults to grep ' +
      'because grep is familiar and in its training distribution.';
    const result = validateDraft(draft, 'comment', voiceConfig);
    assert.ok(result.valid);
    assert.equal(result.issues.length, 0);
  });

  it('flags drafts exceeding word limit', () => {
    const draft = 'word '.repeat(100);
    const result = validateDraft(draft, 'comment', voiceConfig);
    assert.ok(!result.valid);
    assert.ok(result.issues.some(i => i.includes('word')));
  });

  it('flags banned phrases', () => {
    const draft = 'Great post! I really think this is spot on.';
    const result = validateDraft(draft, 'comment', voiceConfig);
    assert.ok(!result.valid);
    assert.ok(result.issues.some(i => i.includes('Great post!')));
  });

  it('flags emoji usage', () => {
    const draft = 'Solid analysis of the deployment pipeline 🔥';
    const result = validateDraft(draft, 'comment', voiceConfig);
    assert.ok(!result.valid);
    assert.ok(result.issues.some(i => i.includes('emoji')));
  });

  it('uses article word limit for article type', () => {
    const draft = 'word '.repeat(200);
    const result = validateDraft(draft, 'article', voiceConfig);
    assert.ok(result.valid, 'should pass under 500 word article limit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test lib/voice.test.mjs
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/voice.mjs`:

```javascript
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

// Match common emoji ranges
const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/u;

/**
 * Load voice configuration and writing samples.
 * @param {string} voicePath - Path to voice.yml
 * @param {string} samplesPath - Path to writing-samples.md
 * @returns {{ config: object, samples: string }}
 */
export async function loadVoice(voicePath, samplesPath) {
  const configRaw = readFileSync(voicePath, 'utf-8');
  const config = yaml.load(configRaw);
  const samples = readFileSync(samplesPath, 'utf-8');
  return { config, samples };
}

/**
 * Validate a draft against voice rules.
 * @param {string} draft - The draft text
 * @param {'comment' | 'article'} type - Draft type
 * @param {object} voiceConfig - The loaded voice config object
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateDraft(draft, type, voiceConfig) {
  const issues = [];
  const wordCount = draft.trim().split(/\s+/).length;
  const limit = voiceConfig.word_limits[type];

  // Word limit check
  if (wordCount > limit) {
    issues.push(`${wordCount} words exceeds ${type} limit of ${limit}`);
  }

  // Banned phrases
  for (const phrase of voiceConfig.avoid.phrases) {
    if (draft.toLowerCase().includes(phrase.toLowerCase())) {
      issues.push(`Contains banned phrase: "${phrase}"`);
    }
  }

  // Emoji check
  if (voiceConfig.avoid.patterns.includes('emoji') && EMOJI_RE.test(draft)) {
    issues.push('Contains emoji — remove for authentic voice');
  }

  // Rhetorical questions (ends sentence with ?)
  if (voiceConfig.avoid.patterns.includes('rhetorical_questions')) {
    const questions = draft.match(/[^.!?]*\?/g) || [];
    // Allow one question if it's genuinely technical, flag if pattern-y
    const rhetoricalPatterns = /\b(have you|don't you|isn't it|right\?|wouldn't you)/i;
    for (const q of questions) {
      if (rhetoricalPatterns.test(q)) {
        issues.push(`Possible rhetorical question: "${q.trim()}"`);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test lib/voice.test.mjs
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/voice.mjs lib/voice.test.mjs
git commit -m "feat: add voice loader + draft validator — enforces writing style rules"
```

---

### Task 6: Gmail Client Module

Wraps the Google Gmail API for fetching emails by sender/label. This has external dependencies (OAuth tokens) so testing is limited to verifying the module structure. The user will need to set up Google Cloud credentials manually.

**Files:**
- Create: `~/Development/Smoothed/career/linkedin-engagement/lib/gmail.mjs`
- Create: `~/Development/Smoothed/career/linkedin-engagement/lib/gmail.test.mjs`
- Create: `~/Development/Smoothed/career/linkedin-engagement/docs/gmail-setup.md`

- [ ] **Step 1: Create Gmail setup guide**

Create `docs/gmail-setup.md`:

```markdown
# Gmail API Setup

## 1. Create Google Cloud Project

1. Go to https://console.cloud.google.com
2. Create a new project (e.g., "linkedin-engagement")
3. Enable the Gmail API: APIs & Services → Library → search "Gmail API" → Enable

## 2. Create OAuth Credentials

1. APIs & Services → Credentials → Create Credentials → OAuth Client ID
2. Application type: Desktop app
3. Download the JSON file
4. Note the `client_id` and `client_secret`

## 3. Get Refresh Token

Run this one-time script to get your refresh token:

```bash
node lib/gmail-auth.mjs
```

This opens a browser for Google sign-in. After authorizing, it prints your refresh token.

## 4. Configure .env

```
GMAIL_CLIENT_ID=your-client-id
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token
```

## 5. Create Gmail Filter

In Gmail, create a filter:
- From: `hello@latent.space` (or whatever the Latent Space sender is)
- Apply label: `latent-space`
- Skip inbox (optional)
```

- [ ] **Step 2: Write the failing test**

Create `lib/gmail.test.mjs`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractHtmlBody, buildQuery } from './gmail.mjs';

describe('buildQuery', () => {
  it('builds Gmail query from source config', () => {
    const source = { sender: 'hello@latent.space', label: 'latent-space' };
    const query = buildQuery(source);
    assert.equal(query, 'from:hello@latent.space label:latent-space is:unread');
  });

  it('works without label', () => {
    const source = { sender: 'hello@latent.space' };
    const query = buildQuery(source);
    assert.equal(query, 'from:hello@latent.space is:unread');
  });
});

describe('extractHtmlBody', () => {
  it('extracts HTML from multipart message', () => {
    const message = {
      payload: {
        mimeType: 'multipart/alternative',
        parts: [
          { mimeType: 'text/plain', body: { data: Buffer.from('plain text').toString('base64url') } },
          { mimeType: 'text/html', body: { data: Buffer.from('<html><body>Hello</body></html>').toString('base64url') } },
        ],
      },
    };
    const html = extractHtmlBody(message);
    assert.ok(html.includes('<body>Hello</body>'));
  });

  it('extracts HTML from single-part message', () => {
    const message = {
      payload: {
        mimeType: 'text/html',
        body: { data: Buffer.from('<html><body>Direct</body></html>').toString('base64url') },
      },
    };
    const html = extractHtmlBody(message);
    assert.ok(html.includes('Direct'));
  });

  it('returns null when no HTML part found', () => {
    const message = { payload: { mimeType: 'text/plain', body: { data: '' } } };
    const html = extractHtmlBody(message);
    assert.equal(html, null);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
node --test lib/gmail.test.mjs
```

Expected: FAIL — module does not exist.

- [ ] **Step 4: Write the implementation**

Create `lib/gmail.mjs`:

```javascript
import { google } from 'googleapis';

/**
 * Create an authenticated Gmail client.
 * @param {{ clientId: string, clientSecret: string, refreshToken: string }} creds
 * @returns {object} Gmail API client
 */
export function createGmailClient({ clientId, clientSecret, refreshToken }) {
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth: oauth2 });
}

/**
 * Build a Gmail search query from source config.
 * @param {{ sender: string, label?: string }} source
 * @returns {string}
 */
export function buildQuery(source) {
  let q = `from:${source.sender}`;
  if (source.label) q += ` label:${source.label}`;
  q += ' is:unread';
  return q;
}

/**
 * Extract HTML body from a Gmail message object.
 * @param {object} message - Gmail message (full format)
 * @returns {string|null}
 */
export function extractHtmlBody(message) {
  const payload = message.payload;

  // Multipart — find the HTML part
  if (payload.parts) {
    const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      return Buffer.from(htmlPart.body.data, 'base64url').toString('utf-8');
    }
  }

  // Single part — check if it's HTML
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }

  return null;
}

/**
 * Fetch unread emails matching a source config.
 * @param {object} gmail - Gmail API client
 * @param {{ sender: string, label?: string }} source
 * @param {{ maxResults?: number }} options
 * @returns {Promise<Array<{ id: string, html: string }>>}
 */
export async function fetchEmails(gmail, source, options = {}) {
  const maxResults = options.maxResults || 5;
  const q = buildQuery(source);

  const res = await gmail.users.messages.list({
    userId: 'me',
    q,
    maxResults,
  });

  if (!res.data.messages) return [];

  const emails = [];
  for (const msg of res.data.messages) {
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'full',
    });
    const html = extractHtmlBody(full.data);
    if (html) {
      emails.push({ id: msg.id, html });
    }
  }

  return emails;
}

/**
 * Mark an email as read (remove UNREAD label).
 * @param {object} gmail - Gmail API client
 * @param {string} messageId
 */
export async function markAsRead(gmail, messageId) {
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
node --test lib/gmail.test.mjs
```

Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/gmail.mjs lib/gmail.test.mjs docs/gmail-setup.md
git commit -m "feat: add Gmail client — OAuth auth, email fetching, HTML extraction"
```

---

### Task 7: Ingest Pipeline CLI

Wires Gmail + email parser + link follower into a single CLI entry point. Reads source config, fetches emails, parses them, follows links, and saves structured digests to `digests/`.

**Files:**
- Create: `~/Development/Smoothed/career/linkedin-engagement/lib/ingest.mjs`

- [ ] **Step 1: Write the ingest pipeline**

Create `lib/ingest.mjs`:

```javascript
import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { createGmailClient, fetchEmails, markAsRead } from './gmail.mjs';
import { parseEmail } from './parse-email.mjs';
import { followLinks } from './follow-links.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function main() {
  // Load source config
  const sourcesRaw = readFileSync(join(ROOT, 'config/sources.yml'), 'utf-8');
  const { sources } = yaml.load(sourcesRaw);
  const source = sources[0]; // Latent Space for now

  console.log(`Checking Gmail for emails from ${source.sender}...`);

  // Create Gmail client
  const gmail = createGmailClient({
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN,
  });

  // Fetch unread emails
  const emails = await fetchEmails(gmail, source);
  if (emails.length === 0) {
    console.log('No new emails found.');
    return;
  }

  console.log(`Found ${emails.length} new email(s). Processing...`);

  for (const email of emails) {
    // Parse email HTML into topics + links
    const parsed = parseEmail(email.html);
    console.log(`  Extracted ${parsed.topics.length} topics`);

    // Collect all links across topics, deduplicate
    const allLinks = [];
    const seen = new Set();
    for (const topic of parsed.topics) {
      for (const link of topic.links) {
        if (!seen.has(link.url)) {
          seen.add(link.url);
          allLinks.push(link);
        }
      }
    }

    // Follow top N links for depth
    const maxLinks = source.follow_links || 10;
    console.log(`  Following top ${Math.min(maxLinks, allLinks.length)} links...`);
    const enriched = await followLinks(allLinks, { maxLinks });

    // Build enrichment map: url → extracted content
    const enrichmentMap = new Map(enriched.map(e => [e.url, e]));

    // Build digest markdown
    const date = new Date().toISOString().slice(0, 10);
    const digestLines = [`# Digest — ${date}`, `**Source:** ${source.name}`, ''];

    for (const topic of parsed.topics) {
      digestLines.push(`## ${topic.title}`, '', topic.body, '');

      // Add enriched link summaries
      const enrichedLinks = topic.links
        .filter(l => enrichmentMap.has(l.url))
        .map(l => enrichmentMap.get(l.url));

      if (enrichedLinks.length > 0) {
        digestLines.push('### Source Material', '');
        for (const e of enrichedLinks) {
          digestLines.push(`**[${e.title}](${e.url})**`);
          digestLines.push(e.body.slice(0, 300) + '...', '');
        }
      }

      // List all links for reference
      digestLines.push('### Links', '');
      for (const link of topic.links) {
        digestLines.push(`- [${link.text}](${link.url})`);
      }
      digestLines.push('');
    }

    // Save digest
    const digestDir = join(ROOT, 'digests');
    mkdirSync(digestDir, { recursive: true });
    const digestPath = join(digestDir, `${date}-digest.md`);
    writeFileSync(digestPath, digestLines.join('\n'));
    console.log(`  Saved digest to ${digestPath}`);

    // Mark email as read
    await markAsRead(gmail, email.id);
    console.log(`  Marked email as read`);
  }

  console.log('Done.');
}

main().catch(err => {
  console.error('Ingest failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it runs (dry run — will fail without Gmail creds, which is expected)**

```bash
cd ~/Development/Smoothed/career/linkedin-engagement
node lib/ingest.mjs
```

Expected: Fails with `GMAIL_CLIENT_ID` not set or auth error. This confirms the script loads and runs.

- [ ] **Step 3: Commit**

```bash
git add lib/ingest.mjs
git commit -m "feat: add ingest pipeline — Gmail to parsed digest with enriched links"
```

---

### Task 8: Bright Data Client Module (TDD)

Wraps the Bright Data API for discovering LinkedIn posts. Supports both synchronous (up to 20 URLs, 1-min timeout) and async (trigger + poll for results) modes. For keyword-based discovery, we use the async trigger endpoint.

**Files:**
- Create: `~/Development/Smoothed/career/linkedin-engagement/lib/brightdata.mjs`
- Create: `~/Development/Smoothed/career/linkedin-engagement/lib/brightdata.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `lib/brightdata.test.mjs`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePostResponse, buildSearchInput, calcHoursAgo } from './brightdata.mjs';

describe('buildSearchInput', () => {
  it('builds input array from keywords for LinkedIn search URL', () => {
    const input = buildSearchInput(['gemma 4', 'local deployment']);
    assert.ok(Array.isArray(input));
    assert.ok(input.length >= 1);
    assert.ok(input[0].url.includes('linkedin.com'));
    assert.ok(input[0].url.includes('gemma'));
  });
});

describe('parsePostResponse', () => {
  it('normalizes Bright Data post response into our format', () => {
    const raw = [
      {
        post_text: 'We deployed Gemma 4 on our cluster with vLLM 0.8.2. 42 tok/s on A100.',
        num_likes: 150,
        num_comments: 8,
        date_posted: '2026-04-09T10:00:00.000Z',
        user_name: 'Alex Engineer',
        user_headline: 'Staff ML Engineer at Anthropic',
        user_followers: 12400,
        user_url: 'https://www.linkedin.com/in/alexengineer',
        post_url: 'https://www.linkedin.com/posts/alexengineer_activity-123',
        hashtags: ['#gemma4', '#mlops'],
      },
    ];

    const posts = parsePostResponse(raw);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].content, raw[0].post_text);
    assert.equal(posts[0].author.name, 'Alex Engineer');
    assert.equal(posts[0].author.headline, 'Staff ML Engineer at Anthropic');
    assert.equal(posts[0].author.followers, 12400);
    assert.equal(posts[0].numLikes, 150);
    assert.equal(posts[0].numComments, 8);
    assert.ok(posts[0].postUrl.includes('linkedin.com'));
  });

  it('handles missing fields gracefully', () => {
    const raw = [{ post_text: 'A post with minimal data' }];
    const posts = parsePostResponse(raw);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].content, 'A post with minimal data');
    assert.equal(posts[0].numComments, 0);
    assert.equal(posts[0].author.name, 'Unknown');
  });
});

describe('calcHoursAgo', () => {
  it('calculates hours between date and now', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const hours = calcHoursAgo(twoHoursAgo);
    assert.ok(hours >= 1.9 && hours <= 2.1, `expected ~2, got ${hours}`);
  });

  it('returns 999 for missing date', () => {
    assert.equal(calcHoursAgo(null), 999);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test lib/brightdata.test.mjs
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/brightdata.mjs`:

```javascript
import axios from 'axios';

const POSTS_DATASET_ID = 'gd_lyy3tktm25m4avu764';
const BASE_URL = 'https://api.brightdata.com/datasets/v3';

/**
 * Build LinkedIn search URLs from keywords.
 * Uses LinkedIn's content search URL format.
 * @param {string[]} keywords
 * @returns {Array<{ url: string }>}
 */
export function buildSearchInput(keywords) {
  // LinkedIn content search URL — Bright Data navigates to this and collects posts
  const query = keywords.join(' ');
  const encoded = encodeURIComponent(query);
  return [
    { url: `https://www.linkedin.com/search/results/content/?keywords=${encoded}&sortBy=%22date_posted%22` },
  ];
}

/**
 * Calculate hours between a date string and now.
 * @param {string|null} dateStr - ISO date string
 * @returns {number}
 */
export function calcHoursAgo(dateStr) {
  if (!dateStr) return 999;
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return (now - then) / (1000 * 60 * 60);
}

/**
 * Normalize Bright Data post response into our internal format.
 * @param {Array} raw - Raw Bright Data response array
 * @returns {Array<{ content: string, author: object, numLikes: number, numComments: number, hoursAgo: number, postUrl: string }>}
 */
export function parsePostResponse(raw) {
  return raw.map(post => ({
    content: post.post_text || '',
    author: {
      name: post.user_name || 'Unknown',
      headline: post.user_headline || '',
      followers: post.user_followers || 0,
      profileUrl: post.user_url || '',
    },
    numLikes: post.num_likes || 0,
    numComments: post.num_comments || 0,
    hoursAgo: calcHoursAgo(post.date_posted),
    postUrl: post.post_url || '',
    hashtags: post.hashtags || [],
  }));
}

/**
 * Trigger an async Bright Data collection for LinkedIn posts.
 * @param {string} apiToken
 * @param {string[]} keywords
 * @returns {Promise<string>} snapshot_id
 */
export async function triggerCollection(apiToken, keywords) {
  const input = buildSearchInput(keywords);
  const res = await axios.post(
    `${BASE_URL}/trigger?dataset_id=${POSTS_DATASET_ID}&format=json`,
    input,
    {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return res.data.snapshot_id;
}

/**
 * Poll for collection results until ready.
 * @param {string} apiToken
 * @param {string} snapshotId
 * @param {{ maxWaitMs?: number, pollIntervalMs?: number }} options
 * @returns {Promise<Array>} Raw post data
 */
export async function pollResults(apiToken, snapshotId, options = {}) {
  const maxWait = options.maxWaitMs || 120000;
  const interval = options.pollIntervalMs || 5000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const progress = await axios.get(
      `${BASE_URL}/progress/${snapshotId}`,
      { headers: { 'Authorization': `Bearer ${apiToken}` } }
    );

    if (progress.data.status === 'ready') {
      const snapshot = await axios.get(
        `${BASE_URL}/snapshot/${snapshotId}?format=json`,
        { headers: { 'Authorization': `Bearer ${apiToken}` } }
      );
      return snapshot.data;
    }

    if (progress.data.status === 'failed') {
      throw new Error(`Collection failed: ${JSON.stringify(progress.data)}`);
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Collection timed out after ${maxWait}ms`);
}

/**
 * Search LinkedIn posts by keywords. Full flow: trigger → poll → parse.
 * @param {string} apiToken
 * @param {string[]} keywords
 * @returns {Promise<Array>} Normalized post array
 */
export async function searchPosts(apiToken, keywords) {
  const snapshotId = await triggerCollection(apiToken, keywords);
  const raw = await pollResults(apiToken, snapshotId);
  return parsePostResponse(raw);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test lib/brightdata.test.mjs
```

Expected: All 5 tests PASS (testing pure functions only, no API calls).

- [ ] **Step 5: Commit**

```bash
git add lib/brightdata.mjs lib/brightdata.test.mjs
git commit -m "feat: add Bright Data client — LinkedIn post search via trigger/poll API"
```

---

### Task 9: Discovery Pipeline CLI

Wires Bright Data search + post scorer into a CLI. Takes keywords as arguments, searches LinkedIn, scores results, and saves ranked candidates to a file.

**Files:**
- Create: `~/Development/Smoothed/career/linkedin-engagement/lib/discover.mjs`

- [ ] **Step 1: Write the discovery pipeline**

Create `lib/discover.mjs`:

```javascript
import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchPosts } from './brightdata.mjs';
import { rankPosts } from './score.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function main() {
  const keywords = process.argv.slice(2);
  if (keywords.length === 0) {
    console.error('Usage: node lib/discover.mjs <keyword1> <keyword2> ...');
    console.error('Example: node lib/discover.mjs "gemma 4" "local deployment"');
    process.exit(1);
  }

  const apiToken = process.env.BRIGHTDATA_API_TOKEN;
  if (!apiToken) {
    console.error('BRIGHTDATA_API_TOKEN not set in .env');
    process.exit(1);
  }

  console.log(`Searching LinkedIn for: ${keywords.join(', ')}...`);

  // Search via Bright Data
  const posts = await searchPosts(apiToken, keywords);
  console.log(`Found ${posts.length} posts. Scoring...`);

  // Score and rank
  const ranked = rankPosts(
    posts.map(p => ({
      ...p,
      content: p.content,
      numComments: p.numComments,
      hoursAgo: p.hoursAgo,
    }))
  );

  console.log(`${ranked.length} posts passed quality + threshold filters.`);

  // Take top 5
  const top = ranked.slice(0, 5);

  // Build candidates markdown
  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    `# Discovery Candidates — ${date}`,
    `**Keywords:** ${keywords.join(', ')}`,
    `**Posts scanned:** ${posts.length}`,
    `**Passed filters:** ${ranked.length}`,
    '',
  ];

  top.forEach((entry, i) => {
    const { post, score } = entry;
    lines.push(
      `## Candidate ${i + 1} (Score: ${score.total} = Q${score.quality} + T${score.timing} + S${score.saturation})`,
      '',
      `**Author:** ${post.author.name}`,
      `**Headline:** ${post.author.headline}`,
      `**Followers:** ${post.author.followers.toLocaleString()}`,
      `**Post Age:** ${Math.round(post.hoursAgo)}h`,
      `**Engagement:** ${post.numLikes} likes, ${post.numComments} comments`,
      `**URL:** ${post.postUrl}`,
      '',
      '**Post:**',
      `> ${post.content.slice(0, 500)}${post.content.length > 500 ? '...' : ''}`,
      '',
    );
  });

  // Save to drafts
  const draftsDir = join(ROOT, 'drafts');
  mkdirSync(draftsDir, { recursive: true });
  const outPath = join(draftsDir, `${date}-candidates.md`);
  writeFileSync(outPath, lines.join('\n'));
  console.log(`Saved candidates to ${outPath}`);
}

main().catch(err => {
  console.error('Discovery failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it runs (dry run — will fail without Bright Data token)**

```bash
node lib/discover.mjs "gemma 4" "local deployment"
```

Expected: Fails with `BRIGHTDATA_API_TOKEN not set`. Confirms the script loads.

- [ ] **Step 3: Commit**

```bash
git add lib/discover.mjs
git commit -m "feat: add discovery pipeline — Bright Data search + scoring to ranked candidates"
```

---

### Task 10: Prompt Templates

Prompt templates that Claude uses when drafting comments and articles. These are markdown files with placeholder tokens that get filled at runtime by the Claude Code skill.

**Files:**
- Create: `~/Development/Smoothed/career/linkedin-engagement/templates/comment.md`
- Create: `~/Development/Smoothed/career/linkedin-engagement/templates/article.md`

- [ ] **Step 1: Create comment prompt template**

Create `templates/comment.md`:

```markdown
# Comment Drafting Instructions

You are drafting a LinkedIn comment for Brent Bartosch. Follow the voice rules EXACTLY.

## Voice Rules

{{voice_config}}

## Writing Samples (match this voice)

{{writing_samples}}

## Target Post

**Author:** {{author_name}} ({{author_headline}})
**Post:**
> {{post_content}}

## Source Material (use this to add depth)

{{source_material}}

## Your Task

Draft a comment that:
1. Leads with a correction, extension, or non-obvious insight — NOT praise
2. References specific technical details from the source material that the poster missed or got wrong
3. Speaks from practitioner experience ("I've found...", "In practice...", "The gotcha is...")
4. Stays under 80 words
5. Ends when the point is made — no summary, no CTA, no "thoughts?"

If the poster's take is solid and you can't genuinely add value, say so instead of forcing a comment.

Write ONLY the comment text. No preamble, no explanation.
```

- [ ] **Step 2: Create article prompt template**

Create `templates/article.md`:

```markdown
# Article Drafting Instructions

You are drafting a short LinkedIn article for Brent Bartosch. Follow the voice rules EXACTLY.

## Voice Rules

{{voice_config}}

## Writing Samples (match this voice)

{{writing_samples}}

## Topic

{{topic_title}}

## Source Material

{{source_material}}

## Your Task

Draft a 300-500 word article with this structure:

1. **Hook** (1-2 sentences): A specific, surprising claim or observation. Not "AI is changing X." Something like "Gemma 4 running at 40 tok/s on an iPhone means your $200/month Claude subscription just got a competitor that costs $0."

2. **What happened** (2-3 sentences): The factual context. What was released, announced, or discovered. Be specific — versions, benchmarks, names.

3. **Why it matters for practitioners** (the bulk): How this changes real workflows. What should engineers actually do differently? What's the gotcha nobody's talking about? Speak from doing, not theorizing.

4. **Your take** (2-3 sentences): A direct opinion. Not hedged, not balanced-for-the-sake-of-balance. Pick a side and defend it briefly.

No emoji. No "Here are 3 takeaways." No "What do you think?" at the end. End when the point is made.

Write ONLY the article text. No preamble, no explanation.
```

- [ ] **Step 3: Commit**

```bash
git add templates/comment.md templates/article.md
git commit -m "feat: add prompt templates for comment and article drafting"
```

---

### Task 11: Claude Code Skill + CLAUDE.md

The orchestration layer. A Claude Code skill definition that ties the full pipeline together, and a project CLAUDE.md that gives Claude context when working in this repo.

**Files:**
- Create: `~/Development/Smoothed/career/linkedin-engagement/CLAUDE.md`
- Create: `~/Development/Smoothed/career/linkedin-engagement/.claude/skills/engage/SKILL.md`

- [ ] **Step 1: Create CLAUDE.md**

Create `CLAUDE.md`:

```markdown
# LinkedIn Engagement System

AI-powered LinkedIn engagement pipeline for career positioning.

## How It Works

1. **Ingest** (`npm run ingest`): Polls Gmail for Latent Space emails, parses them into structured digests in `digests/`
2. **Analyze**: Claude reads the latest digest, presents 4 topic picks (run via `/engage` skill)
3. **Discover** (`npm run discover <keywords>`): Searches LinkedIn via Bright Data, scores posts, saves candidates to `drafts/`
4. **Draft**: Claude drafts comments and articles using voice profile (run via `/engage` skill)
5. **Review + Post**: User reviews drafts in `drafts/`, posts manually, moves to `posted/`

## Key Files

| File | Purpose |
|------|---------|
| `config/voice.yml` | Writing style rules — hard constraints for all drafts |
| `config/profile.yml` | User identity and target roles |
| `config/sources.yml` | Newsletter sources to monitor |
| `samples/writing-samples.md` | Real writing samples for voice calibration |
| `templates/comment.md` | Prompt template for comment drafting |
| `templates/article.md` | Prompt template for article drafting |

## Voice Rules (CRITICAL)

When drafting ANY text for the user:
- Read `config/voice.yml` FIRST — these are hard constraints
- Read `samples/writing-samples.md` for few-shot examples of the user's voice
- Use `lib/voice.mjs` validateDraft() to check output before presenting
- If a draft could have been written by anyone, rewrite it

## Stack

Node.js (ESM/.mjs), googleapis (Gmail), axios (Bright Data), cheerio (HTML parsing), js-yaml (config)

## Data Flow

- `inbox/` — raw email downloads (gitignored)
- `digests/` — parsed + enriched digests (tracked)
- `drafts/` — comment and article drafts awaiting review (gitignored)
- `posted/` — approved drafts as engagement history (gitignored)
```

- [ ] **Step 2: Create the Claude Code skill**

```bash
mkdir -p .claude/skills/engage
```

Create `.claude/skills/engage/SKILL.md`:

```markdown
---
name: engage
description: LinkedIn engagement pipeline — ingest digests, pick topics, discover posts, draft comments and articles
---

# LinkedIn Engagement Skill

## Available Commands

When the user runs `/engage`, show this menu:

1. **Ingest** — Poll Gmail for new digests → `npm run ingest`
2. **Topics** — Analyze latest digest and present 4 topic picks
3. **Discover** — Search LinkedIn for posts on a topic → `npm run discover <keywords>`
4. **Draft comments** — Draft voice-matched comments for discovered posts
5. **Draft article** — Draft a weekly short take on chosen topic
6. **Review** — Show pending drafts for review
7. **Post** — Move approved draft to posted/ archive

When the user runs `/engage <number>`, execute that option directly.

---

## Option 1: Ingest

Run:
```bash
npm run ingest
```

Report results: how many emails processed, how many topics extracted, digest file path.

## Option 2: Topics

1. Find the most recent file in `digests/` (sorted by filename date)
2. Read it completely
3. Read `config/profile.yml` for the user's target roles and companies
4. Score each topic by:
   - Recency and momentum
   - Controversy or correction potential
   - Relevance to user's target roles
   - Practical workflow impact
5. Present the top 4 topics, each with:
   - One-line summary
   - Why it's commentable (the angle)
   - Career positioning relevance
6. Ask the user to choose one or more

## Option 3: Discover

Extract 3-5 search keywords from the chosen topic, then run:
```bash
npm run discover "keyword1" "keyword2" ...
```

Present the candidates file from `drafts/` showing the top posts with scores.

## Option 4: Draft Comments

For each candidate post (from the most recent candidates file in `drafts/`):

1. Read `config/voice.yml` — these are HARD CONSTRAINTS
2. Read `samples/writing-samples.md` — these are few-shot examples
3. Read `templates/comment.md` — this is the prompt structure
4. Read the source digest for depth on the topic
5. Fill in the template and draft the comment
6. Validate the draft with the voice rules (word count, banned phrases, no emoji)
7. Save to `drafts/YYYY-MM-DD-comment-{n}.md` using this format:

```markdown
# Comment Draft — {date}

## Topic: {topic summary}

## Target Post
**Author:** {name} ({headline})
**Followers:** {count}
**Post Age:** {hours}h
**Engagement:** {likes} likes, {comments} comments
**Quality Score:** {score}
**URL:** {post_url}
**Post excerpt:**
> {first 300 chars of post}

## Source Material
- {key facts from digest that inform the comment}

## Angle
{One line: what you're correcting, extending, or adding}

## Draft Comment
{The actual comment text — 60-80 words}
```

## Option 5: Draft Article

1. Read voice config, samples, and article template (same as comment drafting)
2. Read the source digest for the chosen topic
3. Draft a 300-500 word short take
4. Validate against voice rules
5. Save to `drafts/YYYY-MM-DD-article.md`

## Option 6: Review

List all files in `drafts/` with a one-line summary of each. Let the user read, edit, or approve them.

## Option 7: Post

When the user approves a draft:
1. Copy the draft file to `posted/`
2. Add `## Posted: {timestamp}` to the posted copy
3. Delete from `drafts/`
4. Periodically (every 10 posted drafts), ask the user which posted comments best represent their voice, and offer to add them to `samples/writing-samples.md`
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md .claude/skills/engage/SKILL.md
git commit -m "feat: add CLAUDE.md and /engage Claude Code skill for pipeline orchestration"
```

---

### Task 12: Integration Verification

Run all tests, verify the full project structure, and ensure everything is wired together.

**Files:**
- No new files

- [ ] **Step 1: Run full test suite**

```bash
cd ~/Development/Smoothed/career/linkedin-engagement
npm test
```

Expected: All tests pass (parse-email, follow-links, score, voice, gmail, brightdata).

- [ ] **Step 2: Verify project structure**

```bash
find . -type f -not -path './node_modules/*' -not -path './.git/*' | sort
```

Expected output should include all files from Tasks 1-11:
```
./.claude/skills/engage/SKILL.md
./.env.example
./.gitignore
./CLAUDE.md
./config/profile.yml
./config/sources.yml
./config/voice.yml
./digests/.gitkeep
./docs/gmail-setup.md
./fixtures/sample-email.html
./inbox/.gitkeep
./lib/brightdata.mjs
./lib/brightdata.test.mjs
./lib/discover.mjs
./lib/follow-links.mjs
./lib/follow-links.test.mjs
./lib/gmail.mjs
./lib/gmail.test.mjs
./lib/ingest.mjs
./lib/parse-email.mjs
./lib/parse-email.test.mjs
./lib/score.mjs
./lib/score.test.mjs
./lib/voice.mjs
./lib/voice.test.mjs
./package.json
./samples/writing-samples.md
./templates/article.md
./templates/comment.md
```

- [ ] **Step 3: Verify npm scripts work**

```bash
npm run ingest 2>&1 | head -5    # Should fail with Gmail auth error
npm run discover 2>&1 | head -5  # Should print usage message
```

Expected: Both scripts load and produce expected error messages (missing credentials / missing args), confirming the module wiring is correct.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git status
# If clean: no commit needed
# If changes: git add -A && git commit -m "fix: integration fixes from verification"
```

---

## Post-Implementation Checklist

After all tasks are complete, the user needs to:

1. **Set up Gmail OAuth** — follow `docs/gmail-setup.md` to get credentials into `.env`
2. **Configure Bright Data** — add `BRIGHTDATA_API_TOKEN` to `.env`
3. **Create Gmail filter** — auto-label Latent Space emails
4. **Fill in profile.yml** — LinkedIn URL, target roles, target companies
5. **Test end-to-end** — run `npm run ingest`, then `/engage` to analyze + draft

These are manual steps that require the user's credentials and preferences.
