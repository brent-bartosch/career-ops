import { validate } from './validator.js';
import { readFile } from 'fs/promises';

export function splitDigestEntries(digestText) {
  const chunks = digestText.split(/\n##\s+/).slice(1);
  return chunks.map(chunk => {
    const titleEnd = chunk.indexOf('\n');
    const title = chunk.slice(0, titleEnd).trim();
    const body = chunk.slice(titleEnd).trim();
    const provesMatch = body.match(/\*\*Best used to prove:\*\*\s*([^\n]+)/i);
    const proves = provesMatch ? provesMatch[1].split(/[,;]/).map(s => s.trim()).filter(Boolean) : [];
    return { title, body, proves };
  });
}

export function scoreMatch(entry, bullet) {
  const bLow = bullet.toLowerCase();
  const bodyLow = (entry.title + ' ' + entry.body + ' ' + entry.proves.join(' ')).toLowerCase();

  let score = 0;
  const bTokens = bLow.match(/\b[a-z][a-z0-9+.-]{2,}\b/g) || [];
  for (const t of bTokens) {
    if (bodyLow.includes(t) && !/^(the|and|with|for|from|that|this|have|your|into|under|over)$/.test(t)) {
      score += 1;
    }
  }
  const hasNumber = /\b\d/.test(entry.body);
  const hasNamedTool = /hubspot|salesforce|apollo|sybill|quotapath|equals|outreach|gong|clay/i.test(entry.body);
  if (hasNumber) score += 2;
  if (hasNamedTool) score += 3;
  for (const prove of entry.proves) {
    const pLow = prove.toLowerCase();
    if (bTokens.some(t => pLow.includes(t))) score += 2;
  }
  return score;
}

export async function matchProofs({ digestText, profileText, jd, digestPath = 'article-digest.md', profilePath = 'modes/_profile.md' }) {
  if (!digestText || digestText.trim().length < 100) {
    return { ok: false, errors: ['HARD STOP: article-digest.md is empty or missing. Populate proof points before first outbound — outbound without proofs is noise.'] };
  }

  const entries = splitDigestEntries(digestText);
  const bullets = [...(jd.required || []), ...(jd.responsibilities || [])];

  const proofs = [];
  const usedEntries = new Set();
  const unmatched = [];

  for (const bullet of bullets) {
    const ranked = entries
      .map(entry => ({ entry, score: scoreMatch(entry, bullet) }))
      .filter(r => r.score >= 3 && !usedEntries.has(r.entry.title))
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
      unmatched.push(bullet);
      continue;
    }
    const chosen = ranked[0];
    proofs.push({
      jd_bullet: bullet,
      proof_text: chosen.entry.title + ' — ' + firstSentence(chosen.entry.body),
      source_file: digestPath,
      specificity_score: chosen.score
    });
    usedEntries.add(chosen.entry.title);
    if (proofs.length >= 5) break;
  }

  const v = validate('proof-match', { proofs });
  if (!v.ok) {
    return {
      ok: false,
      errors: [`HARD STOP: Only ${proofs.length} proof points matched JD bullets. Unmatched bullets: ${unmatched.slice(0, 5).join(' | ')}. Update article-digest.md or pick a different role.`]
    };
  }
  return { ok: true, data: { proofs } };
}

function firstSentence(body) {
  const m = body.match(/[^.\n]{30,220}\./);
  return m ? m[0].trim() : body.slice(0, 220).trim();
}

export async function loadDigestAndProfile({ digestPath = 'article-digest.md', profilePath = 'modes/_profile.md' } = {}) {
  const [digestText, profileText] = await Promise.all([
    readFile(digestPath, 'utf8').catch(() => ''),
    readFile(profilePath, 'utf8').catch(() => '')
  ]);
  return { digestText, profileText };
}
