const FIELD_WEIGHTS = Object.freeze({ title: 8, topic: 4, content: 1 });
const PHRASE_WEIGHTS = Object.freeze({ title: 24, topic: 12, content: 4 });
const MAX_TERMS = 32;

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase();
}

function tokens(value: string): string[] {
  return normalize(value).match(/[\p{L}\p{N}_]{2,}/gu) ?? [];
}

function fieldScore(queryTerms: readonly string[], queryPhrase: string, value: string, weight: number, phraseWeight: number): number {
  const normalized = normalize(value);
  const fieldTerms = tokens(normalized);
  const lengthNormalization = 1 + Math.log1p(Math.max(0, fieldTerms.length - 8)) / 4;
  let score = queryPhrase && normalized.includes(queryPhrase) ? phraseWeight : 0;
  for (const term of queryTerms) {
    let frequency = 0;
    for (const candidate of fieldTerms) if (candidate.startsWith(term)) frequency += 1;
    if (frequency === 0) continue;
    const saturation = frequency / (frequency + 1);
    const specificity = Math.min(Array.from(term).length, 12) / 4;
    score += weight * saturation * specificity / lengthNormalization;
  }
  return score;
}

export function stableLexicalRank(query: string, title: string, content: string, topicKey: string): number {
  const queryPhrase = normalize(query).trim();
  const queryTerms = [...new Set(tokens(query).slice(0, MAX_TERMS))];
  if (queryTerms.length === 0) return 0;
  return fieldScore(queryTerms, queryPhrase, title, FIELD_WEIGHTS.title, PHRASE_WEIGHTS.title)
    + fieldScore(queryTerms, queryPhrase, topicKey, FIELD_WEIGHTS.topic, PHRASE_WEIGHTS.topic)
    + fieldScore(queryTerms, queryPhrase, content, FIELD_WEIGHTS.content, PHRASE_WEIGHTS.content);
}
