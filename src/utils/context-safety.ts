const PROMPT_INJECTION_PATTERNS = [
  /\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions\b/i,
  /\bdisregard\s+(?:all\s+)?(?:previous|prior|above)\s+instructions\b/i,
  /\bforget\s+(?:all\s+)?(?:previous|prior|above)\s+instructions\b/i,
  /\boverride\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message|instructions)\b/i,
  /\breveal\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message|instructions)\b/i,
  /\byou\s+are\s+now\s+(?:in\s+)?(?:developer|system|admin)\s+mode\b/i,
  /\bdo\s+not\s+(?:follow|obey)\s+(?:the\s+)?(?:system|developer)\s+instructions\b/i,
  /\bexfiltrate\b/i,
  /\bsecret\s+instructions\b/i,
  /\bBEGIN\s+(?:SYSTEM|DEVELOPER)\s+PROMPT\b/i,
];

export function sanitizeRetrievedContext(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => (
      PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(line))
        ? '[Content redacted]'
        : line
    ))
    .join('\n');
}
