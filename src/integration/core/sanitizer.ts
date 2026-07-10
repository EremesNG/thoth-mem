import { stripPrivateTagsStrict } from '../../utils/privacy.js';

import type { NormalizedEvent, PromptSanitizer } from './types.js';

export const MAX_PROMPT_CODE_POINTS = 8_000;

export type PromptCaptureDecision = ReturnType<PromptSanitizer['sanitize']>
  | { action: 'skip'; reason: 'not_root_user' | 'not_root_session' };

export const promptSanitizer: PromptSanitizer = {
  sanitize(input) {
    const normalized = input.replace(/\r\n?/g, '\n');
    const privacy = stripPrivateTagsStrict(normalized);

    if (privacy.rejected) {
      return { action: 'skip', reason: 'malformed_private_tag' };
    }

    if (privacy.text.trim().length === 0) {
      let reason: 'private_only' | 'malformed_private_tag' | 'empty' = 'empty';
      if (privacy.malformed) {
        reason = 'malformed_private_tag';
      } else if (privacy.removedPrivateContent) {
        reason = 'private_only';
      }
      return {
        action: 'skip',
        reason,
      };
    }

    const codePoints = Array.from(privacy.text);
    const truncated = codePoints.length > MAX_PROMPT_CODE_POINTS;

    return {
      action: 'persist',
      content: truncated
        ? codePoints.slice(0, MAX_PROMPT_CODE_POINTS).join('')
        : privacy.text,
      truncated,
      privacyDegraded: privacy.malformed,
    };
  },
};

export function sanitizeRootPromptCapture(event: NormalizedEvent): PromptCaptureDecision {
  if (event.actor !== 'root_user') {
    return { action: 'skip', reason: 'not_root_user' };
  }

  if (!event.isRootSession) {
    return { action: 'skip', reason: 'not_root_session' };
  }

  return promptSanitizer.sanitize(event.content ?? '');
}
