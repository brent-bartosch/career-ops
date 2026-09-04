# Invoicing

Invoice generation for Smoothed LLC consulting engagements.

## Structure

```
invoicing/
  README.md            <- this file
  invoice-template.html  <- base template (Smoothed design system)
  clients/
    ezo.yml            <- EZO client profile (billed-to, agreement refs, rate)
    cyara.yml          <- Cyara client profile (placeholder until engagement starts)
  output/              <- generated HTML + PDFs (gitignored)
```

## Workflow

1. Client details live in `clients/{client}.yml` — never hardcode in the template.
2. To generate an invoice: fill in the period/deliverables, render
   `invoice-template.html` with client + period data, then produce a PDF.
3. Naming convention: `Smoothed_Invoice_{NNNN}_{CLIENT}.pdf`
   - `NNNN` is sequential across ALL clients (0001–0003 used by EZO already)
   - `CLIENT` is the short client slug (EZO, CYARA)
4. Keep source HTML alongside the PDF in `output/`.

## Design system

Pulled from invoices 0001–0003 (see `/tmp/ezo-invoice/smoothed-invoice-001-ezo.html`
for reference until this template is populated):

- Colors: navy `#16324F`, coral `#E2453C`, teal `#2E7A6B`, ink `#1A1F26`,
  muted `#6B7480`, rule `#E1E5EA`, wash `#F6F8FA`, paper `#FFFFFF`
- Font: system sans stack (`ui-sans-serif`, `-apple-system`, etc.)
- Layout: masthead w/ wordmark → reference strip (Issued/Due/Terms/Reference) →
  billed-to + amount card → services table → remit section → footer

## Sender identity (from past invoices)

```
Smoothed LLC
5419 S Sherbourne Dr, Los Angeles, CA 90056
brent@smoothed.io · 310-743-3616
EIN 99-3181387
```

## TODO

- [ ] Populate `invoice-template.html` from invoice 0001 markup
- [ ] Confirm weeks 4 & 5 scope, amounts, acceptance dates for EZO
- [ ] Set up Cyara profile once engagement terms are known
