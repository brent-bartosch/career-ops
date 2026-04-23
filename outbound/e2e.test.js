import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestJD } from './jd-ingest.js';

const RUN_E2E = process.env.OUTBOUND_E2E === '1';

test('e2e: JD ingest from paste with real-shaped Delightree JD', { skip: !RUN_E2E }, async () => {
  const jdText = `Job Summary:
Delightree is the Franchise Operating System for modern, multi-unit brands. They are seeking a GTM Engineer to build and scale systems for their go-to-market team, focusing on HubSpot and broader GTM stack.

Responsibilities:
• Own the GTM Systems Architecture
• Own HubSpot and other GTM tooling implementations (e.g., Equals, Sybill, QuotaPath)
• Build Automation & AI-Powered Workflows

Qualifications:
Required:
• 3+ years in Revenue Operations, Sales Operations, or GTM Systems in a B2B SaaS environment
• Deep, hands-on experience building and maintaining HubSpot as a system of record
• Based in Denver, CO.
Preferred:
• Hands-on experience implementing AI workflows or automation tools
• SQL or data architecture experience
`.repeat(2);

  const jd = await ingestJD({
    source: 'paste',
    text: jdText,
    company: 'Delightree',
    title: 'Manager, GTM Engineering & Revenue Systems',
    location: 'Denver, CO'
  });
  assert.equal(jd.ok, true, JSON.stringify(jd.errors));
  assert.equal(jd.data.company_name, 'Delightree');
  assert.ok(jd.data.stack.some(s => /HubSpot/i.test(s)));

  console.log('e2e: JD parsed OK.');
  console.log('  title:', jd.data.title);
  console.log('  stack:', jd.data.stack);
  console.log('  required:', jd.data.required.length, 'items');
  console.log('  Extend this test as external creds come online.');
});
