import { createHash } from 'node:crypto';

export interface SemanticChunkUnit {
  chunkKey: string;
  chunkIndex: number;
  content: string;
}

export interface SemanticSentenceUnit {
  sentenceKey: string;
  chunkKey: string;
  sentenceIndex: number;
  content: string;
}

function digest(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 24);
}

function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}

export function buildChunkKey(observationId: number, chunkIndex: number, content: string): string {
  return `chunk:${observationId}:${chunkIndex}:${digest(content)}`;
}

export function buildSentenceKey(observationId: number, chunkKey: string, sentenceIndex: number, content: string): string {
  return `sentence:${observationId}:${chunkKey}:${sentenceIndex}:${digest(content)}`;
}

export function splitIntoChunks(input: { observationId: number; text: string; maxChars?: number }): SemanticChunkUnit[] {
  const maxChars = Math.max(200, input.maxChars ?? 900);
  const text = normalizeText(input.text);
  if (text.length === 0) {
    return [];
  }

  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0);
  const chunks: SemanticChunkUnit[] = [];
  let current = '';

  const pushChunk = (): void => {
    const content = current.trim();
    if (content.length === 0) {
      return;
    }
    const chunkIndex = chunks.length;
    chunks.push({
      chunkIndex,
      content,
      chunkKey: buildChunkKey(input.observationId, chunkIndex, content),
    });
    current = '';
  };

  for (const paragraph of paragraphs) {
    const candidate = current.length > 0 ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    pushChunk();
    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }

    for (let start = 0; start < paragraph.length; start += maxChars) {
      const slice = paragraph.slice(start, start + maxChars).trim();
      if (slice.length === 0) {
        continue;
      }
      const chunkIndex = chunks.length;
      chunks.push({
        chunkIndex,
        content: slice,
        chunkKey: buildChunkKey(input.observationId, chunkIndex, slice),
      });
    }
  }

  pushChunk();
  return chunks;
}

export function splitChunkIntoSentences(input: { observationId: number; chunkKey: string; text: string }): SemanticSentenceUnit[] {
  const text = normalizeText(input.text);
  if (text.length === 0) {
    return [];
  }

  const normalized = text.replace(/\n+/g, ' ');
  const parts = normalized.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter((p) => p.length > 0);
  const sentences: SemanticSentenceUnit[] = [];
  const sourceParts = parts.length > 0 ? parts : [normalized];

  for (const content of sourceParts) {
    const sentenceIndex = sentences.length;
    sentences.push({
      sentenceIndex,
      chunkKey: input.chunkKey,
      content,
      sentenceKey: buildSentenceKey(input.observationId, input.chunkKey, sentenceIndex, content),
    });
  }

  return sentences;
}

export function deterministicVecRowid(sourceKey: string): number {
  const hex = createHash('sha256').update(sourceKey).digest('hex').slice(0, 14);
  const value = Number.parseInt(hex, 16);
  return (value % 2_000_000_000) + 1;
}
