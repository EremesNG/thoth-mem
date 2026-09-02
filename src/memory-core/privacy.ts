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

export type LegacyPrivacyResult =
  | { disposition: 'accepted'; value: string; transformed: boolean }
  | { disposition: 'quarantined'; reason: 'privacy_malformed' | 'empty_after_filter' };

export function sanitizeLegacyImportContent(value: unknown): LegacyPrivacyResult {
  if (typeof value !== 'string') return { disposition: 'quarantined', reason: 'empty_after_filter' };
  const delimiter = /<\/?\s*private\b[^>]*>|\[\/?\s*private\b[^\]]*\]/giu;
  const stack: Array<'angle' | 'bracket'> = [];
  for (const match of value.matchAll(delimiter)) {
    const token = match[0].toLocaleLowerCase();
    const exact = /^(?:<\/?private>|\[\/?private\])$/u.test(token);
    if (!exact) return { disposition: 'quarantined', reason: 'privacy_malformed' };
    const style = token.startsWith('<') ? 'angle' : 'bracket';
    const closing = token.startsWith('</') || token.startsWith('[/');
    if (!closing) {
      if (stack.length > 0) return { disposition: 'quarantined', reason: 'privacy_malformed' };
      stack.push(style);
    } else if (stack.pop() !== style) {
      return { disposition: 'quarantined', reason: 'privacy_malformed' };
    }
  }
  if (stack.length > 0) return { disposition: 'quarantined', reason: 'privacy_malformed' };
  if (/(?:<|\[)\/?\s*private\b/iu.test(value.replace(delimiter, ''))) return { disposition: 'quarantined', reason: 'privacy_malformed' };
  const filtered = sanitizePrivateContent(value).normalize('NFC').trim();
  if (!filtered) return { disposition: 'quarantined', reason: 'empty_after_filter' };
  return { disposition: 'accepted', value: filtered, transformed: filtered !== value.normalize('NFC').trim() };
}
