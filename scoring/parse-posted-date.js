/**
 * Parse a job posting's "posted at" string into an ISO date (YYYY-MM-DD).
 * Handles relative strings like "3 days ago" as well as absolute dates.
 *
 * @param {string|null|undefined} raw - The raw date string from SERP/JD
 * @param {Date} [now=new Date()] - Reference "now" for relative math (for tests)
 * @returns {string|null} ISO date string "YYYY-MM-DD" or null if unparseable
 */
export function parsePostedDate(raw, now = new Date()) {
  if (!raw) return null;

  const s = String(raw).trim().toLowerCase();
  if (!s) return null;

  // "today" / "yesterday"
  if (s === 'today' || s === 'just now') {
    return toISODate(now);
  }
  if (s === 'yesterday') {
    return toISODate(addDays(now, -1));
  }

  // "N minutes/hours/days/weeks/months ago"
  const relativeMatch = s.match(/^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago\b/);
  if (relativeMatch) {
    const n = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const days = unit === 'minute' || unit === 'hour' ? 0
      : unit === 'day' ? n
      : unit === 'week' ? n * 7
      : unit === 'month' ? n * 30
      : n * 365;
    return toISODate(addDays(now, -days));
  }

  // ISO passthrough
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }

  // Absolute date via Date.parse — try the original-case input
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return toISODate(parsed);
  }

  return null;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}
