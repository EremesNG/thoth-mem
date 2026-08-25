import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MemoryService } from '../../src/memory-core/service.js';

describe('host-neutral lifecycle v2', () => {
  it('covers enroll, recover, one prompt, checkpoint, guidance, and finalize receipts', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const base = { harness: 'claude' as const, project: { key: 'repo:matrix', name: 'matrix' }, rootSessionKey: 'root-matrix' };
      expect(service.lifecycle({ ...base, operation: 'enroll', eventKey: 'enroll' })).toMatchObject({ outcome: 'confirmed', duplicate: false });
      expect(service.lifecycle({ ...base, operation: 'recover', eventKey: 'recover' }).outcome).toBe('confirmed');
      const prompt = service.lifecycle({ ...base, operation: 'capture_root', eventKey: 'prompt', content: 'One root prompt.' });
      expect(service.lifecycle({ ...base, operation: 'capture_root', eventKey: 'prompt', content: 'One root prompt.' })).toMatchObject({ duplicate: true, evidenceId: prompt.evidenceId });
      expect(service.lifecycle({ ...base, operation: 'guide_post_compact', eventKey: 'early' }).outcome).toBe('degraded');
      expect(service.lifecycle({ ...base, operation: 'checkpoint_pre_compact', eventKey: 'pre', content: 'Checkpoint.' }).outcome).toBe('confirmed');
      expect(service.lifecycle({ ...base, operation: 'guide_post_compact', eventKey: 'post' }).outcome).toBe('confirmed');
      expect(service.lifecycle({ ...base, operation: 'finalize', eventKey: 'finish' }).outcome).toBe('confirmed');
    } finally { service.close(); }
  });

  it('confirms one root prompt across duplicate delivery and restart', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-lifecycle-v2-')); const path = join(root, 'memory.sqlite');
    const input = { operation: 'capture_root' as const, harness: 'codex' as const, project: { key: 'repo:life', name: 'life' }, rootSessionKey: 'root-1', eventKey: 'event-1', content: 'private-safe root request' };
    try {
      let service = new MemoryService({ databasePath: path }); const first = service.lifecycle(input); service.close();
      service = new MemoryService({ databasePath: path }); const duplicate = service.lifecycle(input);
      expect(first).toMatchObject({ outcome: 'confirmed', duplicate: false });
      expect(duplicate).toMatchObject({ outcome: 'confirmed', duplicate: true, evidenceId: first.evidenceId });
      expect(service.context({ projectKey: 'repo:life' }).items).toEqual([]);
      service.close();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('persists and returns degraded identity confidence across retries', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-lifecycle-degraded-')); const path = join(root, 'memory.sqlite');
    const input = { operation: 'capture_root' as const, harness: 'codex' as const, project: { key: 'repo:degraded', name: 'degraded' }, rootSessionKey: 'root-1', eventKey: 'codex:degraded:fallback', identityConfidence: 'degraded' as const, content: 'same prompt without a stable turn id' };
    try {
      let service = new MemoryService({ databasePath: path }); const first = service.lifecycle(input); service.close();
      service = new MemoryService({ databasePath: path }); const duplicate = service.lifecycle(input);
      service.close();
      expect(first).toMatchObject({ outcome: 'degraded', duplicate: false, capability: { memoryConfirmed: false } });
      expect(duplicate).toMatchObject({ outcome: 'degraded', duplicate: true, evidenceId: first.evidenceId, capability: { memoryConfirmed: false } });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('orders checkpoint before guidance and finalizes idempotently', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const base = { harness: 'opencode' as const, project: { key: 'repo:life', name: 'life' }, rootSessionKey: 'root-1' };
      expect(service.lifecycle({ ...base, operation: 'guide_post_compact', eventKey: 'too-early' })).toMatchObject({ outcome: 'degraded' });
      expect(service.lifecycle({ ...base, operation: 'checkpoint_pre_compact', eventKey: 'pre', content: 'handoff' }).outcome).toBe('confirmed');
      expect(service.lifecycle({ ...base, operation: 'guide_post_compact', eventKey: 'post' }).outcome).toBe('confirmed');
      expect(service.lifecycle({ ...base, operation: 'finalize', eventKey: 'end' }).outcome).toBe('confirmed');
      expect(service.lifecycle({ ...base, operation: 'finalize', eventKey: 'end' }).duplicate).toBe(true);
    } finally { service.close(); }
  });

  it('does not auto-capture passive tool or subagent streams', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      service.lifecycle({ operation: 'enroll', harness: 'codex', project: { key: 'repo:passive', name: 'passive' }, rootSessionKey: 'root', eventKey: 'enroll' });
      expect(service.context({ projectKey: 'repo:passive' }).items).toEqual([]);
      expect(service.recall({ projectKey: 'repo:passive', query: 'tool subagent' }).items).toEqual([]);
    } finally { service.close(); }
  });
});
