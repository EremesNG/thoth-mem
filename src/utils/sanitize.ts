export function sanitizeFTS(query: string): string {
  const tokens = query.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return '';
  }

  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(' ');
}

export function sanitizeFTSPrefix(query: string): string {
  const tokens = query.trim().split(/\s+/).filter((token) => token.length >= 3);

  if (tokens.length === 0) {
    return '';
  }

  return tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(' OR ');
}

export function normalizeForHash(content: string): string {
  return content.trim().replace(/\s+/g, ' ').toLowerCase();
}
