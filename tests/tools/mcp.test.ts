import { describe, expect, it } from 'vitest';

import { MemoryService } from '../../src/memory-core/service.js';
import { ALL_TOOLS, createToolHandlers } from '../../src/tools/index.js';

describe('MCP boundary', () => {
  it('exposes exactly six workflow tools and rejects removed graph actions', async () => {
    expect(ALL_TOOLS).toEqual(['mem_save', 'mem_recall', 'mem_context', 'mem_get', 'mem_project', 'mem_session']);
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const handlers = createToolHandlers(service);
      const removed = await handlers.mem_project({ action: 'graph', project_key: 'repo:test' });
      expect(removed.isError).toBe(true);
      expect(removed.structuredContent).toMatchObject({ error: { code: 'invalid_request' } });
    } finally { service.close(); }
  });

  it('returns versioned structured save and progressive recall envelopes', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const handlers = createToolHandlers(service);
      const saved = await handlers.mem_save({ project_key: 'repo:test', project_name: 'test', evidence: { kind: 'explicit_save', content: 'Use strict validation.' }, memory: { kind: 'decision', title: 'Validation', content: 'Use strict validation.', topic_key: 'validation/strict' } });
      expect(saved.structuredContent).toMatchObject({ schema: 'thoth-mem.mcp.mem_save' });
      expect(JSON.stringify(saved.structuredContent)).not.toContain(`.mcp.v${2}.`);
      const compact = await handlers.mem_recall({ project_key: 'repo:test', query: 'validation', mode: 'compact', budget_chars: 300 });
      expect(compact.structuredContent).toMatchObject({ schema: 'thoth-mem.mcp.mem_recall', data: { mode: 'compact' }, lanes: { lexical: 'ready' } });
      const context = await handlers.mem_recall({ project_key: 'repo:test', query: 'validation', mode: 'context', budget_chars: 300 });
      expect(JSON.stringify(context.structuredContent)).toContain('compression_ratio');
    } finally { service.close(); }
  });

  it('accepts the canonical taxonomy and rejects non-canonical values before persistence', async () => {
    const evidenceKinds = ['root_prompt', 'explicit_save', 'checkpoint', 'handoff', 'legacy_prompt', 'legacy_observation'] as const;
    const memoryKinds = ['decision', 'convention', 'architecture', 'discovery', 'failure', 'project_structure', 'handoff', 'preference'] as const;
    const memoryOutcomes = ['unknown', 'succeeded', 'failed', 'mixed'] as const;
    const harnesses = ['opencode', 'codex', 'claude', 'mcp', 'cli', 'import'] as const;
    const lifecycleOperations = ['enroll', 'recover', 'capture_root', 'checkpoint_pre_compact', 'guide_post_compact', 'finalize'] as const;
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const handlers = createToolHandlers(service);

      for (const [index, kind] of evidenceKinds.entries()) {
        const result = await handlers.mem_save({ project_key: `repo:evidence:${index}`, project_name: 'taxonomy', evidence: { kind, content: `Evidence ${kind}` } });
        expect(result.isError, kind).not.toBe(true);
      }
      for (const [index, kind] of memoryKinds.entries()) {
        const result = await handlers.mem_save({ project_key: `repo:memory:${index}`, project_name: 'taxonomy', evidence: { kind: 'explicit_save', content: `Evidence ${kind}` }, memory: { kind, title: `Memory ${kind}`, content: `Memory ${kind}` } });
        expect(result.isError, kind).not.toBe(true);
      }
      for (const [index, outcome] of memoryOutcomes.entries()) {
        const result = await handlers.mem_save({ project_key: `repo:outcome:${index}`, project_name: 'taxonomy', evidence: { kind: 'explicit_save', content: `Evidence ${outcome}` }, memory: { kind: 'decision', title: `Memory ${outcome}`, content: `Memory ${outcome}`, outcome } });
        expect(result.isError, outcome).not.toBe(true);
      }
      for (const [index, harness] of harnesses.entries()) {
        const result = await handlers.mem_save({ project_key: `repo:harness:${index}`, project_name: 'taxonomy', root_session_key: `root-${index}`, harness, evidence: { kind: 'explicit_save', content: `Evidence ${harness}` } });
        expect(result.isError, harness).not.toBe(true);
      }
      for (const [index, operation] of lifecycleOperations.entries()) {
        const result = await handlers.mem_session({ operation, harness: 'mcp', project_key: `repo:lifecycle:${index}`, project_name: 'taxonomy', root_session_key: `root-${index}`, event_key: `event-${index}` });
        expect(result.isError, operation).not.toBe(true);
      }

      const invalidCases = [
        { field: 'evidence.kind', input: { project_key: 'repo:invalid:evidence', project_name: 'taxonomy', evidence: { kind: 'certification', content: 'Must fail.' } }, handler: handlers.mem_save },
        { field: 'memory.kind', input: { project_key: 'repo:invalid:memory', project_name: 'taxonomy', evidence: { kind: 'explicit_save', content: 'Must fail.' }, memory: { kind: 'learning', title: 'Must fail', content: 'Must fail.' } }, handler: handlers.mem_save },
        { field: 'memory.outcome', input: { project_key: 'repo:invalid:outcome', project_name: 'taxonomy', evidence: { kind: 'explicit_save', content: 'Must fail.' }, memory: { kind: 'decision', title: 'Must fail', content: 'Must fail.', outcome: 'successful' } }, handler: handlers.mem_save },
        { field: 'harness', input: { project_key: 'repo:invalid:harness', project_name: 'taxonomy', root_session_key: 'root', harness: 'cursor', evidence: { kind: 'explicit_save', content: 'Must fail.' } }, handler: handlers.mem_save },
        { field: 'operation', input: { operation: 'restore', harness: 'mcp', project_key: 'repo:invalid:operation', project_name: 'taxonomy', root_session_key: 'root', event_key: 'event' }, handler: handlers.mem_session },
      ];
      const projectCount = service.listProjects().length;
      for (const testCase of invalidCases) {
        const result = await testCase.handler(testCase.input);
        expect(result.isError, testCase.field).toBe(true);
        expect(JSON.stringify(result.structuredContent), testCase.field).toContain(testCase.field);
      }
      expect(service.listProjects()).toHaveLength(projectCount);
      expect(ALL_TOOLS).toHaveLength(6);
    } finally { service.close(); }
  });

  it('correlates compact recall with explicit full-fetch escalation telemetry', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const handlers = createToolHandlers(service);
      const saved = await handlers.mem_save({ project_key: 'repo:telemetry', project_name: 'telemetry', evidence: { kind: 'explicit_save', content: 'Escalation source content.' }, memory: { kind: 'decision', title: 'Escalation', content: 'Escalation source content.' } });
      const memoryId = (saved.structuredContent.data as { memory: { id: string } }).memory.id;
      const recall = await handlers.mem_recall({ project_key: 'repo:telemetry', query: 'escalation', correlation_id: 'trace-1' });
      const full = await handlers.mem_get({ id: memoryId, correlation_id: 'trace-1' });
      expect(recall.structuredContent).toMatchObject({ correlation_id: 'trace-1', telemetry: { stage: 'compact', escalated: false } });
      expect(full.structuredContent).toMatchObject({ correlation_id: 'trace-1', telemetry: { stage: 'full_fetch', escalated: true, avoided: false } });
    } finally { service.close(); }
  });

  it('finalizes and reconciles one correlated bounded-to-full answer path', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const handlers = createToolHandlers(service);
      const saved = await handlers.mem_save({ project_key: 'repo:context', project_name: 'context', evidence: { kind: 'explicit_save', content: 'Supporting evidence for the bounded context.' }, memory: { kind: 'decision', title: 'Bounded context', content: `Keep this public guidance. <private>${'secret'.repeat(20)}</private> ${'bounded '.repeat(30)}` } });
      const memory = (saved.structuredContent.data as { memory: { id: string; evidenceIds: string[] } }).memory;
      const context = await handlers.mem_context({ project_key: 'repo:context', budget_chars: 100, correlation_id: 'context-trace-1' });
      const full = await handlers.mem_get({ id: memory.id, correlation_id: 'context-trace-1' });
      const finalizedContext = await handlers.mem_context({ project_key: 'repo:context', budget_chars: 100, correlation_id: 'context-trace-2', finalize_answer: true });

      expect(context.structuredContent).toMatchObject({
        correlation_id: 'context-trace-1',
        sources: expect.arrayContaining([memory.id, ...memory.evidenceIds]),
        budget: {
          requested_chars: 100,
          returned_chars: expect.any(Number),
          truncated_chars: expect.any(Number),
          source_chars: expect.any(Number),
          evidence_chars: expect.any(Number),
          full_chars: expect.any(Number),
          token_basis: 'estimated_chars_div_4',
        },
        telemetry: { stage: 'context', finalized: false, escalated: false, avoided: false, full_fetches: 0, avoided_full_fetches: 0 },
      });
      expect((context.structuredContent.budget as { returned_chars: number }).returned_chars).toBeLessThanOrEqual(100);
      expect(JSON.stringify(context.structuredContent)).not.toContain('secret');
      expect(full.structuredContent).toMatchObject({
        correlation_id: 'context-trace-1',
        sources: expect.arrayContaining([memory.id, ...memory.evidenceIds]),
        telemetry: { stage: 'full_fetch', finalized: true, escalated: true, avoided: false, full_fetches: 1, avoided_full_fetches: 0 },
      });
      expect(JSON.stringify(full.structuredContent)).not.toContain('secret');
      expect(finalizedContext.structuredContent).toMatchObject({
        correlation_id: 'context-trace-2',
        telemetry: { stage: 'context', finalized: true, escalated: false, avoided: true, full_fetches: 0, avoided_full_fetches: 1 },
      });
    } finally { service.close(); }
  });
});
