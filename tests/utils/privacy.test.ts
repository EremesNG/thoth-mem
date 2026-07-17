import { describe, it, expect } from 'vitest';
import { stripPrivateTags, stripPrivateTagsStrict } from '../../src/utils/privacy.js';
import {
  MAX_PASSIVE_LEARNING_CODE_POINTS,
  sanitizePassiveLearning,
} from '../../src/integration/core/sanitizer.js';
import type { NormalizedEvent } from '../../src/integration/core/types.js';
import { HOST_EVIDENCE } from '../fixtures/integration/host-evidence.js';

describe('stripPrivateTags', () => {
  it('returns unchanged text when there are no tags', () => {
    expect(stripPrivateTags('hello world')).toBe('hello world');
  });

  it('strips a single private tag block', () => {
    expect(stripPrivateTags('hello <private>secret</private> world')).toBe('hello  world');
  });

  it('strips multi-line content inside a private tag', () => {
    expect(stripPrivateTags('start\n<private>line 1\nline 2\nline 3</private>\nend')).toBe('start\n\nend');
  });

  it('strips multiple private tags', () => {
    expect(stripPrivateTags('a <private>one</private> b <private>two</private> c')).toBe('a  b  c');
  });

  it('matches private tags case-insensitively', () => {
    expect(stripPrivateTags('x <PRIVATE>a</PRIVATE> y <Private>b</Private> z <pRiVaTe>c</pRiVaTe>')).toBe('x  y  z ');
  });

  it('leaves unclosed tags as-is', () => {
    expect(stripPrivateTags('keep <private>open tag')).toBe('keep <private>open tag');
  });

  it('strips empty private tag content', () => {
    expect(stripPrivateTags('before<private></private>after')).toBe('beforeafter');
  });

  it('preserves surrounding text around private tags', () => {
    expect(stripPrivateTags('before <private>hide this</private> after')).toBe('before  after');
  });

  it('collapses excessive newlines after stripping', () => {
    expect(stripPrivateTags('line 1\n\n\n<private>hidden</private>\n\n\nline 2')).toBe('line 1\n\nline 2');
  });

  it('sanitizes root prompt capture privacy tags fail closed', () => {
    expect(stripPrivateTagsStrict('public <private>secret</private> tail')).toEqual({
      text: 'public  tail',
      malformed: false,
      rejected: false,
      removedPrivateContent: true,
    });
    expect(stripPrivateTagsStrict('public prefix<private>secret suffix')).toEqual({
      text: 'public prefix',
      malformed: true,
      rejected: false,
      removedPrivateContent: true,
    });
    expect(stripPrivateTagsStrict('public </private> ambiguous')).toEqual({
      text: '',
      malformed: true,
      rejected: true,
      removedPrivateContent: true,
    });
    expect(stripPrivateTagsStrict('safe prefix<private data-kind="secret">ambiguous suffix')).toEqual({
      text: 'safe prefix',
      malformed: true,
      rejected: false,
      removedPrivateContent: true,
    });
  });

  it('rejects unverified and private passive-learning payloads before observation persistence', async () => {
    expect(typeof sanitizePassiveLearning).toBe('function');

    const evidence = HOST_EVIDENCE.find((entry) => entry.harness === 'claude-code');
    if (!evidence) {
      throw new Error('Expected standalone Claude Code host evidence');
    }
    const baseEvent: NormalizedEvent = {
      harness: 'claude',
      intent: 'capture_passive_learning',
      actor: 'subagent',
      isRootSession: true,
      identity: { sessionId: 'privacy-session', project: 'privacy-project' },
      nativeEvent: 'SessionEnd',
      passiveLearningEvidence: {
        terminalMappingId: evidence.terminal.mappingId,
        verifiedTerminalOutput: true,
      },
    };

    expect(sanitizePassiveLearning({
      ...baseEvent,
      content: 'Unverified terminal output.',
      passiveLearningEvidence: {
        ...baseEvent.passiveLearningEvidence,
        verifiedTerminalOutput: false,
      },
    })).toEqual({ action: 'skip', reason: 'unverified_terminal_output', truncated: false, privacyDegraded: false });
    expect(sanitizePassiveLearning({
      ...baseEvent,
      content: '<private>private terminal content</private>',
    })).toEqual({ action: 'skip', reason: 'private_only', truncated: false, privacyDegraded: false });
  });

  it('bounds mixed-private terminal learning and rejects task, handoff, tool, and recursive content', () => {
    const evidence = HOST_EVIDENCE.find((entry) => entry.harness === 'claude-code');
    if (!evidence) {
      throw new Error('Expected standalone Claude Code host evidence');
    }
    const publicPrefix = 'Verified terminal learning. ';
    const baseEvent: NormalizedEvent = {
      harness: 'claude',
      intent: 'capture_passive_learning',
      actor: 'subagent',
      isRootSession: true,
      identity: { sessionId: 'privacy-session', project: 'privacy-project' },
      nativeEvent: 'SessionEnd',
      passiveLearningEvidence: {
        terminalMappingId: evidence.terminal.mappingId,
        verifiedTerminalOutput: true,
      },
    };
    const expectedContent = publicPrefix + 'x'.repeat(
      MAX_PASSIVE_LEARNING_CODE_POINTS - Array.from(publicPrefix).length,
    );

    expect(sanitizePassiveLearning({
      ...baseEvent,
      content: publicPrefix + '<private>PRIVATE-PASSIVE-SECRET</private>'
        + 'x'.repeat(MAX_PASSIVE_LEARNING_CODE_POINTS),
    })).toEqual({
      action: 'persist',
      content: expectedContent,
      truncated: true,
      privacyDegraded: false,
    });

    for (const content of [
      '  task: copy this instruction',
      '\thandoff: transfer the full transcript',
      'tool result: SECRET-TOOL-RESULT',
      'memory trace: recursive prior output',
    ]) {
      expect(sanitizePassiveLearning({ ...baseEvent, content })).toEqual({
        action: 'skip',
        reason: 'unsafe_content',
        truncated: false,
        privacyDegraded: false,
      });
    }
  });

});
