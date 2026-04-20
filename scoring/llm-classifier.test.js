import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPosting, buildClassifierMessages, parseClassifierResponse } from './llm-classifier.js';

const SAMPLE_POSTING = {
  company: 'Acme',
  title: 'Solutions Architect',
  location: 'San Francisco, CA',
  description: 'We are seeking a Solutions Architect to partner with our sales team and design integration architectures for enterprise customers. You will build custom integrations using our APIs and work directly with prospects during the technical evaluation phase.',
};

describe('buildClassifierMessages', () => {
  it('includes candidate archetypes and posting context in the user message', () => {
    const messages = buildClassifierMessages(SAMPLE_POSTING);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, 'system');
    assert.equal(messages[1].role, 'user');
    assert.ok(messages[1].content.includes('Acme'));
    assert.ok(messages[1].content.includes('Solutions Architect'));
    assert.ok(messages[1].content.includes('San Francisco'));
    assert.ok(messages[1].content.includes('integration architectures'));
  });

  it('instructs JSON-only output in the system message', () => {
    const messages = buildClassifierMessages(SAMPLE_POSTING);
    assert.ok(/json/i.test(messages[0].content));
  });

  it('truncates very long descriptions', () => {
    const longDesc = 'word '.repeat(10000);
    const messages = buildClassifierMessages({ ...SAMPLE_POSTING, description: longDesc });
    // Should not send 50k chars to the LLM
    assert.ok(messages[1].content.length < 20000);
  });
});

describe('parseClassifierResponse', () => {
  it('parses a valid JSON response', () => {
    const raw = JSON.stringify({
      country: 'US',
      countryConfidence: 'high',
      roleFit: 'good',
      fitScore: 75,
      fitReason: 'Matches solutions architect archetype.',
      dealBreakers: [],
    });
    const result = parseClassifierResponse(raw);
    assert.equal(result.country, 'US');
    assert.equal(result.roleFit, 'good');
    assert.equal(result.fitScore, 75);
    assert.deepEqual(result.dealBreakers, []);
  });

  it('extracts JSON from a response wrapped in markdown code fences', () => {
    const raw = '```json\n{"country":"UK","countryConfidence":"high","roleFit":"poor","fitScore":10,"fitReason":"London only.","dealBreakers":["non_us"]}\n```';
    const result = parseClassifierResponse(raw);
    assert.equal(result.country, 'UK');
    assert.equal(result.roleFit, 'poor');
  });

  it('returns null for malformed JSON', () => {
    assert.equal(parseClassifierResponse('not json at all'), null);
  });

  it('coerces fitScore to a number', () => {
    const raw = '{"country":"US","countryConfidence":"high","roleFit":"good","fitScore":"80","fitReason":"x","dealBreakers":[]}';
    const result = parseClassifierResponse(raw);
    assert.equal(typeof result.fitScore, 'number');
    assert.equal(result.fitScore, 80);
  });

  it('normalizes missing dealBreakers to empty array', () => {
    const raw = '{"country":"US","countryConfidence":"high","roleFit":"good","fitScore":80,"fitReason":"x"}';
    const result = parseClassifierResponse(raw);
    assert.deepEqual(result.dealBreakers, []);
  });
});

describe('classifyPosting', () => {
  it('calls the OpenRouter API and returns parsed classification', async () => {
    const mockResponse = {
      country: 'US',
      countryConfidence: 'high',
      roleFit: 'good',
      fitScore: 80,
      fitReason: 'Clear architect role with API integration work.',
      dealBreakers: [],
    };

    const fetchFn = async (url, opts) => {
      assert.ok(url.includes('openrouter.ai'));
      assert.equal(opts.method, 'POST');
      const body = JSON.parse(opts.body);
      assert.ok(body.model);
      assert.ok(Array.isArray(body.messages));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockResponse) } }],
        }),
      };
    };

    const result = await classifyPosting(SAMPLE_POSTING, {
      apiKey: 'test-key',
      fetchFn,
    });

    assert.equal(result.country, 'US');
    assert.equal(result.roleFit, 'good');
    assert.equal(result.fitScore, 80);
  });

  it('throws a descriptive error if API key is missing', async () => {
    await assert.rejects(
      classifyPosting(SAMPLE_POSTING, { apiKey: '', fetchFn: async () => ({}) }),
      /API key/i
    );
  });

  it('returns null when LLM response cannot be parsed', async () => {
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'the model refused to output JSON' } }],
      }),
    });
    const result = await classifyPosting(SAMPLE_POSTING, {
      apiKey: 'test-key',
      fetchFn,
    });
    assert.equal(result, null);
  });

  it('throws on non-2xx API response', async () => {
    const fetchFn = async () => ({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    });
    await assert.rejects(
      classifyPosting(SAMPLE_POSTING, { apiKey: 'test-key', fetchFn }),
      /429/
    );
  });
});
