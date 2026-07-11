export const COMMUNITY_ROLLOUT_MIN_COMMUNITIES = 1;
export const COMMUNITY_ROLLOUT_MIN_KG_TRIPLES = 1;
export const COMMUNITY_ROLLOUT_MIN_SOURCE_OBSERVATIONS = 1;
export const COMMUNITY_ROLLOUT_MIN_COMMUNITY_SOURCE_OBSERVATIONS = 1;
export const COMMUNITY_ROLLOUT_MIN_COMMUNITY_ENTITY_COUNT = 1;
export const COMMUNITY_ROLLOUT_MIN_COMMUNITY_TRIPLE_COUNT = 1;
export const COMMUNITY_ROLLOUT_MIN_SOURCE_ATTRIBUTION_RATE = 1;
export const COMMUNITY_ROLLOUT_RECALL_REGRESSION_TOLERANCE = 0;
export const COMMUNITY_ROLLOUT_RANK_REGRESSION_TOLERANCE = 0;
export const COMMUNITY_ROLLOUT_TOKEN_RETURNED_CHARS_REGRESSION_TOLERANCE = 0;
export const COMMUNITY_ROLLOUT_TOKEN_EVIDENCE_CHARS_REGRESSION_TOLERANCE = 0;

export type CommunityRolloutGateObserved = number | string | boolean | null;
export type CommunityRolloutFallbackMarker =
  | 'kg_communities_missing'
  | 'kg_communities_stale'
  | 'kg_communities_rebuilding'
  | 'kg_communities_failed'
  | 'kg_communities_empty'
  | 'kg_communities_degraded'
  | 'kg_communities_ineligible_coverage'
  | 'kg_communities_ineligible_signature';

export interface CommunityRolloutGateResult {
  name: string;
  passed: boolean;
  threshold: CommunityRolloutGateObserved;
  observed: CommunityRolloutGateObserved;
  reason?: string;
}

export interface CommunityReadPathEligibilityState {
  state: 'disabled' | 'missing' | 'fresh' | 'stale' | 'rebuilding' | 'failed' | 'empty' | 'degraded';
  run_id: number | null;
  latest_committed_run_id: number | null;
  graph_signature: string | null;
  current_graph_signature: string | null;
  communities_count: number;
  triples_count: number;
  source_observations_count: number;
  degraded: boolean;
  degraded_reasons: string[];
}

export interface CommunityReadPathEligibilityCandidate {
  entity_count: number;
  triple_count: number;
  source_observation_count: number;
  source_observation_ids: number[];
  degraded: boolean;
  degraded_reasons: string[];
}

export interface CommunityReadPathEligibilityInput {
  readPathEnabled: boolean;
  state: CommunityReadPathEligibilityState;
  candidates: CommunityReadPathEligibilityCandidate[];
}

export interface CommunityReadPathEligibilityResult {
  eligible: boolean;
  gates: CommunityRolloutGateResult[];
  degradedFallbackMarker?: CommunityRolloutFallbackMarker;
}

export interface CommunityRolloutEvalGate {
  name: string;
  passed: boolean;
  threshold: CommunityRolloutGateObserved;
  observed_disabled?: CommunityRolloutGateObserved;
  observed_enabled: CommunityRolloutGateObserved;
  category?: 'coverage' | 'same_corpus_ab' | 'p4_token_savings' | 'readiness' | 'fallback_state' | 'lane_ranking';
  scope?: 'same_corpus_ab' | 'project_readiness' | 'fallback_proof' | 'zero_regression';
  project?: string;
  corpus?: string;
  query_set?: string;
  retrieval_limit?: number;
  community_budget?: number;
  baseline_hit_count?: number;
  source_attributed_baseline_hit_count?: number;
}

function coverageGate(name: string, observed: number, threshold: number): CommunityRolloutGateResult {
  return {
    name,
    passed: observed >= threshold,
    threshold,
    observed,
  };
}

function stateFallbackMarker(state: CommunityReadPathEligibilityState): CommunityRolloutFallbackMarker | undefined {
  if (state.state === 'missing') return 'kg_communities_missing';
  if (state.state === 'stale') return 'kg_communities_stale';
  if (state.state === 'rebuilding') return 'kg_communities_rebuilding';
  if (state.state === 'failed') return 'kg_communities_failed';
  if (state.state === 'empty') return 'kg_communities_empty';
  if (state.degraded || state.degraded_reasons.length > 0 || state.state === 'degraded') {
    return 'kg_communities_degraded';
  }
  return undefined;
}

