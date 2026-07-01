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

export interface HybridHit {
  observation: Observation;
  score: number;
  lanes: RetrievalLane[];
  evidence: {
    primary: LaneCandidate;
    promotedParent?: { chunkKey: string; text: string };
    byLane: Partial<Record<RetrievalLane, LaneCandidate[]>>;
  };
}

export function fuseCandidates(
  observations: Map<number, Observation>,
  candidates: LaneCandidate[],
  options: FusionOptions = {},
): HybridHit[] {
  const laneOrder = resolveLaneOrder(options.laneOrder);
  const laneWeights = resolveLaneWeights(options.laneWeights);
  const laneOrderRank = laneOrder.reduce((acc, lane, index) => {
    acc[lane] = index;
    return acc;
  }, {} as Record<RetrievalLane, number>);
  const byObservation = new Map<number, LaneCandidate[]>();
  for (const candidate of candidates) {
    const list = byObservation.get(candidate.observationId) ?? [];
    list.push(candidate);
    byObservation.set(candidate.observationId, list);
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
    const score = laneBestCandidates.reduce((total, entry) => total + (entry.candidate.score * laneWeights[entry.lane]), 0);
    hits.push({
      observation,
      score,
      lanes,
      evidence: { primary, byLane },
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
