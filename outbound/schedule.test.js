import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSchedule, detectNewSignal, addBusinessDays } from './schedule.js';

test('addBusinessDays: skips weekends', () => {
  // Wed 2026-04-22 + 3 biz days = Mon 2026-04-27 (Thu, Fri, Mon)
  assert.equal(addBusinessDays('2026-04-22', 3), '2026-04-27');
  // Fri 2026-04-24 + 3 biz days = Wed 2026-04-29 (Mon, Tue, Wed)
  assert.equal(addBusinessDays('2026-04-24', 3), '2026-04-29');
});

test('computeSchedule: T0 / T+3 / T+7', () => {
  const s = computeSchedule('2026-04-22');
  assert.equal(s.t0, '2026-04-22');
  assert.equal(s.t_plus_3, '2026-04-27');
  assert.equal(s.t_plus_7, '2026-05-01'); // T+3 + 4 biz days
});

test('detectNewSignal: finds news/activity after T0', () => {
  const t0 = '2026-04-22';
  const news = [{ title: 'old launch', date: '2026-04-01' }, { title: 'new launch', date: '2026-04-24' }];
  const activity = [{ url: 'x', date: '2026-04-25' }, { url: 'y', date: '2026-04-10' }];
  const s = detectNewSignal({ t0, news, activity });
  assert.equal(s.has_new_signal, true);
  assert.ok(s.signal_source);
});

test('detectNewSignal: returns false when nothing is post-T0', () => {
  const t0 = '2026-04-22';
  const s = detectNewSignal({ t0, news: [{ title: 'old', date: '2026-04-01' }], activity: [{ url: 'x', date: '2026-04-20' }] });
  assert.equal(s.has_new_signal, false);
});
