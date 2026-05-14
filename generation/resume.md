# Resume Tailoring Mode

Generate a tailored resume for a specific job posting.

## Inputs

1. The evaluation brief from `data/evaluations/{company}-{role-slug}.json`
2. The profile from `modes/_profile.md`
3. The full job description (from hopper)

## Process

1. Read the evaluation brief — use `relevantSystems`, `fitAssessment`, and `recommendedAngle`
2. Read the profile for base experience and skills
3. Generate a tailored resume with these rules:

### Tailoring Rules

- **Summary:** Rewrite to match the archetype. Lead with the recommended angle from the evaluation.
- **Experience:** Reorder by relevance to this posting. The most relevant system/project comes first.
- **Keywords:** Weave JD keywords into descriptions of work actually done. Never invent experience.
- **Systems built:** Translate Smoothed system names into outcome-oriented descriptions. "Trial Conversion Engine" becomes "Built an 8-stage pipeline that processes trial signups into scored, routed sales opportunities — behavioral signal extraction, ICP scoring against 7 cohorts, confidence-tiered routing."
- **Metrics:** Use real numbers from case studies (10,300 LOC, 7 ICP cohorts, 1,500+ pages analyzed, $0.04/lead pipeline cost).

### Output Format

Generate the resume as HTML (single file), suitable for PDF conversion via `generate-pdf.mjs`.

Structure:
- Name and contact info
- Tailored summary (2-3 sentences)
- Experience (reordered, keyword-enriched)
- Systems Built (selected by relevance)
- Technical Skills (matched to JD)

Save HTML to `data/artifacts/resumes/{company}-{role-slug}.html`

### Generate PDF

After saving HTML, run:
```bash
node generate-pdf.mjs data/artifacts/resumes/{company}-{role-slug}.html data/artifacts/resumes/{company}-{role-slug}.pdf --format=letter
```

## Constraints

- Single-column layout (ATS compliance)
- No images, no icons, no multi-column
- Standard fonts (system sans-serif)
- No fabrication — reframing only
