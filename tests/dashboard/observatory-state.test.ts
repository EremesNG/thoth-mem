import { describe, expect, it } from 'vitest';
import { beginRequest, boundedError, canCommitRequest, createResourceState, deriveGraphPhase } from '../../dashboard/src/components/observatory/resource-state.js';

describe('observatory resource state', () => {
  it('rejects stale request completions', () => {
    const first = beginRequest(createResourceState<string>());
    const second = beginRequest(first);
    expect(canCommitRequest(second, first.requestId)).toBe(false);
    expect(canCommitRequest(second, second.requestId)).toBe(true);
  });
  it('keeps failures bounded', () => expect(boundedError(new Error('x'.repeat(500)))).toHaveLength(320));
  it('derives live graph states rendered by the production notice', () => {
    const base={loading:false,hasData:true,nodeCount:4,dense:false,truncated:false,exhausted:false,degraded:false,error:false};
    expect(deriveGraphPhase({...base,hasData:false,nodeCount:0})).toBe('empty');
    expect(deriveGraphPhase({...base,truncated:true})).toBe('truncated');
    expect(deriveGraphPhase({...base,degraded:true})).toBe('degraded');
  });
});
