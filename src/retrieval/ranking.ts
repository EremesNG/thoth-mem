import type { Observation } from '../store/types.js';

export type RetrievalLane = 'sentence' | 'chunk' | 'lexical' | 'kg';

export interface LaneCandidate {
  lane: RetrievalLane;
  observationId: number;
  score: number;
  source: 'raw_query' | 'hyde_answer' | 'lexical_prefix' | 'kg_triples' | 'observation_facts';
  text: string;
  chunkKey?: string | null;
  sentenceKey?: string | null;
  distance?: number;
  kg?: {
    provenance: string;
    confidence: number;
    sourceType?: string;
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
): HybridHit[] {
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
    const primary = [...laneCandidates].sort(compareCandidates)[0];
    const byLane: Partial<Record<RetrievalLane, LaneCandidate[]>> = {};
    for (const c of laneCandidates) {
      byLane[c.lane] = byLane[c.lane] ?? [];
      byLane[c.lane]!.push(c);
    }
    const lanes = Array.from(new Set(laneCandidates.map((c) => c.lane)));
    const score = laneCandidates.reduce((max, c) => Math.max(max, c.score), 0);
    hits.push({
      observation,
      score,
      lanes,
      evidence: { primary, byLane },
    });
  }

  return hits.sort(compareHits);
}

function compareCandidates(a: LaneCandidate, b: LaneCandidate): number {
  if (a.score !== b.score) return b.score - a.score;
  const laneWeight = { sentence: 0, chunk: 1, lexical: 2, kg: 3 };
  if (laneWeight[a.lane] !== laneWeight[b.lane]) {
    return laneWeight[a.lane] - laneWeight[b.lane];
  }
  return a.observationId - b.observationId;
}

function compareHits(a: HybridHit, b: HybridHit): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.evidence.primary.lane !== b.evidence.primary.lane) {
    const laneWeight = { sentence: 0, chunk: 1, lexical: 2, kg: 3 };
    return laneWeight[a.evidence.primary.lane] - laneWeight[b.evidence.primary.lane];
  }
  return b.observation.id - a.observation.id;
}
