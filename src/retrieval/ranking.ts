import type { Observation } from '../store/types.js';

export type RetrievalLane = 'sentence' | 'chunk' | 'lexical' | 'kg';
export const DEFAULT_LANE_ORDER: RetrievalLane[] = ['sentence', 'kg', 'chunk', 'lexical'];
export const DEFAULT_LANE_WEIGHTS: Record<RetrievalLane, number> = {
  sentence: 1,
  chunk: 1,
  lexical: 1,
  kg: 0.9,
};

export interface FusionOptions {
  laneOrder?: RetrievalLane[];
  laneWeights?: Partial<Record<RetrievalLane, number>>;
  maintenance?: MaintenanceRankingMetadata;
}

export interface LaneCandidate {
  lane: RetrievalLane;
  observationId: number;
  score: number;
  /** `observation_facts` is legacy-only and must not be emitted on the default KG path. */
  source: 'raw_query' | 'hyde_answer' | 'lexical_prefix' | 'kg_triples' | 'kg_multi_hop' | 'observation_facts';
  text: string;
  chunkKey?: string | null;
  sentenceKey?: string | null;
  distance?: number;
  kg?: {
    provenance: string;
    confidence: number;
    depth?: number;
    sourceType?: string;
    superseded?: boolean;
  };
}

export interface MaintenanceConsolidationRanking {
  clusterKey: string;
  canonicalId: number;
  memberIds: number[];
  reasonClass: string;
}

export interface MaintenanceReflectionRanking {
  sourceIds: number[];
  reasonClass: string;
  boost: number;
}

export interface MaintenanceDecayRanking {
  scoreMultiplier: number;
  state: 'active' | 'attenuated' | 'suppressed';
  reasonClass: string;
}

export interface MaintenanceRankingMetadata {
  enabled: boolean;
  consolidations: Map<number, MaintenanceConsolidationRanking>;
  reflections: Map<number, MaintenanceReflectionRanking>;
  decays: Map<number, MaintenanceDecayRanking>;
}

export interface MaintenanceEvidence {
  consolidation?: MaintenanceConsolidationRanking & { suppressedSourceIds: number[] };
  reflection?: MaintenanceReflectionRanking;
  decay?: MaintenanceDecayRanking;
}

export interface HybridHit {
  observation: Observation;
  score: number;
  lanes: RetrievalLane[];
  evidence: {
    primary: LaneCandidate;
    promotedParent?: { chunkKey: string; text: string };
    byLane: Partial<Record<RetrievalLane, LaneCandidate[]>>;
    maintenance?: MaintenanceEvidence;
  };
}

export function fuseCandidates(
  observations: Map<number, Observation>,
  candidates: LaneCandidate[],
  options: FusionOptions = {},
): HybridHit[] {
  const laneOrder = resolveLaneOrder(options.laneOrder);
  const laneWeights = resolveLaneWeights(options.laneWeights);
  const maintenance = options.maintenance?.enabled === true ? options.maintenance : null;
  const laneOrderRank = laneOrder.reduce((acc, lane, index) => {
    acc[lane] = index;
    return acc;
  }, {} as Record<RetrievalLane, number>);
  const byObservation = new Map<number, LaneCandidate[]>();
  const originalCandidateIds = new Map<number, Set<number>>();
  for (const candidate of candidates) {
    const consolidation = maintenance?.consolidations.get(candidate.observationId);
    const targetObservationId = consolidation?.canonicalId ?? candidate.observationId;
    const routedCandidate = targetObservationId === candidate.observationId
      ? candidate
      : { ...candidate, observationId: targetObservationId };
    const list = byObservation.get(targetObservationId) ?? [];
    list.push(routedCandidate);
    byObservation.set(targetObservationId, list);
    const sourceIds = originalCandidateIds.get(targetObservationId) ?? new Set<number>();
    sourceIds.add(candidate.observationId);
    originalCandidateIds.set(targetObservationId, sourceIds);
  }

  const hits: HybridHit[] = [];
  for (const [observationId, laneCandidates] of byObservation.entries()) {
    const observation = observations.get(observationId);
    if (!observation) continue;
    const byLane: Partial<Record<RetrievalLane, LaneCandidate[]>> = {};
    for (const c of laneCandidates) {
      byLane[c.lane] = byLane[c.lane] ?? [];
      byLane[c.lane]!.push(c);
    }
    const laneBestCandidates = Object.entries(byLane).map(([lane, laneList]) => {
      const best = laneList.reduce((currentBest, candidate) => (
        compareCandidates(candidate, currentBest, laneOrderRank, laneWeights) < 0 ? candidate : currentBest
      ));
      return {
        lane: lane as RetrievalLane,
        candidate: best,
      };
    });
    const primary = laneBestCandidates.reduce((currentBest, entry) => (
      compareCandidates(entry.candidate, currentBest.candidate, laneOrderRank, laneWeights) < 0 ? entry : currentBest
    )).candidate;
    const lanes = Array.from(new Set(laneCandidates.map((c) => c.lane)));
    const rawScore = laneBestCandidates.reduce((total, entry) => total + (entry.candidate.score * laneWeights[entry.lane]), 0);
    const maintenanceEvidence = buildMaintenanceEvidence(observationId, originalCandidateIds, maintenance);
    const score = applyMaintenanceScore(rawScore, maintenanceEvidence);
    hits.push({
      observation,
      score,
      lanes,
      evidence: { primary, byLane, ...(maintenanceEvidence ? { maintenance: maintenanceEvidence } : {}) },
    });
  }

  return hits.sort((a, b) => compareHits(a, b, laneOrderRank));
}

