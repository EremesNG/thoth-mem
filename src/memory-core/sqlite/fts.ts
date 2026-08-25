export function buildFtsQuery(input: string): string | null {
  const terms: string[] = [];
  for (const match of input.normalize('NFKC').matchAll(/"([^"\r\n]{2,})"|[\p{L}\p{N}_]{2,}/gu)) {
    const phrase = match[1]?.match(/[\p{L}\p{N}_]{2,}/gu)?.slice(0, 8);
    if (phrase?.length) terms.push(`"${phrase.join(' ')}"`);
    else if (match[0] && !match[0].startsWith('"')) terms.push(`"${match[0]}"*`);
    if (terms.length === 12) break;
  }
  return terms.length === 0 ? null : terms.join(' AND ');
}

export function surgicalSnippet(content: string, query: string, budget: number): string {
  const safeBudget = Math.max(32, budget);
  if (content.length <= safeBudget) return content;
  const tokens = query.toLocaleLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? [];
  const lower = content.toLocaleLowerCase();
  const position = tokens.map((token) => lower.indexOf(token)).find((index) => index >= 0) ?? 0;
  const start = Math.max(0, Math.min(position - Math.floor(safeBudget / 3), content.length - safeBudget));
  return `${start > 0 ? '…' : ''}${content.slice(start, start + safeBudget - 2)}${start + safeBudget < content.length ? '…' : ''}`;
}
