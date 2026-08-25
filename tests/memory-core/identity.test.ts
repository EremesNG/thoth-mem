import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveProjectIdentity } from '../../src/memory-core/identity.js';
import { MemoryService } from '../../src/memory-core/service.js';

describe('v2 project/session identity', () => {
  it('preserves verified identity across paths and reports path fallback as degraded', () => {
    const first = resolveProjectIdentity({ name: 'alpha', root: 'C:/work/a', verifiedKey: 'repo:stable-alpha' });
    const moved = resolveProjectIdentity({ name: 'alpha', root: 'D:/moved/a', verifiedKey: 'repo:stable-alpha' });
    expect(first).toMatchObject({ key: 'repo:stable-alpha', degraded: false });
    expect(moved.key).toBe(first.key);
    expect(resolveProjectIdentity({ name: 'alpha', root: 'C:/work/a' })).toMatchObject({ degraded: true, key: expect.stringMatching(/^path:[a-f0-9]{64}$/) });
    expect(() => resolveProjectIdentity({ name: 'alpha' })).toThrow(/cannot be verified/i);
  });

  it('keeps lifecycle receipts idempotent across restart without verified placeholders', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-identity-v2-')); const path = join(root, 'memory.sqlite');
    try {
      let service = new MemoryService({ databasePath: path });
      const input = { operation: 'capture_root' as const, harness: 'codex' as const, project: { key: 'repo:alpha', name: 'alpha' }, rootSessionKey: 'root-session', eventKey: 'prompt-1', content: 'Remember this.' };
      const first = service.lifecycle(input); service.close();
      service = new MemoryService({ databasePath: path }); const second = service.lifecycle(input);
      expect(second).toMatchObject({ duplicate: true, projectId: first.projectId, sessionId: first.sessionId, evidenceId: first.evidenceId });
      expect(() => service.save({ project: { key: '', name: 'placeholder' }, evidence: { kind: 'explicit_save', content: 'no' } })).toThrow(/verified project identity/i);
      service.close();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
