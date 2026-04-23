import { validate } from './validator.js';
import { readFile } from 'fs/promises';
import { NAMED_TOOLS } from './jd-ingest.js';

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
  const hasNamedTool = NAMED_TOOLS.some(t => new RegExp(`\\b${t}\\b`, 'i').test(entry.body));
  if (hasNumber) score += 2;
  if (hasNamedTool) score += 3;
  for (const prove of entry.proves) {
    const pLow = prove.toLowerCase();
    if (bTokens.some(t => pLow.includes(t))) score += 2;
  }
  return score;
}

/**
 * Stage 5: match JD bullets against article-digest proof entries.
 *
 * @param {Object} opts
 * @param {string} opts.digestText - contents of article-digest.md
 * @param {string} opts.profileText - contents of modes/_profile.md. Currently not
 *   used in scoring; reserved for future archetype-weighting (see spec §13).
 * @param {Object} opts.jd - parsed JD with required[] and responsibilities[]
 * @param {string} [opts.digestPath] - source path for proof attribution
 * @param {string} [opts.profilePath] - source path (unused today)
 */
export async function matchProofs({ digestText, profileText, jd, digestPath = 'article-digest.md', profilePath = 'modes/_profile.md' }) {
  if (!digestText || digestText.trim().length < 100) {
    return { ok: false, errors: ['HARD STOP: article-digest.md is empty or missing. Populate proof points before first outbound — outbound without proofs is noise.'] };
  }

  const entries = splitDigestEntries(digestText);
  const proofEntries = entries.filter(e => e.proves.length > 0);

  if (proofEntries.length === 0) {
    return { ok: false, errors: ['HARD STOP: article-digest.md has no proof entries (entries must include "**Best used to prove:**" lines).'] };
  }

  const bullets = [...(jd.required || []), ...(jd.responsibilities || [])];

  const proofs = [];
  const usedEntries = new Set();
  const unmatched = [];

  // Threshold 3: requires either a named tool (+3), a number+token (+2+1),
  // or ≥3 distinct content-token overlaps. Prevents matching on generic verbs.
  const MIN_SCORE = 3;

  for (const bullet of bullets) {
    const ranked = proofEntries
      .map(entry => ({ entry, score: scoreMatch(entry, bullet) }))
      .filter(r => r.score >= MIN_SCORE && !usedEntries.has(r.entry.title))
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
