export function stripPrivateTags(text: string): string {
  const stripped = text.replace(/<private>[\s\S]*?<\/private>/gi, '');
  return stripped.replace(/\n{3,}/g, '\n\n');
}
