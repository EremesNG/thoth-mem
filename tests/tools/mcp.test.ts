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

  it('keeps evidence lineage behind get/history while sharing one isolated briefing selector', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const handlers = createToolHandlers(service);
      const old = await handlers.mem_save({ project_key: 'repo:progressive', project_name: 'progressive', evidence: { kind: 'explicit_save', content: 'Old decision evidence.' }, memory: { kind: 'decision', title: 'Runtime', content: 'Use the old runtime.', topic_key: 'runtime' } });
      const current = await handlers.mem_save({ project_key: 'repo:progressive', project_name: 'progressive', evidence: { kind: 'explicit_save', content: 'Current decision evidence.' }, memory: { kind: 'decision', title: 'Runtime', content: 'Use the current runtime.', topic_key: 'runtime' } });
      const handoff = await handlers.mem_save({ project_key: 'repo:progressive', project_name: 'progressive', evidence: { kind: 'handoff', content: 'Handoff evidence.' }, memory: { kind: 'handoff', title: 'Continuation', content: 'First pending action: finish the MCP boundary.', topic_key: 'handoff/current' } });
      await handlers.mem_save({ project_key: 'repo:foreign', project_name: 'foreign', evidence: { kind: 'handoff', content: 'Foreign evidence.' }, memory: { kind: 'handoff', title: 'Foreign', content: 'FOREIGN-PROJECT-CONTEXT' } });
      const oldMemory = (old.structuredContent.data as { memory: { id: string; evidenceIds: string[] } }).memory;
      const currentMemory = (current.structuredContent.data as { memory: { id: string; evidenceIds: string[] } }).memory;
      const handoffMemory = (handoff.structuredContent.data as { memory: { id: string; evidenceIds: string[] } }).memory;

      const compact = await handlers.mem_recall({ project_key: 'repo:progressive', query: 'current runtime', mode: 'compact', temporal: 'history' });
      const context = await handlers.mem_context({ project_key: 'repo:progressive', budget_chars: 1_000 });
      const briefing = await handlers.mem_project({ action: 'briefing', project_key: 'repo:progressive', budget_chars: 1_000 });
      const contextItems = (context.structuredContent.data as { items: Array<{ id: string }> }).items;
      const briefingItems = (briefing.structuredContent.data as { items: Array<{ id: string }> }).items;

      expect((compact.structuredContent.data as { items: unknown[] }).items.every((item) => !Object.hasOwn(item as object, 'evidenceIds'))).toBe(true);
      expect((context.structuredContent.data as { items: unknown[] }).items.every((item) => !Object.hasOwn(item as object, 'evidenceIds'))).toBe(true);
      expect((briefing.structuredContent.data as { items: unknown[] }).items.every((item) => !Object.hasOwn(item as object, 'evidenceIds'))).toBe(true);
      expect(contextItems.map((item) => item.id)).toEqual(briefingItems.map((item) => item.id));
      expect(contextItems[0]?.id).toBe(handoffMemory.id);
      expect(JSON.stringify(context.structuredContent)).not.toContain('FOREIGN-PROJECT-CONTEXT');
      expect(context.structuredContent.sources).toEqual(contextItems.map((item) => item.id));
      expect(JSON.stringify(compact.structuredContent)).not.toContain(currentMemory.evidenceIds[0]);
      expect(JSON.stringify(context.structuredContent)).not.toContain(handoffMemory.evidenceIds[0]);

      const full = await handlers.mem_get({ id: currentMemory.id, history: true });
      const history = await handlers.mem_project({ action: 'history', id: currentMemory.id });
      expect(full.structuredContent.sources).toEqual(expect.arrayContaining([currentMemory.id, currentMemory.evidenceIds[0], oldMemory.id, oldMemory.evidenceIds[0]]));
      expect(history.structuredContent.sources).toEqual(expect.arrayContaining([currentMemory.id, currentMemory.evidenceIds[0], oldMemory.id, oldMemory.evidenceIds[0]]));
      expect(JSON.stringify(history.structuredContent)).toContain(currentMemory.evidenceIds[0]);
      expect(ALL_TOOLS).toHaveLength(6);
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
        sources: [memory.id],
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
      expect(JSON.stringify(context.structuredContent)).not.toContain(memory.evidenceIds[0]);
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

  it('submits, expands, and lists supported summaries through the existing six tools', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const handlers = createToolHandlers(service);
      const support = await handlers.mem_save({ project_key: 'repo:summary', project_name: 'summary', root_session_key: 'root-1', harness: 'codex', event_key: 'support', evidence: { kind: 'explicit_save', content: 'SUPPORT CONTENT MUST STAY DEFERRED' } });
      const supportId = (support.structuredContent.data as { evidence: { id: string } }).evidence.id;
      const submitted = await handlers.mem_session({
        operation: 'checkpoint_pre_compact', harness: 'codex', project_key: 'repo:summary', project_name: 'summary', root_session_key: 'root-1', event_key: 'summary-1',
        summary: { kind: 'checkpoint', coverage: { from_sequence: 1, to_sequence: 1 }, generator: { kind: 'root_agent', name: 'codex' }, claims: [{ kind: 'objective', content: 'Ship safely.', support_ids: [supportId] }] },
      });
      expect(submitted.isError).not.toBe(true);
      const summaryId = (submitted.structuredContent.data as { summaryId: string }).summaryId;
      expect(summaryId).toEqual(expect.any(String));

      const expanded = await handlers.mem_get({ id: summaryId, history: true });
      expect(expanded.structuredContent).toMatchObject({ data: { record: { recordType: 'summary', id: summaryId, claims: [{ supportIds: [supportId] }] } } });
      expect(JSON.stringify(expanded.structuredContent)).not.toContain('SUPPORT CONTENT MUST STAY DEFERRED');

      const summaries = await handlers.mem_project({ action: 'summaries', project_key: 'repo:summary', root_session_key: 'root-1', harness: 'codex', temporal: 'current', budget_chars: 2_000 });
      expect(summaries.structuredContent).toMatchObject({ data: { action: 'summaries', items: [{ recordType: 'summary', id: summaryId }] } });
      expect(ALL_TOOLS).toHaveLength(6);
    } finally { service.close(); }
  });

  it('rejects malformed nested summaries and partial session identity without side effects', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const handlers = createToolHandlers(service);
      const malformed = await handlers.mem_session({
        operation: 'checkpoint_pre_compact', harness: 'codex', project_key: 'repo:invalid-summary', project_name: 'invalid', root_session_key: 'root-1', event_key: 'invalid',
        summary: { kind: 'checkpoint', coverage: { from_sequence: 1, to_sequence: 1, unexpected: true }, generator: { kind: 'root_agent', name: 'codex' }, claims: [{ kind: 'objective', content: 'Invalid.', support_ids: ['missing'] }] },
      });
      expect(malformed).toMatchObject({ isError: true, structuredContent: { error: { retryable: false } } });
      expect(service.listProjects()).toEqual([]);

      const partialContext = await handlers.mem_context({ project_key: 'repo:test', root_session_key: 'root-1' });
      const partialBriefing = await handlers.mem_project({ action: 'briefing', project_key: 'repo:test', harness: 'codex' });
      expect(partialContext.isError).toBe(true);
      expect(partialBriefing.isError).toBe(true);
      expect(ALL_TOOLS).toHaveLength(6);
    } finally { service.close(); }
  });

  it('submits, reviews, promotes, lists, and expands observations through the existing six tools', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const handlers = createToolHandlers(service);
      const identity = { project_key: 'repo:observation-mcp', project_name: 'observation-mcp', root_session_key: 'root-1', harness: 'codex' as const };
      const source = await handlers.mem_save({ ...identity, event_key: 'source', evidence: { kind: 'explicit_save', content: 'RAW SOURCE MUST STAY DEFERRED' } });
      const confirmation = await handlers.mem_save({ ...identity, event_key: 'confirmation', evidence: { kind: 'root_prompt', content: 'Confirm the local-only constraint.' } });
      const sourceId = (source.structuredContent.data as { evidence: { id: string } }).evidence.id;
      const confirmationId = (confirmation.structuredContent.data as { evidence: { id: string } }).evidence.id;
      const submitted = await handlers.mem_save({
        ...identity, event_key: 'candidate',
        observation: {
          kind: 'constraint', scope: 'project', title: 'Local only', claim: 'The memory core remains local only.',
          proposed_memory: { kind: 'architecture', title: 'Local-only core', content: 'Keep the memory core fully local.', topic_key: 'core/local' },
          support_ids: [sourceId], generator: { kind: 'root_agent', name: 'codex' }, concepts: ['local'], files: ['src/memory-core'],
        },
      });
      expect(submitted.isError).not.toBe(true);
      const observationId = (submitted.structuredContent.data as { observation: { id: string } }).observation.id;
      const privateSupport = await handlers.mem_save({
        ...identity, event_key: 'private-support',
        evidence: { kind: 'explicit_save', content: 'Validation result.', metadata: { observation_validation: { observation_id: observationId, result: 'passed', method: '<private>secret method</private>' } } },
      });
      expect(privateSupport.isError).toBe(true);
      const reviewed = await handlers.mem_save({
        ...identity, event_key: 'review',
        observation_review: {
          observation_id: observationId, verdict: 'accepted', basis: 'root_user_confirmed',
          policy: { id: 'durable-memory', version: '1' }, reason: 'Confirmed by root user.', support_ids: [confirmationId],
        },
      });
      expect(reviewed).toMatchObject({ structuredContent: { data: { operation: 'review', observation: { state: 'accepted' } } } });
      const promoted = await handlers.mem_save({ ...identity, event_key: 'promotion', observation_promotion: { observation_id: observationId } });
      expect(promoted).toMatchObject({ structuredContent: { data: { operation: 'promotion', observation: { state: 'promoted' } } } });

      const queue = await handlers.mem_project({ action: 'observations', project_key: identity.project_key, temporal: 'current', budget_chars: 2_000 });
      expect(queue).toMatchObject({ structuredContent: { data: { action: 'observations', items: [{ id: observationId, state: 'promoted' }] } } });
      const expanded = await handlers.mem_get({ id: observationId, history: true });
      expect(expanded).toMatchObject({ structuredContent: { data: { record: { recordType: 'observation', id: observationId, supportIds: [sourceId] } } } });
      expect(JSON.stringify(queue.structuredContent)).not.toContain('RAW SOURCE MUST STAY DEFERRED');
      expect(JSON.stringify(expanded.structuredContent)).not.toContain('RAW SOURCE MUST STAY DEFERRED');
      expect(ALL_TOOLS).toHaveLength(6);
    } finally { service.close(); }
  });

  it('rejects ambiguous observation branches and untyped support metadata before persistence', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const handlers = createToolHandlers(service);
      const identity = { project_key: 'repo:strict-observations', project_name: 'strict-observations', root_session_key: 'root-1', harness: 'codex' as const, event_key: 'invalid' };
      const candidate = {
        kind: 'fact', scope: 'project', title: 'Candidate', claim: 'Candidate claim.',
        proposed_memory: { kind: 'discovery', title: 'Candidate', content: 'Candidate claim.' },
        support_ids: ['missing'], generator: { kind: 'root_agent', name: 'codex' },
      };
      const ambiguous = await handlers.mem_save({ ...identity, evidence: { kind: 'explicit_save', content: 'Source.' }, observation: candidate });
      const arbitraryMetadata = await handlers.mem_save({ ...identity, evidence: { kind: 'explicit_save', content: 'Source.', metadata: { arbitrary: true } } });
      const wrongPair = await handlers.mem_save({ ...identity, evidence: { kind: 'handoff', content: 'Source.', metadata: { observation_validation: { observation_id: 'missing', result: 'passed', method: 'vitest' } } } });
      const supportWithMemory = await handlers.mem_save({ ...identity, evidence: { kind: 'explicit_save', content: 'Source.', metadata: { observation_validation: { observation_id: 'missing', result: 'passed', method: 'vitest' } } }, memory: { kind: 'discovery', title: 'No', content: 'No' } });
      const implicitSupersession = await handlers.mem_save({ ...identity, observation: { ...candidate, proposed_memory: { ...candidate.proposed_memory, supersedes_id: 'memory:old' } } });
      const partialIdentity = await handlers.mem_save({ project_key: identity.project_key, project_name: identity.project_name, root_session_key: 'root-1', event_key: 'partial', observation_review: { observation_id: 'missing', verdict: 'accepted', basis: 'root_user_confirmed', policy: { id: 'policy', version: '1' }, reason: 'No.', support_ids: ['missing'] } });

      for (const result of [ambiguous, arbitraryMetadata, wrongPair, supportWithMemory, implicitSupersession, partialIdentity]) expect(result.isError).toBe(true);
      expect(service.listProjects()).toEqual([]);
      expect(ALL_TOOLS).toHaveLength(6);
    } finally { service.close(); }
  });
});
