const FIELD_WEIGHTS = Object.freeze({ title: 8, topic: 4, content: 1 });
const PHRASE_WEIGHTS = Object.freeze({ title: 24, topic: 12, content: 4 });
const MAX_TERMS = 32;
const DEFAULT_CACHE_CAPACITY = 1_024;
const ASCII_TEXT = /^[\x00-\x7f]*$/u;
const ASCII_CASE_PROBE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ASCII_TOKENS = /[a-z0-9_]{2,}/g;
const UNICODE_TOKENS = /[\p{L}\p{N}_]{2,}/gu;

interface CompiledQuery {
  readonly raw: string;
  readonly phrase: string;
  readonly terms: ReadonlyArray<{ value: string; specificity: number }>;
  readonly prefixBuckets: ReadonlyMap<string, readonly number[]>;
}

export type StableLexicalRankWorkEvent = Readonly<{
  kind: 'query_compiled' | 'field_normalized' | 'cache_hit' | 'cache_miss' | 'cache_skipped';
}>;

export interface StableLexicalRanker {
  beginQuery(query: string): void;
  rank(query: string, memoryId: string, title: string, content: string, topicKey: string): number;
}

interface StableLexicalRankerOptions {
  cacheCapacity?: number;
  observe?: (event: StableLexicalRankWorkEvent) => void;
}

function localePreservesAsciiLowercase(): boolean {
  return ASCII_CASE_PROBE.toLocaleLowerCase() === ASCII_CASE_PROBE.toLowerCase();
}

function normalize(value: string, useAsciiFastPath: boolean): string {
  return useAsciiFastPath && ASCII_TEXT.test(value) ? value.toLowerCase() : value.normalize('NFKC').toLocaleLowerCase();
}

function normalizedTokens(value: string): string[] {
  return value.match(ASCII_TEXT.test(value) ? ASCII_TOKENS : UNICODE_TOKENS) ?? [];
}

function compileQuery(query: string, useAsciiFastPath: boolean): CompiledQuery {
  const normalized = normalize(query, useAsciiFastPath);
  const values = [...new Set(normalizedTokens(normalized).slice(0, MAX_TERMS))];
  const prefixBuckets = new Map<string, number[]>();
  const terms = values.map((value, termIndex) => {
    const bucket = prefixBuckets.get(value[0]!) ?? [];
    bucket.push(termIndex);
    prefixBuckets.set(value[0]!, bucket);
    return { value, specificity: Math.min(Array.from(value).length, 12) / 4 };
  });
  return { raw: query, phrase: normalized.trim(), terms, prefixBuckets };
}

function prefixFrequencies(compiled: CompiledQuery, fieldTerms: readonly string[]): Uint32Array {
  const frequencies = new Uint32Array(compiled.terms.length);
  for (const candidate of fieldTerms) {
    for (const termIndex of compiled.prefixBuckets.get(candidate[0]!) ?? []) {
      if (candidate.startsWith(compiled.terms[termIndex]!.value)) frequencies[termIndex] += 1;
    }
  }
  return frequencies;
}

function fieldScore(compiled: CompiledQuery, value: string, weight: number, phraseWeight: number, useAsciiFastPath: boolean, observe?: (event: StableLexicalRankWorkEvent) => void): number {
  const normalized = normalize(value, useAsciiFastPath);
  observe?.({ kind: 'field_normalized' });
  const tokenSource = useAsciiFastPath && ASCII_TEXT.test(normalized) ? normalized : normalize(normalized, useAsciiFastPath);
  const fieldTerms = normalizedTokens(tokenSource);
  const lengthNormalization = 1 + Math.log1p(Math.max(0, fieldTerms.length - 8)) / 4;
  let score = compiled.phrase && normalized.includes(compiled.phrase) ? phraseWeight : 0;
  const frequencies = prefixFrequencies(compiled, fieldTerms);
  for (const [termIndex, term] of compiled.terms.entries()) {
    const frequency = frequencies[termIndex];
    if (frequency === 0) continue;
    const saturation = frequency / (frequency + 1);
    score += weight * saturation * term.specificity / lengthNormalization;
  }
  return score;
}

function scoreCompiled(compiled: CompiledQuery, title: string, content: string, topicKey: string, useAsciiFastPath: boolean, observe?: (event: StableLexicalRankWorkEvent) => void): number {
  if (compiled.terms.length === 0) return 0;
  return fieldScore(compiled, title, FIELD_WEIGHTS.title, PHRASE_WEIGHTS.title, useAsciiFastPath, observe)
    + fieldScore(compiled, topicKey, FIELD_WEIGHTS.topic, PHRASE_WEIGHTS.topic, useAsciiFastPath, observe)
    + fieldScore(compiled, content, FIELD_WEIGHTS.content, PHRASE_WEIGHTS.content, useAsciiFastPath, observe);
}

export function createStableLexicalRanker(options: StableLexicalRankerOptions = {}): StableLexicalRanker {
  const cacheCapacity = Math.max(0, Math.floor(options.cacheCapacity ?? DEFAULT_CACHE_CAPACITY));
  const useAsciiFastPath = localePreservesAsciiLowercase();
  const scores = new Map<string, number>();
  let compiled: CompiledQuery | null = null;
  const beginQuery = (query: string): void => {
    compiled = compileQuery(query, useAsciiFastPath);
    scores.clear();
    options.observe?.({ kind: 'query_compiled' });
  };
  return {
    beginQuery,
    rank(query, memoryId, title, content, topicKey) {
      if (!compiled || compiled.raw !== query) beginQuery(query);
      const cached = scores.get(memoryId);
      if (cached !== undefined) {
        options.observe?.({ kind: 'cache_hit' });
        return cached;
      }
      options.observe?.({ kind: 'cache_miss' });
      const score = scoreCompiled(compiled!, title, content, topicKey, useAsciiFastPath, options.observe);
      if (scores.size < cacheCapacity) scores.set(memoryId, score);
      else options.observe?.({ kind: 'cache_skipped' });
      return score;
    },
  };
}

export function stableLexicalRank(query: string, title: string, content: string, topicKey: string): number {
  const useAsciiFastPath = localePreservesAsciiLowercase();
  return scoreCompiled(compileQuery(query, useAsciiFastPath), title, content, topicKey, useAsciiFastPath);
}
