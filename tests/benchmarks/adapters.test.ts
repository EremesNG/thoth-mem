import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { describeLane } from '../../benchmarks/adapters.mjs';

describe('benchmark adapter manifest', () => {
  it('names every required external lane or reports bounded unavailability', () => {
    const manifest = JSON.parse(readFileSync('benchmarks/manifest.json', 'utf8')) as { lanes: Array<{ id: string; available: boolean; reason?: string }> };
    expect(manifest.lanes.map((lane) => lane.id)).toEqual(['fixture-lexical','longmemeval-s','locomo','amb-beam-100k','amb-beam-1m','amb-personamem-32k','amb-personamem-1m','sdebench']);
    for (const lane of manifest.lanes.filter((item) => !item.available)) expect(lane.reason).toMatch(/^[a-z_]{3,64}$/);
  });

  it('assigns each required lane its versioned deterministic metric contract', () => {
    const manifest = JSON.parse(readFileSync('benchmarks/manifest.json', 'utf8')) as { lanes: Array<{ id: string; available: boolean; reason?: string }> };
    const contracts = manifest.lanes.map(describeLane);
    expect(contracts.map((lane) => [lane.id, lane.adapter, lane.metrics])).toEqual([
      ['fixture-lexical', 'fixture@1', ['retrieval.mrr', 'retrieval.recall_at_1', 'retrieval.hit_at_k']],
      ['longmemeval-s', 'longmemeval-s@1', ['retrieval.mrr', 'retrieval.recall_at_1', 'answer.exact_match']],
      ['locomo', 'locomo-deterministic@1', ['answer.exact_match', 'answer.f1']],
      ['amb-beam-100k', 'amb-beam@1', ['retrieval.mrr', 'evidence.recall']],
      ['amb-beam-1m', 'amb-beam@1', ['retrieval.mrr', 'evidence.recall']],
      ['amb-personamem-32k', 'amb-personamem@1', ['answer.exact_match', 'evidence.provenance_coverage']],
      ['amb-personamem-1m', 'amb-personamem@1', ['answer.exact_match', 'evidence.provenance_coverage']],
      ['sdebench', 'sdebench-hidden@1', ['agent.hidden_test_success']],
    ]);
    for (const lane of contracts.filter((item) => !item.available)) expect(lane.unavailable).toEqual({ id: lane.id, reason: expect.stringMatching(/^[a-z_]{3,64}$/) });
  });
});