function compareCandidates(
  a: LaneCandidate,
  b: LaneCandidate,
  laneOrderRank: Record<RetrievalLane, number>,
  laneWeights: Record<RetrievalLane, number>,
): number {
  const weightedA = a.score * laneWeights[a.lane];
  const weightedB = b.score * laneWeights[b.lane];
  if (weightedA !== weightedB) return weightedB - weightedA;
  const rankA = laneOrderRank[a.lane] ?? Number.MAX_SAFE_INTEGER;
  const rankB = laneOrderRank[b.lane] ?? Number.MAX_SAFE_INTEGER;
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  return a.observationId - b.observationId;
}

function compareHits(a: HybridHit, b: HybridHit, laneOrderRank: Record<RetrievalLane, number>): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.evidence.primary.lane !== b.evidence.primary.lane) {
    const rankA = laneOrderRank[a.evidence.primary.lane] ?? Number.MAX_SAFE_INTEGER;
    const rankB = laneOrderRank[b.evidence.primary.lane] ?? Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  }
  return a.observation.id - b.observation.id;
}

function buildMaintenanceEvidence(
  observationId: number,
  originalCandidateIds: Map<number, Set<number>>,
  maintenance: MaintenanceRankingMetadata | null,
): MaintenanceEvidence | undefined {
  if (!maintenance) return undefined;
  const evidence: MaintenanceEvidence = {};
  const consolidation = maintenance.consolidations.get(observationId);
  if (consolidation) {
    const sourceIds = originalCandidateIds.get(observationId) ?? new Set<number>();
    const suppressedSourceIds = [...sourceIds]
      .filter((id) => id !== consolidation.canonicalId && consolidation.memberIds.includes(id))
      .sort((a, b) => a - b);
    evidence.consolidation = { ...consolidation, suppressedSourceIds };
  }
  const reflection = maintenance.reflections.get(observationId);
  if (reflection) {
    evidence.reflection = reflection;
  }
  const decay = maintenance.decays.get(observationId);
  if (decay) {
    evidence.decay = decay;
  }
  return Object.keys(evidence).length > 0 ? evidence : undefined;
}

function applyMaintenanceScore(score: number, evidence: MaintenanceEvidence | undefined): number {
  let adjusted = score;
  if (evidence?.reflection) {
    adjusted *= evidence.reflection.boost;
  }
  if (evidence?.decay) {
    adjusted *= evidence.decay.scoreMultiplier;
  }
  return adjusted;
}

function resolveLaneOrder(laneOrder?: RetrievalLane[]): RetrievalLane[] {
  const provided = laneOrder ?? DEFAULT_LANE_ORDER;
  const seen = new Set<RetrievalLane>();
  const resolved: RetrievalLane[] = [];
  for (const lane of provided) {
    if (seen.has(lane)) continue;
    seen.add(lane);
    resolved.push(lane);
  }
  for (const lane of DEFAULT_LANE_ORDER) {
    if (seen.has(lane)) continue;
    seen.add(lane);
    resolved.push(lane);
  }
  return resolved;
}

function resolveLaneWeights(laneWeights?: Partial<Record<RetrievalLane, number>>): Record<RetrievalLane, number> {
  return {
    sentence: laneWeights?.sentence ?? DEFAULT_LANE_WEIGHTS.sentence,
    chunk: laneWeights?.chunk ?? DEFAULT_LANE_WEIGHTS.chunk,
    lexical: laneWeights?.lexical ?? DEFAULT_LANE_WEIGHTS.lexical,
    kg: laneWeights?.kg ?? DEFAULT_LANE_WEIGHTS.kg,
  };
}
