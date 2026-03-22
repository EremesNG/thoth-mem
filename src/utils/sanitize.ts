export function sanitizeFTS(query: string): string {
  const tokens = query.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return '';
  }

  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(' ');
}

export function normalizeForHash(content: string): string {
  return content.trim().replace(/\s+/g, ' ').toLowerCase();
}
