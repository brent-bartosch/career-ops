# Scan Mode

Run a scan cycle to fill the hopper with job postings.

## Quick Scan

Run a targeted scan on specific platforms:
```bash
npm run scan -- --platforms=greenhouse,lever
```

## Full Scan

Run across all platforms:
```bash
npm run scan
```

## Estimate Only

See how many queries would run without making any requests:
```bash
npm run scan:estimate
```

## After Scanning

Review results in `data/hopper/postings.json`. Postings are sorted by intent score (highest first).

To evaluate a specific posting:
```
evaluate <url>
```

To batch evaluate the top N postings:
```
batch-evaluate --top=10
```

## Adding Keywords

Edit `scrapers/query-templates.yml` to add new keywords or platforms. Changes take effect on the next scan.
