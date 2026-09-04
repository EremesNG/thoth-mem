import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { LifecycleResult } from '../../src/memory-core/contracts.js';
import { MemoryService } from '../../src/memory-core/service.js';
import { identityOnlyRecovery, verifiedRecovery } from '../../src/integration/recovery.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function resultFixture(): { result: LifecycleResult; cwd: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'thoth-recovery-')); roots.push(cwd);
  const service = new MemoryService({ databasePath: ':memory:' });
  try {
    const project = { key: `path:${cwd.replaceAll('\\', '/')}`, name: cwd.split(/[\\/]/u).at(-1)! };
    service.save({ project, evidence: { kind: 'explicit_save', content: 'support' }, memory: { kind: 'decision', title: 'Decision', content: 'Use the verified path.' } });
    service.lifecycle({ operation: 'enroll', harness: 'pi', project, rootSessionKey: 'session-1', eventKey: 'enroll' });
    return { result: service.lifecycle({ operation: 'recover', harness: 'pi', project, rootSessionKey: 'session-1', eventKey: 'recover' }), cwd };
  } finally { service.close(); }
}

describe('shared native recovery validation', () => {
  it('accepts one exact bounded source-attributed block and renders identity fallback', () => {
    const { result, cwd } = resultFixture();
    expect(verifiedRecovery(result, 'session-1', cwd, 'pi')).toBe(result.recovery!.context);
    const identity = identityOnlyRecovery('session-1', cwd)!;
    expect(identity).toContain('root_session_id=session-1');
    expect(identity).not.toContain('(memory:');
  });

  it('rejects identity, taxonomy, delimiter, source leakage, and size mismatches to identity only', () => {
    const { result, cwd } = resultFixture();
    const fallback = identityOnlyRecovery('session-1', cwd);
    const mutations: LifecycleResult[] = [];
    const identity = structuredClone(result); identity.sessionId = 'wrong'; mutations.push(identity);
    const taxonomy = structuredClone(result); taxonomy.recovery!.items[0]!.kind = 'unknown' as never; mutations.push(taxonomy);
    const delimiter = structuredClone(result); delimiter.recovery!.context += '\n<!-- thoth-mem:recovery:start -->'; mutations.push(delimiter);
    const source = structuredClone(result); source.recovery!.context = source.recovery!.context.replace('Use the verified path.', `Use the verified path. ${String(source.recovery!.sources.at(-1))}`); mutations.push(source);
    const oversized = structuredClone(result); oversized.recovery!.context = `${oversized.recovery!.context}${'x'.repeat(2_000)}`; mutations.push(oversized);
    for (const mutated of mutations) expect(verifiedRecovery(mutated, 'session-1', cwd, 'pi')).toBe(fallback);
  });
});