export function evaluateCommunityReadPathEligibility(
  input: CommunityReadPathEligibilityInput,
): CommunityReadPathEligibilityResult {
  const candidateSourceObservationCount = input.candidates.reduce(
    (sum, candidate) => sum + candidate.source_observation_count,
    0,
  );
  const candidateEntityCount = input.candidates.reduce(
    (sum, candidate) => sum + candidate.entity_count,
    0,
  );
  const candidateTripleCount = input.candidates.reduce(
    (sum, candidate) => sum + candidate.triple_count,
    0,
  );
  const sourceAttributionRate = input.candidates.length === 0
    ? 0
    : input.candidates.filter((candidate) => candidate.source_observation_ids.length > 0).length / input.candidates.length;
  const gates: CommunityRolloutGateResult[] = [
    {
      name: 'community_read_path_explicit_opt_in',
      passed: input.readPathEnabled,
      threshold: true,
      observed: input.readPathEnabled,
    },
    {
      name: 'community_state_fresh',
      passed: input.state.state === 'fresh',
      threshold: 'fresh',
      observed: input.state.state,
    },
    {
      name: 'community_run_committed_current',
      passed: input.state.run_id !== null && input.state.run_id === input.state.latest_committed_run_id,
      threshold: input.state.latest_committed_run_id,
      observed: input.state.run_id,
    },
    {
      name: 'community_graph_signature_current',
      passed: input.state.graph_signature !== null && input.state.graph_signature === input.state.current_graph_signature,
      threshold: input.state.current_graph_signature,
      observed: input.state.graph_signature,
    },
    {
      name: 'community_not_degraded',
      passed: !input.state.degraded && input.state.degraded_reasons.length === 0,
      threshold: false,
      observed: input.state.degraded || input.state.degraded_reasons.length > 0,
    },
    coverageGate('COMMUNITY_ROLLOUT_MIN_COMMUNITIES', input.state.communities_count, COMMUNITY_ROLLOUT_MIN_COMMUNITIES),
    coverageGate('COMMUNITY_ROLLOUT_MIN_KG_TRIPLES', input.state.triples_count, COMMUNITY_ROLLOUT_MIN_KG_TRIPLES),
    coverageGate(
      'COMMUNITY_ROLLOUT_MIN_SOURCE_OBSERVATIONS',
      input.state.source_observations_count,
      COMMUNITY_ROLLOUT_MIN_SOURCE_OBSERVATIONS,
    ),
    coverageGate(
      'COMMUNITY_ROLLOUT_MIN_COMMUNITY_SOURCE_OBSERVATIONS',
      candidateSourceObservationCount,
      COMMUNITY_ROLLOUT_MIN_COMMUNITY_SOURCE_OBSERVATIONS,
    ),
    coverageGate(
      'COMMUNITY_ROLLOUT_MIN_COMMUNITY_ENTITY_COUNT',
      candidateEntityCount,
      COMMUNITY_ROLLOUT_MIN_COMMUNITY_ENTITY_COUNT,
    ),
    coverageGate(
      'COMMUNITY_ROLLOUT_MIN_COMMUNITY_TRIPLE_COUNT',
      candidateTripleCount,
      COMMUNITY_ROLLOUT_MIN_COMMUNITY_TRIPLE_COUNT,
    ),
    coverageGate(
      'COMMUNITY_ROLLOUT_MIN_SOURCE_ATTRIBUTION_RATE',
      sourceAttributionRate,
      COMMUNITY_ROLLOUT_MIN_SOURCE_ATTRIBUTION_RATE,
    ),
  ];
  const eligible = gates.every((gate) => gate.passed);
  const coverageFailed = gates.some((gate) =>
    gate.name.startsWith('COMMUNITY_ROLLOUT_MIN_') && !gate.passed
  );
  const signatureFailed = gates.some((gate) =>
    (gate.name === 'community_run_committed_current' || gate.name === 'community_graph_signature_current') && !gate.passed
  );

  return {
    eligible,
    gates,
    degradedFallbackMarker: eligible
      ? undefined
      : stateFallbackMarker(input.state)
        ?? (signatureFailed ? 'kg_communities_ineligible_signature' : undefined)
        ?? (coverageFailed ? 'kg_communities_ineligible_coverage' : undefined),
  };
}

