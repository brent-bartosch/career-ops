import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { matchArchetypes } from './archetype-matcher.js';

describe('matchArchetypes', () => {
  it('matches a RevOps title', () => {
    const result = matchArchetypes({
      title: 'Director of Revenue Operations',
      snippet: 'Looking for an experienced leader.',
    });
    assert.ok(result.includes('revops_gtm_leader'));
  });

  it('matches a Solutions Architect title', () => {
    const result = matchArchetypes({
      title: 'Senior Solutions Architect',
      snippet: 'Join our growing team.',
    });
    assert.ok(result.includes('solutions_architect'));
  });

  it('matches a Marketing Ops title', () => {
    const result = matchArchetypes({
      title: 'Marketing Operations Manager',
      snippet: 'We need someone to run campaigns.',
    });
    assert.ok(result.includes('marketing_ops'));
  });

  it('can match multiple archetypes when signals overlap', () => {
    const result = matchArchetypes({
      title: 'GTM Operations Lead',
      snippet:
        'Responsible for pipeline forecasting, martech stack optimization, automation, and attribution modeling across the revenue org.',
    });
    assert.ok(result.includes('revops_gtm_leader'));
    assert.ok(result.includes('marketing_ops'));
    assert.ok(result.length >= 2);
  });

  it('returns empty array when nothing matches', () => {
    const result = matchArchetypes({
      title: 'Senior Accountant',
      snippet: 'Manage financial reporting and audits.',
    });
    assert.deepStrictEqual(result, []);
  });

  it('handles missing title and snippet gracefully', () => {
    const result = matchArchetypes({ title: '', snippet: '' });
    assert.deepStrictEqual(result, []);
  });

  it('matches via responsibility keywords in snippet (no title match)', () => {
    const result = matchArchetypes({
      title: 'Operations Manager',
      snippet:
        'You will own pipeline management, funnel optimization, and forecasting for our revenue team.',
    });
    assert.ok(result.includes('revops_gtm_leader'));
  });

  it('does not match with only 1 responsibility keyword', () => {
    const result = matchArchetypes({
      title: 'Operations Manager',
      snippet: 'You will own pipeline management for the team.',
    });
    assert.ok(!result.includes('revops_gtm_leader'));
  });
});

test('matchArchetypes: tags gtm_engineer on a GTM engineer title', () => {
  const matched = matchArchetypes({ title: 'GTM Engineer', snippet: 'build outbound automation in Clay' });
  assert.ok(matched.includes('gtm_engineer'));
});

test('matchArchetypes: tags head_of_gtm on a Head of GTM title', () => {
  const matched = matchArchetypes({ title: 'Head of GTM', snippet: 'own go-to-market strategy and pipeline' });
  assert.ok(matched.includes('head_of_gtm'));
});

test('matchArchetypes: gtm_engineer via responsibility keywords without exact title', () => {
  const matched = matchArchetypes({
    title: 'Growth Systems Lead',
    snippet: 'build the gtm stack with api integration and workflow automation',
  });
  assert.ok(matched.includes('gtm_engineer'));
});
