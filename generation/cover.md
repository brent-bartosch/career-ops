# Cover Document Generation Mode

Generate a tailored cover document (not a cover letter) for a specific job posting.

## What This Is

A one-pager that says: "Here's your problem, here's a system I've already built that solves it, here's what I'd build for you." This is the differentiating artifact.

## Inputs

1. The evaluation brief from `data/evaluations/{company}-{role-slug}.json`
2. Relevant system page content (from corpus, identified in evaluation)
3. Relevant case study content (from corpus, identified in evaluation)

## Structure

### Section 1: Their Problem (2-3 sentences)
State the core problem this role is solving, in their language. Use the evaluation's `coverDocumentOutline.theirProblem`. Don't generalize — be specific to what the JD describes.

### Section 2: A System I've Built (1 paragraph + key metrics)
The most relevant Smoothed system, described in outcome terms. Pull specific details from the actual system page and case study content. Include real numbers.

### Section 3: What I'd Build for You (3-5 bullets)
The `first90Days` outline from the evaluation, expanded into concrete deliverables. These should be specific enough that the reader can picture the output — not generic "assess the current state" consulting-speak.

### Section 4: CTA (1 sentence)
Direct. "I'd like to walk you through how this would work for [company]. Here's my calendar: [link]"

## Output Format

Generate as HTML, save to `data/artifacts/covers/{company}-{role-slug}.html`

Then generate PDF:
```bash
node generate-pdf.mjs data/artifacts/covers/{company}-{role-slug}.html data/artifacts/covers/{company}-{role-slug}.pdf --format=letter
```

## Constraints

- One page maximum
- No fluff, no "I'm excited to apply" language
- Every sentence either describes their problem or demonstrates your capability
- Real system names, real metrics, real architecture descriptions
