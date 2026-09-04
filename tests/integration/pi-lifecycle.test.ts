import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createPiLifecycleState, piInputCapture, piPostCompactInput, piPreCompactInput, piShutdownInput } from '../../src/integration/pi/lifecycle.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-lifecycle-'));
  roots.push(cwd);
  const context = { cwd, sessionManager: { getSessionId: () => 'pi-session-1', getLeafId: () => 'leaf-1' } };
  return { context, state: createPiLifecycleState(context) };
}

describe('Pi lifecycle mapping', () => {
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

