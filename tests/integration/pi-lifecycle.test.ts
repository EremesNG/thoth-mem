import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createPiLifecycleState, piInputCapture, piPostCompactInput, piPreCompactInput, piRecoveryInput, piSessionStartInput, piShutdownInput } from '../../src/integration/pi/lifecycle.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-lifecycle-'));
  roots.push(cwd);
  const context = { cwd, sessionManager: { getSessionId: () => 'pi-session-1', getLeafId: () => 'leaf-1' } };
  return { context, state: createPiLifecycleState(context) };
}

describe('Pi lifecycle mapping', () => {
  it('keeps start, recovery, refresh, and shutdown keys stable per run and distinct across runs of one root', () => {
    const { context, state } = fixture();
    const resumed = createPiLifecycleState(context);
    expect(state.runNonce).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(resumed.runNonce).not.toBe(state.runNonce);
    const keys = (run: typeof state) => [
      piSessionStartInput(run, 'resume').eventKey,
      piRecoveryInput(run, 'start').eventKey,
      piRecoveryInput(run, 'context').eventKey,
      piRecoveryInput(run, 'post_compact').eventKey,
      piShutdownInput(run, { reason: 'quit', sessionFile: 'session.jsonl' })!.eventKey,
    ];
    const originalKeys = keys(state);
    expect(keys(state)).toEqual(originalKeys);
    expect(new Set(originalKeys).size).toBe(originalKeys.length);
    const resumedKeys = keys(resumed);
    for (const [index, key] of originalKeys.entries()) {
      expect(resumedKeys[index]).not.toBe(key);
    }
  });

  it('keeps capture and compaction keys unchanged across run nonces and distinct for new entry IDs', () => {
    const { context } = fixture();
    const first = createPiLifecycleState(context, () => 'run-1');
    const resumed = createPiLifecycleState(context, () => 'run-2');
    const input = { text: 'Continue verifying the lifecycle.', source: 'interactive', streamingBehavior: 'steer' };
    const preCompact = { firstKeptEntryId: 'entry-1', reason: 'manual', isRetry: false };
    const postCompact = { compactionEntryId: 'compact-1', summary: '## Goal\nVerify recovery.', reason: 'manual', isRetry: false };
    expect(piInputCapture(resumed, context, input)).toEqual(piInputCapture(first, context, input));
    expect(piPreCompactInput(resumed, preCompact)).toEqual(piPreCompactInput(first, preCompact));
    expect(piPostCompactInput(resumed, postCompact)).toEqual(piPostCompactInput(first, postCompact));
    expect(piPreCompactInput(resumed, { ...preCompact, firstKeptEntryId: 'entry-2' }).eventKey).not.toBe(piPreCompactInput(first, preCompact).eventKey);
    expect(piPostCompactInput(resumed, { ...postCompact, compactionEntryId: 'compact-2' }).eventKey).not.toBe(piPostCompactInput(first, postCompact).eventKey);
  });

  it('sanitizes before deriving distinct same-leaf root input keys and excludes extension input', () => {
    const { context, state } = fixture();
    const first = piInputCapture(state, context, { text: 'first API_KEY=secret-value', source: 'interactive', streamingBehavior: 'steer' })!;
    const retry = piInputCapture(state, context, { text: 'first API_KEY=secret-value', source: 'interactive', streamingBehavior: 'steer' })!;
    const second = piInputCapture(state, context, { text: 'second', source: 'rpc', streamingBehavior: 'steer' })!;
    expect(first.content).not.toContain('secret-value');
    expect(first.eventKey).toBe(retry.eventKey);
    expect(second.eventKey).not.toBe(first.eventKey);
    expect(piInputCapture(state, context, { text: 'delegated', source: 'extension' })).toBeUndefined();
  });

  it('maps compaction without raw content and finalizes only true shutdown', () => {
    const { state } = fixture();
    expect(piPreCompactInput(state, { firstKeptEntryId: 'entry-1', reason: 'manual' })).not.toHaveProperty('content');
    expect(piPostCompactInput(state, { compactionEntryId: 'compact-1', reason: 'threshold' })).toMatchObject({ operation: 'guide_post_compact', harness: 'pi' });
    expect(piShutdownInput(state, { reason: 'reload' })).toBeUndefined();
    expect(piShutdownInput(state, { reason: 'quit' })).toMatchObject({ operation: 'finalize' });
  });
});

