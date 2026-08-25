const CONTRACTS = {
  'fixture-lexical': ['fixture@1', ['retrieval.mrr', 'retrieval.recall_at_1', 'retrieval.hit_at_k']],
  'longmemeval-s': ['longmemeval-s@1', ['retrieval.mrr', 'retrieval.recall_at_1', 'answer.exact_match']],
  locomo: ['locomo-deterministic@1', ['answer.exact_match', 'answer.f1']],
  'amb-beam-100k': ['amb-beam@1', ['retrieval.mrr', 'evidence.recall']],
  'amb-beam-1m': ['amb-beam@1', ['retrieval.mrr', 'evidence.recall']],
  'amb-personamem-32k': ['amb-personamem@1', ['answer.exact_match', 'evidence.provenance_coverage']],
  'amb-personamem-1m': ['amb-personamem@1', ['answer.exact_match', 'evidence.provenance_coverage']],
  sdebench: ['sdebench-hidden@1', ['agent.hidden_test_success']],
};

export function describeLane(lane) {
  const contract = CONTRACTS[lane?.id];
  if (!contract) throw new Error(`Unknown benchmark lane: ${String(lane?.id).slice(0, 64)}`);
  const [adapter, metrics] = contract;
  return {
    id: lane.id,
    adapter,
    metrics,
    available: lane.available === true,
    ...(lane.available === true ? {} : { unavailable: { id: lane.id, reason: lane.reason } }),
  };
}
