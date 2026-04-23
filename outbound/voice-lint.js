/**
 * Post-generation draft linter — enforces Brent's voice rules.
 * Called by draft.js after each variant is generated.
 */

const EMOJI_RE = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;

const BANNED_PHRASES = [
  'passionate about',
  'results-oriented',
  'leveraged', 'leveraging', 'leverage our',
  'spearheaded', 'spearhead',
  'facilitated',
  'synergies', 'synergy',
  'cutting-edge',
  'seamless',
  'robust',
  'rock star', 'rockstar',
  'thought leader',
  'game-changer', 'game changer',
  'move the needle',
  'circle back',
  'touch base'
];

const PRAISE_OPENERS = [
  /^great post!?/i,
  /^love this!?/i,
  /^amazing post!?/i,
  /^awesome post!?/i,
  /^nice work!?/i
];

const NAMED_TOOL_HINTS = [
  'hubspot', 'salesforce', 'apollo', 'sybill', 'quotapath', 'equals',
  'outreach', 'gong', 'clay', 'segment', 'snowflake', 'bigquery',
  'metabase', 'looker', 'tableau', 'linkedin', 'zapier', 'make',
  'langchain', 'langraph', 'langgraph', 'anthropic', 'openai',
  'openrouter', 'claude', 'gpt', 'llm', 'api'
];

export const RULES = [
  { id: 'no-emoji', label: 'No emoji' },
  { id: 'no-banned-phrases', label: 'No banned corp-speak' },
  { id: 'no-praise-opener', label: 'No generic praise opener' },
  { id: 'word-count-60-80', label: 'Word count 60-80 (body only)' },
  { id: 'anchored-specificity', label: 'Must anchor to a number or a named tool' },
  { id: 'no-trailing-cta', label: 'No multi-paragraph trailing CTA' }
];

export function lintDraft(body) {
  const failures = [];

  if (EMOJI_RE.test(body)) {
    failures.push('[no-emoji] emoji detected');
  }

  const lower = body.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      failures.push(`[no-banned-phrases] contains "${phrase}"`);
    }
  }

  const firstLine = body.trim().split(/\n/)[0].trim();
  for (const opener of PRAISE_OPENERS) {
    if (opener.test(firstLine)) {
      failures.push('[no-praise-opener] generic praise opener detected');
      break;
    }
  }

  const wordCount = bodyWordCount(body);
  if (wordCount < 60 || wordCount > 80) {
    failures.push(`[word-count-60-80] word count ${wordCount} outside [60, 80]`);
  }

  const hasNumber = /\b\d/.test(body);
  const hasNamedTool = NAMED_TOOL_HINTS.some(t => lower.includes(t));
  if (!hasNumber && !hasNamedTool) {
    failures.push('[anchored-specificity] no number and no named tool — draft is too vague');
  }

  const paragraphs = body.trim().split(/\n\s*\n/).filter(p => p.trim().length > 0);
  if (paragraphs.length > 2) {
    failures.push(`[no-trailing-cta] ${paragraphs.length} paragraphs — ask should be the last line, no trailing content`);
  }

  return { pass: failures.length === 0, failures, wordCount };
}

function bodyWordCount(body) {
  // Strip the signoff line ("Best, Brent" / "-Brent" / etc.) so lint measures the message, not the close.
  const stripped = body
    .split(/\n/)
    .filter(line => !/^(best|cheers|thanks|regards|sincerely)[,.\s-]/i.test(line.trim()))
    .filter(line => !/^-\s*brent\b/i.test(line.trim()))
    .join(' ');
  return stripped.trim().split(/\s+/).filter(Boolean).length;
}