export function buildCommunityRolloutEvalGates(input: {
  communities: number;
  kgTriples: number;
  sourceObservations: number;
  communitySourceObservations: number;
  communityEntityCount: number;
  communityTripleCount: number;
  sourceAttributionRate: number;
  disabledReturnedChars: number;
  enabledReturnedChars: number;
  disabledEvidenceChars: number;
  enabledEvidenceChars: number;
  metadata?: Pick<
    CommunityRolloutEvalGate,
    'scope' | 'project' | 'corpus' | 'query_set' | 'retrieval_limit' | 'community_budget'
  >;
}): CommunityRolloutEvalGate[] {
  const metadata = input.metadata ?? {};
  return [
    {
      name: 'COMMUNITY_ROLLOUT_MIN_COMMUNITIES',
      threshold: COMMUNITY_ROLLOUT_MIN_COMMUNITIES,
      observed_enabled: input.communities,
      passed: input.communities >= COMMUNITY_ROLLOUT_MIN_COMMUNITIES,
      category: 'coverage',
      ...metadata,
    },
    {
      name: 'COMMUNITY_ROLLOUT_MIN_KG_TRIPLES',
      threshold: COMMUNITY_ROLLOUT_MIN_KG_TRIPLES,
      observed_enabled: input.kgTriples,
      passed: input.kgTriples >= COMMUNITY_ROLLOUT_MIN_KG_TRIPLES,
      category: 'coverage',
      ...metadata,
    },
    {
      name: 'COMMUNITY_ROLLOUT_MIN_SOURCE_OBSERVATIONS',
      threshold: COMMUNITY_ROLLOUT_MIN_SOURCE_OBSERVATIONS,
      observed_enabled: input.sourceObservations,
      passed: input.sourceObservations >= COMMUNITY_ROLLOUT_MIN_SOURCE_OBSERVATIONS,
      category: 'coverage',
      ...metadata,
    },
    {
      name: 'COMMUNITY_ROLLOUT_MIN_COMMUNITY_SOURCE_OBSERVATIONS',
      threshold: COMMUNITY_ROLLOUT_MIN_COMMUNITY_SOURCE_OBSERVATIONS,
      observed_enabled: input.communitySourceObservations,
      passed: input.communitySourceObservations >= COMMUNITY_ROLLOUT_MIN_COMMUNITY_SOURCE_OBSERVATIONS,
      category: 'coverage',
      ...metadata,
    },
    {
      name: 'COMMUNITY_ROLLOUT_MIN_COMMUNITY_ENTITY_COUNT',
      threshold: COMMUNITY_ROLLOUT_MIN_COMMUNITY_ENTITY_COUNT,
      observed_enabled: input.communityEntityCount,
      passed: input.communityEntityCount >= COMMUNITY_ROLLOUT_MIN_COMMUNITY_ENTITY_COUNT,
      category: 'coverage',
      ...metadata,
    },
    {
      name: 'COMMUNITY_ROLLOUT_MIN_COMMUNITY_TRIPLE_COUNT',
      threshold: COMMUNITY_ROLLOUT_MIN_COMMUNITY_TRIPLE_COUNT,
      observed_enabled: input.communityTripleCount,
      passed: input.communityTripleCount >= COMMUNITY_ROLLOUT_MIN_COMMUNITY_TRIPLE_COUNT,
      category: 'coverage',
      ...metadata,
    },
    {
      name: 'COMMUNITY_ROLLOUT_MIN_SOURCE_ATTRIBUTION_RATE',
      threshold: COMMUNITY_ROLLOUT_MIN_SOURCE_ATTRIBUTION_RATE,
      observed_enabled: input.sourceAttributionRate,
      passed: input.sourceAttributionRate >= COMMUNITY_ROLLOUT_MIN_SOURCE_ATTRIBUTION_RATE,
      category: 'coverage',
      ...metadata,
    },
    {
      name: 'COMMUNITY_ROLLOUT_TOKEN_RETURNED_CHARS_REGRESSION_TOLERANCE',
      threshold: COMMUNITY_ROLLOUT_TOKEN_RETURNED_CHARS_REGRESSION_TOLERANCE,
      observed_disabled: input.disabledReturnedChars,
      observed_enabled: input.enabledReturnedChars,
      passed: input.enabledReturnedChars - input.disabledReturnedChars
        <= COMMUNITY_ROLLOUT_TOKEN_RETURNED_CHARS_REGRESSION_TOLERANCE,
      category: 'p4_token_savings',
      ...metadata,
    },
    {
      name: 'COMMUNITY_ROLLOUT_TOKEN_EVIDENCE_CHARS_REGRESSION_TOLERANCE',
      threshold: COMMUNITY_ROLLOUT_TOKEN_EVIDENCE_CHARS_REGRESSION_TOLERANCE,
      observed_disabled: input.disabledEvidenceChars,
      observed_enabled: input.enabledEvidenceChars,
      passed: input.enabledEvidenceChars - input.disabledEvidenceChars
        <= COMMUNITY_ROLLOUT_TOKEN_EVIDENCE_CHARS_REGRESSION_TOLERANCE,
      category: 'p4_token_savings',
      ...metadata,
    },
  ];
}
