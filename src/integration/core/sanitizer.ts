import { stripPrivateTagsStrict } from '../../utils/privacy.js';

import type {
  NormalizedEvent,
  PassiveLearningCaptureMetadata,
  PromptSanitizer,
} from './types.js';

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

export const MAX_PASSIVE_LEARNING_CODE_POINTS = 4_000;

function isVerifiedTerminalMapping(value: string | undefined): value is string {
  return value !== undefined
    && Array.from(value).length <= 128
    && /^[a-z0-9][a-z0-9.-]*$/.test(value);
}

function hasUnsafePassiveLearningShape(content: string): boolean {
  return /(?:^|\n)\s*(?:prompt|task|handoff|tool(?:\s+(?:call|result))?|memory\s+trace)\b/i.test(content);
}

export function sanitizePassiveLearning(
  event: NormalizedEvent,
): PassiveLearningCaptureMetadata {
  if (event.actor !== 'subagent') {
    return { action: 'skip', reason: 'not_subagent', truncated: false, privacyDegraded: false };
  }
  if (!event.isRootSession) {
    return { action: 'skip', reason: 'not_root_session', truncated: false, privacyDegraded: false };
  }
  if (!event.passiveLearningEvidence?.verifiedTerminalOutput
    || !isVerifiedTerminalMapping(event.passiveLearningEvidence.terminalMappingId)) {
    return {
      action: 'skip',
      reason: 'unverified_terminal_output',
      truncated: false,
      privacyDegraded: false,
    };
  }

  const privacy = stripPrivateTagsStrict((event.content ?? '').replace(/\r\n?/g, '\n'));
  if (privacy.rejected || privacy.malformed) {
    return { action: 'skip', reason: 'malformed_private_tag', truncated: false, privacyDegraded: true };
  }
  if (privacy.text.trim().length === 0) {
    return {
      action: 'skip',
      reason: privacy.removedPrivateContent ? 'private_only' : 'empty',
      truncated: false,
      privacyDegraded: false,
    };
  }
  if (hasUnsafePassiveLearningShape(privacy.text)) {
    return { action: 'skip', reason: 'unsafe_content', truncated: false, privacyDegraded: false };
  }

  const codePoints = Array.from(privacy.text);
  const truncated = codePoints.length > MAX_PASSIVE_LEARNING_CODE_POINTS;
  return {
    action: 'persist',
    content: truncated
      ? codePoints.slice(0, MAX_PASSIVE_LEARNING_CODE_POINTS).join('')
      : privacy.text,
    truncated,
    privacyDegraded: false,
  };
}