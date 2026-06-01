import { stripPrivateTags } from './privacy.js';

const DEFAULT_MAX_TRACE_PAYLOAD_CHARS = 12_000;
const REDACTED = '[redacted]';

const SENSITIVE_KEY_PATTERN = /^(authorization|cookie|set-cookie|password|passwd|secret|api[-_]?key|access[-_]?token|refresh[-_]?token|session[-_]?token|token)$/i;
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
] as const;

export interface SanitizedTracePayload {
  json: string;
  truncated: boolean;
}

export interface SanitizeTracePayloadOptions {
  maxChars?: number;
}

function redactString(value: string): string {
  let redacted = stripPrivateTags(value);
  for (const pattern of SECRET_VALUE_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTED);
  }
  return redacted;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return redactString(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return '[function]';
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[circular]';
    }
    seen.add(value);
    return value.map((item) => sanitizeValue(item, seen));
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      return '[circular]';
    }
    seen.add(value);
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED
        : sanitizeValue(nestedValue, seen);
    }
    return output;
  }

  return value;
}

export function sanitizeTracePayload(
  payload: unknown,
  options: SanitizeTracePayloadOptions = {},
): SanitizedTracePayload {
  const maxChars = Math.max(256, options.maxChars ?? DEFAULT_MAX_TRACE_PAYLOAD_CHARS);
  const sanitized = sanitizeValue(payload, new WeakSet<object>());
  const json = JSON.stringify(sanitized, null, 2) ?? 'null';
  const redacted = redactString(json);

  if (redacted.length <= maxChars) {
    return { json: redacted, truncated: false };
  }

  const omitted = redacted.length - maxChars;
  return {
    json: `${redacted.slice(0, maxChars)}\n...[truncated ${omitted} chars]`,
    truncated: true,
  };
}

export function sanitizeTraceText(
  text: string,
  options: SanitizeTracePayloadOptions = {},
): SanitizedTracePayload {
  const maxChars = Math.max(256, options.maxChars ?? DEFAULT_MAX_TRACE_PAYLOAD_CHARS);
  const redacted = redactString(text);

  if (redacted.length <= maxChars) {
    return { json: redacted, truncated: false };
  }

  const omitted = redacted.length - maxChars;
  return {
    json: `${redacted.slice(0, maxChars)}\n...[truncated ${omitted} chars]`,
    truncated: true,
  };
}
