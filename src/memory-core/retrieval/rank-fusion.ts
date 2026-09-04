import type { LexicalQueryStage, LexicalRankFusion } from '../sqlite/fts.js';

type RankedRow = Record<string, unknown>;
type StageKind = LexicalQueryStage['kind'];

interface FusedCandidate {
  row: RankedRow;
  score: number;
  bestRank: number;
  strictRank?: number;
  relaxedRank?: number;
}

export function fuseLexicalRanks(
  lists: ReadonlyMap<StageKind, readonly RankedRow[]>,
  fusion: LexicalRankFusion,
  limit: number,
): RankedRow[] {
  const candidates = new Map<string, FusedCandidate>();
  for (const kind of ['strict', 'relaxed'] as const) {
    for (const [index, row] of (lists.get(kind) ?? []).entries()) {
      const id = String(row.id);
      const rank = index + 1;
      const candidate = candidates.get(id) ?? { row, score: 0, bestRank: rank };
      candidate.score += fusion.weights[kind] / (fusion.rankConstant + rank);
      candidate.bestRank = Math.min(candidate.bestRank, rank);
      if (kind === 'strict') candidate.strictRank = rank;
      else candidate.relaxedRank = rank;
      candidates.set(id, candidate);
    }
  }

  return [...candidates.values()]
    .sort((left, right) => right.score - left.score
      || left.bestRank - right.bestRank
      || (left.strictRank ?? Number.POSITIVE_INFINITY) - (right.strictRank ?? Number.POSITIVE_INFINITY)
      || (left.relaxedRank ?? Number.POSITIVE_INFINITY) - (right.relaxedRank ?? Number.POSITIVE_INFINITY)
      || String(right.row.created_at).localeCompare(String(left.row.created_at))
      || String(left.row.id).localeCompare(String(right.row.id)))
    .slice(0, limit)
    .map(({ row, score }) => ({ ...row, raw_score: score }));
}
