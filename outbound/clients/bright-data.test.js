import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrightDataClient } from './bright-data.js';

function mockFetch(seq) {
  let i = 0;
  return async () => {
    const r = seq[i++];
    return {
      ok: r.status < 300,
      status: r.status,
      async json() { return r.body; }
    };
  };
}

test('BrightDataClient.getProfile: returns normalized profile', async () => {
  const fetchFn = mockFetch([{
    status: 200,
    body: [{
      full_name: 'Doug Gabbard',
      position: 'Head of Growth',
      current_company: { name: 'Delightree', title: 'Head of Growth' },
      about: 'GTM leader with multi-unit restaurant experience.',
      experience: [
        { company: 'Delightree', title: 'Head of Growth', start_date: '2024-12', end_date: null },
        { company: 'Nextbite', title: 'Sr Director', start_date: '2021-01', end_date: '2024-11' }
      ]
    }]
  }]);
  const c = new BrightDataClient({ apiKey: 'k', fetchFn });
  const p = await c.getProfile('https://linkedin.com/in/dougegabbard');
  assert.equal(p.name, 'Doug Gabbard');
  assert.equal(p.current_title, 'Head of Growth');
  assert.ok(p.about.length > 0);
  assert.equal(p.experience.length, 2);
});

test('BrightDataClient.getActivity: filters to last N days', async () => {
  const now = new Date();
  const recent = new Date(now.getTime() - 10 * 86400000).toISOString();
  const old = new Date(now.getTime() - 200 * 86400000).toISOString();
  const fetchFn = mockFetch([{
    status: 200,
    body: [
      { type: 'post', url: 'https://li/1', text: 'Recent thought.', date: recent, topic_tags: ['gtm'] },
      { type: 'comment', url: 'https://li/2', text: 'Old comment.', date: old, topic_tags: [] }
    ]
  }]);
  const c = new BrightDataClient({ apiKey: 'k', fetchFn });
  const activity = await c.getActivity('https://linkedin.com/in/dougegabbard', { sinceDays: 90 });
  assert.equal(activity.length, 1);
  assert.equal(activity[0].url, 'https://li/1');
  assert.ok(activity[0].text_snippet.length > 0);
});

test('BrightDataClient: auth error surfaces clearly', async () => {
  const fetchFn = mockFetch([{ status: 401, body: {} }]);
  const c = new BrightDataClient({ apiKey: 'bad', fetchFn });
  await assert.rejects(() => c.getProfile('x'), /BRIGHT_DATA_API_KEY/);
});
