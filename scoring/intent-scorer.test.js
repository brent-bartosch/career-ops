import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreIntent } from './intent-scorer.js';

describe('scoreIntent', () => {
  it('scores a strong builder posting high (>= 60)', () => {
    const result = scoreIntent({
      title: 'Head of Revenue Operations',
      snippet:
        'We need someone to build from scratch our revenue engine, design and implement the full GTM stack, and take an API-first approach to integration.',
    });
    assert.ok(result.score >= 60, `Expected >= 60, got ${result.score}`);
    assert.ok(result.factors.length > 0, 'Expected at least one factor');
  });

  it('scores an AI-signal posting in mid range (>= 20)', () => {
    const result = scoreIntent({
      title: 'Marketing Technologist',
      snippet:
        'Build AI-powered workflows using LLM capabilities and programmatic campaign management.',
    });
    assert.ok(result.score >= 20, `Expected >= 20, got ${result.score}`);
    assert.ok(
      result.factors.some((f) => f.includes('ai_modern_stack')),
      'Expected ai_modern_stack factor',
    );
  });

  it('scores a generic posting low (<= 20)', () => {
    const result = scoreIntent({
      title: 'Revenue Operations Analyst',
      snippet: 'Support the sales team with reporting',
    });
    assert.ok(result.score <= 20, `Expected <= 20, got ${result.score}`);
  });

  it('caps score at 100 even with many keyword matches', () => {
    const result = scoreIntent({
      title: 'founding architect',
      snippet:
        'build from scratch, 0-to-1, zero to one, greenfield, design and implement, build the function, first hire, api-first, api first',
      description:
        'build bespoke custom systems, engineering-led, data infrastructure, system design, pipeline architecture, integration architecture, technical strategy, ai-powered, llm, agentic, revops, gtm, growth',
    });
    assert.strictEqual(result.score, 100);
    assert.ok(result.factors.length > 0, 'Expected factors even when capped');
  });

  it('returns score of 0 and empty factors for no matching keywords', () => {
    const result = scoreIntent({
      title: 'Office Manager',
      snippet: 'Order supplies and coordinate schedules.',
    });
    assert.strictEqual(result.score, 0);
    assert.deepStrictEqual(result.factors, []);
  });
});
