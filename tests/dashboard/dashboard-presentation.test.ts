import { describe, expect, it } from 'vitest';

import {
  buildHumanOptions,
  presentDensity,
  presentFilterKey,
  presentMemorySummary,
  presentNodeKind,
  presentObservationType,
  presentRelation,
  presentResourceState,
  presentSurface,
} from '../../dashboard/src/components/dashboard-presentation.js';

describe('dashboard presentation language', () => {
  it('turns graph and observatory tokens into concise user-facing language', () => {
    expect(presentNodeKind('observation')).toBe('Memory');
    expect(presentNodeKind('fact')).toBe('Learned fact');
    expect(presentObservationType('session_summary')).toBe('Session recap');
    expect(presentRelation('HAS_LEARNED')).toBe('records a learning');
    expect(presentDensity('focus')).toBe('Close');
    expect(presentSurface('ledger')).toBe('See what changed');
    expect(presentFilterKey('topic_key')).toBe('Topic');
  });

  it('gives every resource state a bounded explanation and next expectation', () => {
    expect(presentResourceState('loading')).toEqual({ label: 'Gathering memories', explanation: 'This view will update as soon as the memories arrive.' });
    expect(presentResourceState('empty').label).toBe('Nothing here yet');
    expect(presentResourceState('degraded').label).toBe('Some memories are still preparing');
    expect(presentResourceState('error').label).toBe('This view needs another try');
  });

  it('turns structured memory markdown into a readable bounded summary', () => {
    const summary = presentMemorySummary('**What**: Memory 12\n**Why**: Supports 11\n**Learned**: Public 12 caef8ac26cdb5130961505ef');
    expect(summary).toBe('Memory 12. Learned: Public 12.');
    expect(summary).not.toMatch(/\*\*|caef8ac/);
  });

  it('keeps fallback labels safe, bounded and distinguishable when friendly names collide', () => {
    const options = buildHumanOptions(
      ['RELATES_TO', 'relates-to', 'SUPPORTS [private]DO_NOT_RENDER[/private]'],
      presentRelation,
    );
    expect(new Set(options.map(({ label }) => label)).size).toBe(options.length);
    expect(options.map(({ label }) => label).join(' ')).not.toContain('DO_NOT_RENDER');
    expect(options.every(({ value }) => value.length > 0)).toBe(true);
    expect(presentNodeKind('custom_kind')).toBe('Custom kind');
    expect(presentRelation('')).toBe('Related');
  });
});
