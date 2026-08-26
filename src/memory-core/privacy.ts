const REDACTED = '[REDACTED]';
const CREDENTIAL_PATTERNS = [
  /github_pat_[a-z0-9_]{20,}/giu,
  /gh[pousr]_[a-z0-9_]{20,}/giu,
  /sk-(?:proj-)?[a-z0-9_-]{20,}/giu,
  /(?:AKIA|ASIA)[0-9A-Z]{16}/gu,
  /xox[baprs]-[a-z0-9-]{10,}/giu,
  /\bBearer\s+[a-z0-9._~+/=-]{12,}/giu,
] as const;

export function sanitizePrivateContent(value: string): string {
  let filtered = value
    .replace(/<private>[\s\S]*?<\/private>/giu, '')
    .replace(/\[private\][\s\S]*?\[\/private\]/giu, '');
  for (const pattern of CREDENTIAL_PATTERNS) filtered = filtered.replace(pattern, REDACTED);
  return filtered.replace(
    /\b(api[_-]?key|access[_-]?token|auth(?:orization)?|password|passwd|secret)\b(\s*[:=]\s*["']?)([^\s"',;]{8,})(["']?)/giu,
    `$1$2${REDACTED}$4`,
  );
}
