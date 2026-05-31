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

export function splitIntoChunks(input: {
  observationId: number;
  text: string;
  maxWords?: number;
  overlapWords?: number;
  minWords?: number;
  maxChars?: number;
}): SemanticChunkUnit[] {
  const text = normalizeText(input.text);
  if (text.length === 0) {
    return [];
  }

  const maxWords = Math.max(50, input.maxWords ?? 300);
  const overlapWords = Math.min(Math.max(0, input.overlapWords ?? 80), maxWords - 1);
  const minWords = Math.max(1, input.minWords ?? 10);
  const stepWords = Math.max(1, maxWords - overlapWords);
  const words = text.replace(/\n+/g, ' ').split(/\s+/).filter((word) => word.length > 0);
  const chunks: SemanticChunkUnit[] = [];

  const pushChunk = (content: string): void => {
    const normalized = content.trim();
    if (normalized.length === 0) {
      return;
    }
    const chunkIndex = chunks.length;
    chunks.push({
      chunkIndex,
      content: normalized,
      chunkKey: buildChunkKey(input.observationId, chunkIndex, normalized),
    });
  };

  if (words.length <= maxWords) {
    pushChunk(text.replace(/\n+/g, ' '));
    return chunks;
  }

  for (let start = 0; start < words.length; start += stepWords) {
    const sliceWords = words.slice(start, start + maxWords);
    if (sliceWords.length < minWords && chunks.length > 0) {
      break;
    }
    pushChunk(sliceWords.join(' '));
  }

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
