# Job Posting Evaluation

You are evaluating a job posting against Brent's portfolio. Your job is to produce a structured evaluation brief that helps decide whether to apply and what angle to lead with.

## Inputs

You will receive:
1. The full job description text
2. The profile from `modes/_profile.md`
3. Relevant content from the corpus (system pages, case studies, worldview)

## Evaluation Output

Produce a JSON evaluation with this structure:

```json
{
  "company": "Company name",
  "role": "Role title",
  "url": "Posting URL",
  "archetypes": ["revops_gtm_leader", "solutions_architect"],
  "intentScore": 75,
  "fitAssessment": {
    "strong": ["List of strong matches between posting requirements and portfolio"],
    "partial": ["Requirements where there's related but not exact experience"],
    "gaps": ["Requirements with no obvious proof — with suggested framing"]
  },
  "relevantSystems": [
    {
      "system": "Trial Conversion Engine",
      "relevance": "Why this system maps to what they're asking for"
    }
  ],
  "relevantCaseStudies": [
    {
      "caseStudy": "Mid-Market SaaS Trial Conversion",
      "relevance": "Why this case study demonstrates the skills they want"
    }
  ],
  "recommendedAngle": "1-2 sentences: what to lead with for this specific company and role",
  "coverDocumentOutline": {
    "theirProblem": "The core problem this role is solving, stated in their language",
    "relevantBuild": "Which Smoothed system most closely matches",
    "first90Days": "What you would build or establish in the first 90 days"
  },
  "applyRecommendation": "strong_apply | apply | conditional | skip",
  "reasoning": "2-3 sentences explaining the recommendation"
}
```

## Evaluation Rules

1. Never fabricate experience. If there's a gap, say so and suggest how to frame around it.
2. Map specific systems and case studies to specific requirements — not generic "relevant experience."
3. The recommended angle should be specific to THIS company and role, not a generic pitch.
4. The cover document outline should give enough specificity that the generation step can produce a compelling one-pager.
5. "conditional" means: worth applying if a specific gap can be addressed (specify which).
6. Read the actual content files from the corpus — don't summarize from memory.
