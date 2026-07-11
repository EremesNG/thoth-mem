import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { getConfig } from '../../src/config.js';
import {
  normalizeIdentityToken,
  resolveSaveIdentity,
} from '../../src/store/identity.js';
import { Store } from '../../src/store/index.js';
import { resolveLifecycleIdentity } from '../../src/integration/core/lifecycle.js';
import { MemoryIntegrationCore } from '../../src/integration/core/lifecycle.js';
import { FileLifecycleStateStore } from '../../src/integration/core/state-store.js';
import type { NormalizedEvent } from '../../src/integration/core/types.js';
import type { MemoryPort } from '../../src/integration/core/memory-port.js';

describe('identity resolver v2', () => {
  const originalEnv = { ...process.env };
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
    process.env = { ...originalEnv };
  });

  it('preserves explicit project and session identity before config or workspace identity', () => {
    const resolution = resolveSaveIdentity({
      project: 'Explicit Project',
      session_id: 'stable-session',
      config: { project: { default: 'Configured Project' } } as any,
      cwd: join(tmpdir(), 'workspace-project'),
      requireSessionProject: true,
    });

    expect(resolution).toMatchObject({
      project: 'Explicit Project',
      project_id: 'Explicit Project',
      project_source: 'explicit',
      session_id: 'stable-session',
      session_source: 'explicit',
      session_project: 'Explicit Project',
      degraded: [],
    });
  });

  it('uses configured project before workspace inference and reports source metadata', () => {
    const resolution = resolveSaveIdentity({
      session_id: 'stable-session',
      config: { project: { default: 'Configured Project' } } as any,
      cwd: join(tmpdir(), 'workspace-project'),
      requireSessionProject: true,
    });

    expect(resolution.project).toBe('Configured Project');
    expect(resolution.project_id).toBe('Configured Project');
    expect(resolution.project_source).toBe('config');
    expect(resolution.session_project).toBe('Configured Project');
  });

  it('derives deterministic workspace identity from cwd when explicit/config are absent', () => {
    const cwd = join(tmpdir(), 'My Workspace_Project');
    const first = resolveSaveIdentity({ cwd, requireSessionProject: true });
    const second = resolveSaveIdentity({ cwd, requireSessionProject: true });

    expect(first.project).toBe('my-workspace_project');
    expect(second.project).toBe(first.project);
    expect(first.project_source).toBe('cwd');
    expect(first.degraded).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'session_id', reason: 'missing' }),
    ]));
  });

  it('keeps placeholder session ids query-stable while marking them degraded', () => {
    const resolution = resolveSaveIdentity({
      project: 'legacy-project',
      session_id: 'manual-save-legacy-project',
      requireSessionProject: true,
    });

    expect(resolution.session_id).toBe('manual-save-legacy-project');
    expect(resolution.session_source).toBe('placeholder');
    expect(resolution.degraded).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'session_id',
        reason: 'placeholder',
        value: 'manual-save-legacy-project',
      }),
    ]));
  });

  it('does not silently repair existing unknown/manual-save session rows', () => {
    const store = new Store(':memory:');
    try {
      store.startSession('manual-save-unknown', 'unknown');
      store.startSession('manual-save-unknown', 'derived-project');

      expect(store.getSession('manual-save-unknown')?.project).toBe('unknown');
    } finally {
      store.close();
    }
  });

  it('normalizes derived tokens without preserving paths or credentials', () => {
    expect(normalizeIdentityToken('https://token@example.com/Scope/Repo.git')).toBe('repo');
    expect(normalizeIdentityToken('@scope/pkg name')).toBe('scope-pkg-name');
  });

  it('uses THOTH_PROJECT and persisted project.default through getConfig', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'thoth-identity-config-'));
    process.env.THOTH_DATA_DIR = tmpDir;
    writeFileSync(join(tmpDir, 'config.json'), JSON.stringify({
      project: { default: 'persisted-project' },
    }, null, 2));

    expect(getConfig().project.default).toBe('persisted-project');

    process.env.THOTH_PROJECT = 'env-project';
    expect(getConfig().project.default).toBe('env-project');
  });

  it('integration lifecycle identity preserves root ownership and deterministic degradation', () => {
    const event = (identity: NormalizedEvent['identity']): NormalizedEvent => ({
      harness: 'codex',
      intent: 'enroll_session',
      actor: 'system',
      isRootSession: true,
      identity,
      nativeEventId: 'identity-event',
      nativeEvent: 'session.start',
    });

    expect(resolveLifecycleIdentity(event({
      sessionId: 'explicit-root-session',
      project: 'explicit-root-project',
      cwd: join(tmpdir(), 'ignored-workspace'),
    }))).toMatchObject({
      rootSessionId: 'explicit-root-session',
      projectId: 'explicit-root-project',
      projectSource: 'explicit',
      sessionSource: 'explicit',
      degraded: [],
    });

    const fallbackEvent = event({ cwd: join(tmpdir(), 'Lifecycle Workspace') });
    const firstFallback = resolveLifecycleIdentity(fallbackEvent);
    const secondFallback = resolveLifecycleIdentity(fallbackEvent);
    expect(secondFallback).toEqual(firstFallback);
    expect(firstFallback).toMatchObject({
      rootSessionId: 'manual-save-lifecycle-workspace',
      projectId: 'lifecycle-workspace',
      projectSource: 'cwd',
      sessionSource: 'fallback',
    });
    expect(firstFallback.degraded).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'session_id', reason: 'missing' }),
    ]));

    expect(resolveLifecycleIdentity(event({
      sessionId: 'manual-save-placeholder-project',
      project: 'placeholder-project',
    }))).toMatchObject({
      rootSessionId: 'manual-save-placeholder-project',
      sessionSource: 'placeholder',
      degraded: expect.arrayContaining([
        expect.objectContaining({ field: 'session_id', reason: 'placeholder' }),
      ]),
    });

    const delegatedEvent: NormalizedEvent = {
      ...event({ sessionId: 'subagent-session', project: 'subagent-project' }),
      actor: 'subagent',
      isRootSession: false,
    };
    expect(resolveLifecycleIdentity(delegatedEvent, {
      sessionId: 'authoritative-root-session',
      project: 'authoritative-root-project',
    })).toMatchObject({
      rootSessionId: 'authoritative-root-session',
      projectId: 'authoritative-root-project',
      projectSource: 'explicit',
      sessionSource: 'explicit',
      degraded: [],
    });

    const delegatedWithChildCwd: NormalizedEvent = {
      ...delegatedEvent,
      identity: {
        sessionId: 'child-session',
        project: 'child-project',
        cwd: join(tmpdir(), 'child-agent-workspace'),
      },
    };
    const partialRootIdentity = resolveLifecycleIdentity(delegatedWithChildCwd, {
      sessionId: 'partial-root-session',
      project: 'partial-root-project',
    });
    expect(partialRootIdentity).toMatchObject({
      rootSessionId: 'partial-root-session',
      projectId: 'partial-root-project',
    });
    expect(partialRootIdentity.cwd).toBeUndefined();
  });

  it('integration lifecycle identity metadata is returned by handled outcomes', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'thoth-handled-identity-'));
    const lifecycleEvent: NormalizedEvent = {
      harness: 'codex',
      intent: 'enroll_session',
      actor: 'system',
      isRootSession: true,
      identity: {
        project: 'handled-identity-project',
        cwd: tmpDir,
      },
      nativeEventId: 'handled-identity-event',
      nativeEvent: 'session.start',
    };
    const identity = resolveLifecycleIdentity(lifecycleEvent);
    const capabilities = {
      enroll_session: { state: 'supported' as const, trigger: 'session.start' },
      capture_root_prompt: { state: 'supported' as const, trigger: 'user.prompt' },
      recall_guidance: { state: 'degraded' as const, reason: 'fixture omits injection' },
      compact_session: { state: 'supported' as const, trigger: 'compact' },
      finalize_session: { state: 'supported' as const, trigger: 'stop' },
    };
    const stateStore = new FileLifecycleStateStore({
      dataDir: tmpDir,
      harness: 'codex',
      projectId: identity.projectId,
      rootSessionId: identity.rootSessionId,
      capabilities,
    });
    const memoryPort: MemoryPort = {
      async call() {
        return { confirmed: true, isError: false, text: 'confirmed' };
      },
      async close() {},
    };
    const core = new MemoryIntegrationCore({ capabilities, memoryPort, stateStore });

    try {
      const result = await core.handle(lifecycleEvent);
      expect(result.identity).toEqual(identity);
      expect(result.identity).toMatchObject({
        rootSessionId: expect.stringMatching(/^manual-save-/),
        sessionSource: 'fallback',
        degraded: expect.arrayContaining([
          expect.objectContaining({ field: 'session_id', reason: 'missing' }),
        ]),
      });
    } finally {
      await memoryPort.close();
    }
  });
});
