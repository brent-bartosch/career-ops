#!/usr/bin/env node
/**
 * Private-equity lead research helpers.
 *
 * Thin wrappers over the existing credential set so I can run web search
 * (Serper), people search (Apollo), and page fetch from the terminal without
 * shelling out secrets. Loads the project `.env` via dotenv.
 *
 * Usage:
 *   node private-equity/research.mjs serper "<query>"
 *   node private-equity/research.mjs apollo "<company>" "Title A,Title B"
 *   node private-equity/research.mjs fetch "<url>"
 */
import 'dotenv/config';

const SERPER = 'https://google.serper.dev/search';
const APOLLO_BASE = 'https://api.apollo.io/api/v1';
const APOLLO_SEARCH = `${APOLLO_BASE}/mixed_people/api_search`;
const APOLLO_MATCH = `${APOLLO_BASE}/people/match`;
const APOLLO_SHOW = `${APOLLO_BASE}/people`;

async function serper(q, num = 10) {
  const res = await fetch(SERPER, {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.SERPER_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ q, num })
  });
  if (!res.ok) throw new Error(`serper ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const organic = (j.organic || []).map(r => ({
    title: r.title,
    link: r.link,
    snippet: (r.snippet || '').slice(0, 300),
    date: r.date || null
  }));
  const kb = j.answerBox ? { answer: j.answerBox.answer || j.answerBox.snippet || j.answerBox.title } : null;
  const kg = j.knowledgeGraph ? {
    title: j.knowledgeGraph.title,
    type: j.knowledgeGraph.type,
    description: j.knowledgeGraph.description,
    attributes: j.knowledgeGraph.attributes
  } : null;
  return { query: q, answerBox: kb, knowledgeGraph: kg, organic };
}

async function apolloSearch(company, titles, perPage = 10, domainOverride) {
  const params = new URLSearchParams();
  for (const t of titles.split(',').map(s => s.trim()).filter(Boolean)) {
    params.append('person_titles[]', t);
  }
  // The new api_search endpoint filters by org domain (or org id), not by name.
  const domain = domainOverride || domainFrom(company);
  params.append('q_organization_domains_list[]', domain);
  params.append('per_page', String(perPage));
  params.append('page', '1');

  const res = await fetch(`${APOLLO_SEARCH}?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
      'X-Api-Key': process.env.APOLLO_API_KEY
    }
  });
  if (res.status === 429) {
    const retry = res.headers.get('retry-after') || '60';
    throw new Error(`apollo 429 — retry after ${retry}s`);
  }
  if (!res.ok) throw new Error(`apollo ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const j = await res.json();
  const people = (j.people || []).map(p => ({
    id: p.id,
    name: p.first_name && p.last_name_obfuscated ? `${p.first_name} ${p.last_name_obfuscated}` : (p.name || p.first_name || '?'),
    first_name: p.first_name,
    title: p.title,
    organization: p.organization?.name || company,
    has_email: p.has_email
  }));
  return { company, domain, total_entries: j.total_entries, people };
}

async function apolloMatch(personId) {
  const params = new URLSearchParams();
  params.append('id', personId);
  params.append('reveal_personal_emails', 'true');

  const res = await fetch(`${APOLLO_MATCH}?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
      'X-Api-Key': process.env.APOLLO_API_KEY
    }
  });
  if (res.status === 429) {
    const retry = res.headers.get('retry-after') || '60';
    throw new Error(`apollo 429 — retry after ${retry}s`);
  }
  if (!res.ok) throw new Error(`apollo ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const j = await res.json();
  const p = j.person || {};
  return {
    id: p.id,
    name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
    title: p.title,
    linkedin_url: p.linkedin_url || null,
    email: p.email || null,
    email_status: p.email_status || null,
    city: p.city || null,
    state: p.state || null,
    organization: p.organization?.name || null
  };
}

function domainFrom(company) {
  const slug = company.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Common PE firm domain mapping — fall back to slugified guess.
  const known = {
    'marlinequitypartners': 'marlinequity.com',
    'marlin': 'marlinequity.com',
    'clearlakecapitalgroup': 'clearlake.com',
    'clearlakecapital': 'clearlake.com',
    'goresgroup': 'gores.com',
    'thegoresgroup': 'gores.com',
    'platinumequity': 'platinumequity.com',
    'kayneanderson': 'kayneanderson.com',
    'kaynepartners': 'kayneanderson.com',
    'jmiequity': 'jmi.com',
    'k1investmentmanagement': 'k1.com'
  };
  if (known[slug]) return known[slug];
  return `${slug}.com`;
}

async function fetchUrl(url) {
  const res = await fetch(url, { redirect: 'follow' });
  const text = await res.text();
  // strip tags crudely for terminal readability
  const stripped = text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { url, status: res.status, length: text.length, text: stripped.slice(0, 4000) };
}

const [, , cmd, ...rest] = process.argv;
async function main() {
  try {
    if (cmd === 'serper') {
      const q = rest.join(' ');
      console.log(JSON.stringify(await serper(q), null, 2));
    } else if (cmd === 'apollo') {
      const [company, titles, domain] = rest;
      if (!company) throw new Error('usage: apollo "<company>" "<titles>" [domain]');
      console.log(JSON.stringify(await apolloSearch(company, titles || 'Operating Partner', 10, domain), null, 2));
    } else if (cmd === 'apollo-match') {
      const [personId] = rest;
      if (!personId) throw new Error('usage: apollo-match "<person-id>"');
      console.log(JSON.stringify(await apolloMatch(personId), null, 2));
    } else if (cmd === 'match-list') {
      const ids = rest.join(' ').split(',').map(s => s.trim()).filter(Boolean);
      const out = [];
      for (const id of ids) {
        try {
          out.push(await apolloMatch(id));
        } catch (e) {
          out.push({ id, error: e.message });
        }
      }
      console.log(JSON.stringify(out, null, 2));
    } else if (cmd === 'fetch') {
      const url = rest.join(' ');
      console.log(JSON.stringify(await fetchUrl(url), null, 2));
    } else {
      console.log('usage: research.mjs <serper|apollo|apollo-match|match-list|fetch> <args>');
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
}
main();
