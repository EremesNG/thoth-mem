import { sanitizeTracePayload } from './trace-sanitize.js';
import type { OperationTraceMetrics } from '../store/types.js';

export const TOKEN_BASIS_ESTIMATED_CHARS_DIV_4 = 'estimated_chars_div_4' as const;

export function countChars(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'string') {
    return value.length;
  }

  return JSON.stringify(value).length;
}

export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 4);
}

export function safePayloadChars(value: unknown): number {
  return sanitizeTracePayload(value).json.length;
}

export function buildPayloadMetrics(input: {
  request?: unknown;
  response?: unknown;
  fullChars?: number;
  evidenceChars?: number;
  returnedChars?: number;
  evidenceObservationIds?: number[];
  fetchedObservationId?: number;
  fetchedPromptId?: number;
  retrievalMode?: 'compact' | 'context';
}): OperationTraceMetrics {
  const requestChars = safePayloadChars(input.request ?? null);
  const responseChars = input.response === undefined ? 0 : safePayloadChars(input.response);
  const returnedChars = input.returnedChars ?? responseChars;
  const fullChars = input.fullChars;
  const evidenceChars = input.evidenceChars;
  const savedChars = fullChars === undefined ? undefined : Math.max(0, fullChars - returnedChars);
  const compressionRatio = fullChars && fullChars > 0
    ? Number((1 - Math.min(returnedChars, fullChars) / fullChars).toFixed(3))
    : undefined;
  const evidenceObservationIds = input.evidenceObservationIds
    ? Array.from(new Set(input.evidenceObservationIds.filter((id) => Number.isInteger(id) && id > 0))).sort((a, b) => a - b)
    : undefined;

  return {
    schema_version: 1,
    request_chars: requestChars,
    response_chars: responseChars,
    returned_chars: returnedChars,
    ...(fullChars !== undefined ? { full_chars: fullChars } : {}),
    ...(evidenceChars !== undefined ? { evidence_chars: evidenceChars } : {}),
    ...(savedChars !== undefined ? { saved_chars: savedChars } : {}),
    ...(compressionRatio !== undefined ? { compression_ratio: compressionRatio } : {}),
    token_basis: TOKEN_BASIS_ESTIMATED_CHARS_DIV_4,
    estimated_tokens: {
      request: estimateTokensFromChars(requestChars),
      response: estimateTokensFromChars(responseChars),
      ...(fullChars !== undefined ? { full: estimateTokensFromChars(fullChars) } : {}),
      ...(evidenceChars !== undefined ? { evidence: estimateTokensFromChars(evidenceChars) } : {}),
      returned: estimateTokensFromChars(returnedChars),
    },
    ...(evidenceObservationIds && evidenceObservationIds.length > 0 ? { evidence_observation_ids: evidenceObservationIds } : {}),
    ...(input.fetchedObservationId !== undefined ? { fetched_observation_id: input.fetchedObservationId } : {}),
    ...(input.fetchedPromptId !== undefined ? { fetched_prompt_id: input.fetchedPromptId } : {}),
    ...(input.retrievalMode ? { retrieval_mode: input.retrievalMode } : {}),
  };
}
