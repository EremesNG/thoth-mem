const FAMILY_PREFIXES: Record<string, string> = {
  architecture: 'architecture/',
  bugfix: 'bug/',
  decision: 'decision/',
  pattern: 'pattern/',
  config: 'config/',
  discovery: 'discovery/',
  learning: 'learning/',
  session_summary: 'session/',
};

export function suggestTopicKey(title: string, type?: string, content?: string): string {
  const input = title.trim() || content?.split(/\r?\n/, 1)[0]?.trim().slice(0, 100) || '';

  if (!input) {
    return '';
  }

  const prefix = type && FAMILY_PREFIXES[type] ? FAMILY_PREFIXES[type] : '';
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug) {
    return '';
  }

  return `${prefix}${slug}`.slice(0, 100);
}
