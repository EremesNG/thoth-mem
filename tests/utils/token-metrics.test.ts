import { describe, expect, it } from 'vitest';
import {
  buildPayloadMetrics,
  countChars,
  estimateTokensFromChars,
} from '../../src/utils/token-metrics.js';

describe('token metric utility', () => {
  it('counts payload chars and deterministic estimated tokens with explicit basis', () => {
    const metrics = buildPayloadMetrics({
      request: { query: 'compact evidence' },
      response: { content: [{ type: 'text', text: 'short answer' }] },
      fullChars: 400,
      evidenceChars: 80,
      returnedChars: 40,
      evidenceObservationIds: [3, 2, 3],
    });

    expect(countChars('abcd')).toBe(4);
    expect(estimateTokensFromChars(5)).toBe(2);
    expect(metrics).toMatchObject({
      schema_version: 1,
      full_chars: 400,
      evidence_chars: 80,
      returned_chars: 40,
      saved_chars: 360,
      compression_ratio: 0.9,
      token_basis: 'estimated_chars_div_4',
      evidence_observation_ids: [2, 3],
    });
    expect(metrics.estimated_tokens).toMatchObject({
      full: 100,
      evidence: 20,
      returned: 10,
    });
    expect(metrics.exact_tokens).toBeUndefined();
  });
});
