import { createHash } from 'node:crypto';

export const LEXICAL_QUERY_STRATEGY_IDS = ['all-prefix-v1', 'any-prefix-v1', 'all-then-any-prefix-v1', 'strict-selected-any-cap5-rrf-v1', 'strict-selected-any-cap5-stable-v1'] as const;
export type LexicalQueryStrategyId = (typeof LEXICAL_QUERY_STRATEGY_IDS)[number];
export const DEFAULT_LEXICAL_QUERY_STRATEGY: LexicalQueryStrategyId = 'strict-selected-any-cap5-stable-v1';

export interface LexicalQueryStage {
  kind: 'strict' | 'relaxed';
  query: string;
}

export interface LexicalQueryPlan {
  strategyId: LexicalQueryStrategyId;
  configHash: string;
  planHash: string;
  maxLexicalResults: number | null;
  maxStageResults?: number;
  fusion?: LexicalRankFusion;
  ranker?: 'fixed-field-tf-v1';
  cohorts?: 'monotonic-import-v1';
  stages: LexicalQueryStage[];
}

export interface LexicalRankFusion {
  kind: 'rrf-v1';
  rankConstant: number;
  weights: Readonly<Record<LexicalQueryStage['kind'], number>>;
}

const E0_STRATEGY_ID: LexicalQueryStrategyId = 'strict-selected-any-cap5-rrf-v1';
export const STABLE_LEXICAL_QUERY_STRATEGY: LexicalQueryStrategyId = 'strict-selected-any-cap5-stable-v1';
const E0_FUSION = Object.freeze({
  kind: 'rrf-v1',
  rankConstant: 60,
  weights: Object.freeze({ strict: 1, relaxed: 1 }),
} satisfies LexicalRankFusion);

const STRATEGY_CONFIGS = Object.freeze({
  'all-prefix-v1': Object.freeze({ tokenizer: 'legacy-v1', deduplicate: false, stages: ['AND'], maxLexicalResults: null }),
  'any-prefix-v1': Object.freeze({ tokenizer: 'candidate-v1', deduplicate: true, selection: 'longest-v1', maxInputTerms: 32, maxQueryTerms: 3, stages: ['OR'], maxLexicalResults: 2 }),
  'all-then-any-prefix-v1': Object.freeze({ tokenizer: 'legacy-v1+candidate-v1', deduplicate: 'relaxed-only', stages: ['AND', 'OR-fill'], maxLexicalResults: null }),
  [E0_STRATEGY_ID]: Object.freeze({
    tokenizer: 'legacy-v1+candidate-v1',
    deduplicate: 'relaxed-only',
    selection: 'longest-v1',
    maxInputTerms: 32,
    maxQueryTerms: 3,
    stages: ['AND', 'OR-independent'],
    maxStageResults: 5,
    maxLexicalResults: 5,
    fusion: E0_FUSION,
  }),
  [STABLE_LEXICAL_QUERY_STRATEGY]: Object.freeze({
    tokenizer: 'legacy-v1+candidate-v1',
    deduplicate: 'relaxed-only',
    selection: 'longest-v1',
    maxInputTerms: 32,
    maxQueryTerms: 3,
    stages: ['AND', 'OR-independent'],
    maxStageResults: 5,
    maxLexicalResults: 5,
    fusion: E0_FUSION,
    ranker: 'fixed-field-tf-v1',
    cohorts: 'monotonic-import-v1',
  }),
} satisfies Record<LexicalQueryStrategyId, Readonly<Record<string, unknown>>>);

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function tokenize(input: string, deduplicate: boolean, maxTerms = 12): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const match of input.normalize('NFKC').matchAll(/"([^"\r\n]{2,})"|[\p{L}\p{N}_]{2,}/gu)) {
    const phrase = match[1]?.match(/[\p{L}\p{N}_]{2,}/gu)?.slice(0, 8);
    const term = phrase?.length
      ? `"${phrase.join(' ')}"`
      : match[0] && !match[0].startsWith('"')
        ? `"${match[0]}"*`
        : null;
    if (!term) continue;
    const identity = term.toLowerCase();
    if (deduplicate && seen.has(identity)) continue;
    seen.add(identity);
    terms.push(term);
    if (terms.length === maxTerms) break;
  }
  return terms;
}

