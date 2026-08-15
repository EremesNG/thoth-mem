const PRIVATE_BLOCKS = [
  /<private>[\s\S]*?<\/private>/gi,
  /\[private\][\s\S]*?\[\/private\]/gi,
];

export function presentStoredText(value: unknown, maxLength = 1200): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : String(value);
  for (const pattern of PRIVATE_BLOCKS) text = text.replace(pattern, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…` : text;
}

export function presentBoundedResult(value: unknown, maxDepth = 4, maxItems = 24): unknown {
  const visit = (input: unknown, depth: number): unknown => {
    if (typeof input === 'string') return presentStoredText(input);
    if (input === null || typeof input !== 'object') return input;
    if (depth >= maxDepth) return '[bounded]';
    if (Array.isArray(input)) return input.slice(0, maxItems).map((item) => visit(item, depth + 1));
    return Object.fromEntries(Object.entries(input).slice(0, maxItems).map(([key, item]) => [key, visit(item, depth + 1)]));
  };
  return visit(value, 0);
}

export function formatBoundedResult(value: unknown): string {
  return JSON.stringify(presentBoundedResult(value), null, 2);
}
