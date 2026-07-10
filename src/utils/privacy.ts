export function stripPrivateTags(text: string): string {
  const stripped = text.replace(/<private>[\s\S]*?<\/private>/gi, '');
  return stripped.replace(/\n{3,}/g, '\n\n');
}

export interface StrictPrivateTagResult {
  text: string;
  malformed: boolean;
  rejected: boolean;
  removedPrivateContent: boolean;
}

export function stripPrivateTagsStrict(text: string): StrictPrivateTagResult {
  const tagPattern = /<\s*(\/?)\s*private\b[^>]*(?:>|$)/gi;
  let cursor = 0;
  let insidePrivate = false;
  let removedPrivateContent = false;
  let publicText = '';
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(text)) !== null) {
    const token = match[0];
    const isClosing = match[1] === '/';
    const canonicalToken = isClosing ? '</private>' : '<private>';
    const isCanonical = token.toLowerCase() === canonicalToken;
    removedPrivateContent = true;

    if (isClosing) {
      if (!insidePrivate || !isCanonical) {
        return {
          text: '',
          malformed: true,
          rejected: true,
          removedPrivateContent: true,
        };
      }

      insidePrivate = false;
      cursor = match.index + token.length;
      continue;
    }

    if (insidePrivate) {
      return {
        text: publicText.replace(/\n{3,}/g, '\n\n'),
        malformed: true,
        rejected: false,
        removedPrivateContent: true,
      };
    }

    if (!isCanonical) {
      publicText += text.slice(cursor, match.index);
      return {
        text: publicText.replace(/\n{3,}/g, '\n\n'),
        malformed: true,
        rejected: false,
        removedPrivateContent: true,
      };
    }

    publicText += text.slice(cursor, match.index);
    insidePrivate = true;
    cursor = match.index + token.length;
  }

  if (insidePrivate) {
    return {
      text: publicText.replace(/\n{3,}/g, '\n\n'),
      malformed: true,
      rejected: false,
      removedPrivateContent: true,
    };
  }

  publicText += text.slice(cursor);
  return {
    text: publicText.replace(/\n{3,}/g, '\n\n'),
    malformed: false,
    rejected: false,
    removedPrivateContent,
  };
}
