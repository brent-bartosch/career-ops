# Evaluate Mode

Evaluate a job posting from the hopper against Brent's portfolio.

## Usage

Run with a posting URL or company-role identifier:
```
evaluate <url>
evaluate <company> <role>
```

## Process

1. Load the posting from `data/hopper/postings.json` by URL or company+role match
2. Read `modes/_profile.md` for the profile
3. Read `evaluation/corpus-map.yml` to identify relevant content files
4. Read content files whose tags match the posting's archetype and requirements
5. Run the evaluation using `evaluation/evaluator.md` as the prompt
6. Save output to `data/evaluations/{company}-{role-slug}.json`
7. Print the recommendation summary

## After Evaluation

If the recommendation is `strong_apply` or `apply`:
- Generate a tailored resume: proceed to `generation/resume.md`
- Generate a tailored cover document: proceed to `generation/cover.md`
