/**
 * Multi-touch cadence + new-signal detection for follow-up flow.
 *
 * Cadence: T0 → T+3 (value-add, requires new signal) → T+7 (breakup, no signal required)
 * Business days only — weekends skipped.
 */

export function addBusinessDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

export function computeSchedule(t0) {
  const t_plus_3 = addBusinessDays(t0, 3);
  const t_plus_7 = addBusinessDays(t_plus_3, 4); // T+7 = 4 biz days after T+3
  return { t0, t_plus_3, t_plus_7 };
}

export function detectNewSignal({ t0, news = [], activity = [] }) {
  const t0Date = new Date(t0 + 'T00:00:00Z').getTime();
  const newNews = news.filter(n => new Date(n.date).getTime() > t0Date);
  const newActivity = activity.filter(a => new Date(a.date).getTime() > t0Date);

  if (newNews.length > 0) {
    return { has_new_signal: true, signal_source: `news:${newNews[0].title}`, signal_date: newNews[0].date };
  }
  if (newActivity.length > 0) {
    return { has_new_signal: true, signal_source: `activity:${newActivity[0].url}`, signal_date: newActivity[0].date };
  }
  return { has_new_signal: false, signal_source: null, signal_date: null };
}