function selectLongestTerms(terms: string[], limit: number): string[] {
  const selected = new Set(terms
    .map((term, index) => ({ index, length: Array.from(term).length }))
    .sort((left, right) => right.length - left.length || left.index - right.index)
    .slice(0, limit)
    .map(({ index }) => index));
  return terms.filter((_, index) => selected.has(index));
}

export function buildFtsQueryPlan(input: string, strategyId: LexicalQueryStrategyId = DEFAULT_LEXICAL_QUERY_STRATEGY): LexicalQueryPlan | null {
  if (!LEXICAL_QUERY_STRATEGY_IDS.includes(strategyId)) throw new Error(`Unsupported lexical query strategy: ${strategyId}`);
  const controlTerms = tokenize(input, false);
  if (controlTerms.length === 0) return null;
  const selectsCandidateTerms = strategyId === 'any-prefix-v1' || strategyId === E0_STRATEGY_ID || strategyId === STABLE_LEXICAL_QUERY_STRATEGY;
  const candidateTermPool = tokenize(input, true, selectsCandidateTerms ? 32 : 12);
  const candidateTerms = selectsCandidateTerms ? selectLongestTerms(candidateTermPool, 3) : candidateTermPool;
  const strictQuery = controlTerms.join(' AND ');
  const relaxedQuery = candidateTerms.join(' OR ');
  const stages: LexicalQueryStage[] = strategyId === 'all-prefix-v1'
    ? [{ kind: 'strict', query: strictQuery }]
    : strategyId === 'any-prefix-v1'
      ? [{ kind: 'relaxed', query: relaxedQuery }]
      : strategyId === E0_STRATEGY_ID || strategyId === STABLE_LEXICAL_QUERY_STRATEGY
        ? [{ kind: 'strict', query: strictQuery }, { kind: 'relaxed', query: relaxedQuery }]
        : strictQuery === relaxedQuery
          ? [{ kind: 'strict', query: strictQuery }]
          : [{ kind: 'strict', query: strictQuery }, { kind: 'relaxed', query: relaxedQuery }];
  const configHash = hash(STRATEGY_CONFIGS[strategyId]);
  const maxLexicalResults = STRATEGY_CONFIGS[strategyId].maxLexicalResults;
  if (strategyId === E0_STRATEGY_ID) {
    const maxStageResults = 5;
    const planIdentity = { strategyId, configHash, stages, maxStageResults, maxLexicalResults, fusion: E0_FUSION };
    return { ...planIdentity, planHash: hash(planIdentity) };
  }
  if (strategyId === STABLE_LEXICAL_QUERY_STRATEGY) {
    const maxStageResults = 5;
    const ranker = 'fixed-field-tf-v1' as const;
    const cohorts = 'monotonic-import-v1' as const;
    const planIdentity = { strategyId, configHash, stages, maxStageResults, maxLexicalResults, fusion: E0_FUSION, ranker, cohorts };
    return { ...planIdentity, planHash: hash(planIdentity) };
  }
  return { strategyId, configHash, planHash: hash({ strategyId, configHash, stages }), maxLexicalResults, stages };
}

export function buildFtsQuery(input: string): string | null {
  return buildFtsQueryPlan(input, 'all-prefix-v1')?.stages[0]?.query ?? null;
}

export function surgicalSnippetWithMetrics(content: string, query: string, budget: number): { snippet: string; tokenChecks: number } {
  const safeBudget = Math.max(32, budget);
  if (content.length <= safeBudget) return { snippet: content, tokenChecks: 0 };
  const tokens = query.toLocaleLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? [];
  const lower = content.toLocaleLowerCase();
  let position = 0;
  let tokenChecks = 0;
  for (const token of tokens) {
    tokenChecks += 1;
    const index = lower.indexOf(token);
    if (index >= 0) {
      position = index;
      break;
    }
  }
  const start = Math.max(0, Math.min(position - Math.floor(safeBudget / 3), content.length - safeBudget));
  return { snippet: `${start > 0 ? '…' : ''}${content.slice(start, start + safeBudget - 2)}${start + safeBudget < content.length ? '…' : ''}`, tokenChecks };
}

export function surgicalSnippet(content: string, query: string, budget: number): string {
  return surgicalSnippetWithMetrics(content, query, budget).snippet;
}
