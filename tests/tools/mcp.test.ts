import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { MemoryService } from '../../src/memory-core/service.js';
import { createServer } from '../../src/server.js';
import { ALL_TOOLS, createToolHandlers, MEMORY_TOOL_CATALOG } from '../../src/tools/index.js';

describe('MCP boundary', () => {
  it('derives tools/list names, descriptions, and schemas from the authoritative catalog', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-catalog-'));
    const built = createServer({ dataDir: root });
    const client = new Client({ name: 'catalog-test', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await built.server.connect(serverTransport);
      await client.connect(clientTransport);
      const listed = (await client.listTools()).tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
      expect(listed).toEqual(MEMORY_TOOL_CATALOG);
      const saveTool = listed.find((tool) => tool.name === 'mem_save');
      expect(saveTool?.description).toContain('Send exactly one branch: evidence (optionally + memory for a direct promoted save; structured evidence with metadata forbids memory and requires event_key plus the session pair), observation (requires event_key; session scope also requires the session pair and coverage), observation_review or observation_promotion (each requires event_key plus the session pair).');
      expect(saveTool?.description).toContain('Supply root_session_key and harness together or omit both.');
      expect(saveTool?.inputSchema).toMatchObject({
        properties: {
          root_session_key: { description: 'Verified root session key; supply with harness or omit both. Required for session-scoped observations, observation_review, observation_promotion, and evidence with metadata; blank counts as absent.' },
          harness: { description: 'Native harness for root_session_key; supply both or omit both. Required wherever root_session_key is required.' },
          event_key: { description: 'Stable event key for idempotency; required for observation, observation_review, observation_promotion, and evidence with metadata.' },
          evidence: { description: 'Direct evidence { kind, content }; optionally add memory for a promoted save. Structured metadata forbids memory and requires event_key, root_session_key, and harness.' },
          memory: { description: 'Promoted memory for direct evidence only; requires evidence without metadata. Do not combine with observation, observation_review, or observation_promotion.' },
          observation: { description: 'Submit a supported candidate without promotion; requires event_key. Session scope also requires root_session_key, harness, and coverage.' },
          observation_review: { description: 'Review one supported observation; requires event_key, root_session_key, and harness. Send no other operation branch or memory.' },
          observation_promotion: { description: 'Promote one accepted observation without new prose; requires event_key, root_session_key, and harness. Send no other operation branch or memory.' },
        },
      });
      const contextTool = listed.find((tool) => tool.name === 'mem_context');
      expect(contextTool?.description).toContain('project_key is always required. Supply both root_session_key and harness for session context, or omit both for project context.');
      expect(contextTool?.inputSchema).toMatchObject({
        required: ['project_key'],
        properties: {
          root_session_key: { description: 'Optional verified root session key; supply with harness for session context, or omit both for project context.' },
          harness: { description: 'Native harness for root_session_key; supply both for session context, or omit both for project context.' },
        },
      });
      const recallTool = listed.find((tool) => tool.name === 'mem_recall');
      expect(recallTool?.description).toContain('temporal="current" (default) searches current guidance; temporal="history" includes historical records.');
      expect(recallTool?.inputSchema).toMatchObject({ properties: {
        query: { minLength: 1, description: 'Non-empty search string for promoted project memory.' },
        mode: { description: 'compact (default) returns bounded snippets; context adds selected memory content.' },
        temporal: { description: 'current (default) searches current guidance; history includes historical records.' },
      } });
      const getTool = listed.find((tool) => tool.name === 'mem_get');
      expect(getTool?.description).toContain('memory, summary, observation, or evidence id returned by a prior tool result.');
      expect(getTool?.description).toContain('history:true');
      expect(getTool?.inputSchema).toMatchObject({ properties: {
        id: { description: 'Memory, summary, observation, or evidence id returned by a prior tool result.' },
        history: { description: 'Set true to expand predecessor lineage for memory, summary, or observation records; evidence ids have no lineage.' },
      } });
      const projectTool = listed.find((tool) => tool.name === 'mem_project');
      expect(projectTool?.description).toContain('action="list": no fields required.');
      expect(projectTool?.description).toContain('action="timeline": project_key required; optionally since, until, cursor, limit, and budget_chars.');
      expect(projectTool?.description).toContain('action="briefing", "summaries", or "observations": project_key required; optionally supply both root_session_key and harness to select that session\'s summaries/observations (briefing still includes project-wide memories).');
      expect(projectTool?.description).toContain('action="history": id required from a prior result. temporal filters summaries/observations, not timeline.');
      expect(projectTool?.inputSchema).toMatchObject({ properties: {
        id: { description: 'Required for action="history"; send a record id returned by a prior tool result.' },
        root_session_key: { description: 'Optional session filter for action="briefing", "summaries", or "observations"; supply with harness or omit both.' },
        cursor: { description: 'Unchanged nextCursor from a prior mem_project action="timeline" result; keep project_key, since, and until unchanged.' },
      } });
      const sessionTool = listed.find((tool) => tool.name === 'mem_session');
      expect(sessionTool?.description).toContain('summary is optional and only valid for operation="checkpoint_pre_compact" with kind="checkpoint" or operation="finalize" with kind="final".');
      expect(sessionTool?.inputSchema).toMatchObject({ properties: {
        event_key: { description: 'Stable lifecycle event key; retries for the same operation must resend identical content/summary.' },
        summary: {
          description: 'Optional only for operation="checkpoint_pre_compact" (kind="checkpoint") or operation="finalize" (kind="final"). coverage starts at 1 and to_sequence must advance the current summary for this session and kind. support_ids must be evidence ids from this project_key + root_session_key/harness session inside coverage. Canonical submission limit: 20000 UTF-16 units.',
          properties: {
            kind: { description: 'Send checkpoint for operation="checkpoint_pre_compact" or final for operation="finalize".' },
            coverage: { properties: {
              from_sequence: { description: 'Inclusive first session event sequence; must start at 1.' },
              to_sequence: { description: 'Inclusive last session event sequence; must be >= from_sequence and exceed the current summary ending sequence for this session and kind.' },
            } },
            claims: { items: { properties: {
              content: { description: 'Atomic claim content; at most 2000 code points after privacy filtering.' },
              support_ids: { description: '1-16 distinct evidence ids from this project_key + root_session_key/harness session inside summary.coverage; never memory, summary, or observation ids.' },
            } } },
          },
        },
      } });
    } finally {
      await client.close();
      await built.server.close();
      built.service.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

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

  it('bounds structured project alias inspection and reports truncation', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const aliases = Array.from({ length: 260 }, (_, index) => `path:C:/mcp-alias-${String(index).padStart(3, '0')}`);
      service.save({
        project: { key: 'git:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'MCP aliases', aliases },
        evidence: { kind: 'explicit_save', content: 'bounded MCP alias fixture' },
      });
      const handlers = createToolHandlers(service);
      const result = await handlers.mem_project({ action: 'list' });
      const structured = result.structuredContent as { data: { projects: Array<{ aliases: string[]; aliasCount: number; aliasesTruncated: boolean }> } };
      expect(structured.data.projects[0]).toMatchObject({ aliasCount: 260, aliasesTruncated: true });
      expect(structured.data.projects[0]!.aliases).toHaveLength(256);
    } finally { service.close(); }
  });

  it('exposes a compact promoted-memory timeline through mem_project and defers expansion to mem_get', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const handlers = createToolHandlers(service);
      const saved = await handlers.mem_save({
        project_key: 'repo:timeline-mcp',
        project_name: 'timeline-mcp',
        event_key: 'timeline-memory',
        evidence: { kind: 'explicit_save', content: 'RAW SUPPORT MUST STAY DEFERRED' },
        memory: { kind: 'decision', title: 'Timeline choice', content: 'Use the compact timeline.', topic_key: 'timeline/choice', outcome: 'mixed' },
      });
      const memory = (saved.structuredContent.data as { memory: { id: string; evidenceIds: string[] } }).memory;
      service.save({
        project: { key: 'repo:timeline-mcp', name: 'timeline-mcp' },
        eventKey: 'older-timeline-memory',
        evidence: { kind: 'explicit_save', content: 'OLDER RAW SUPPORT MUST STAY DEFERRED', capturedAt: '2020-01-01T00:00:00.000Z' },
        memory: { kind: 'discovery', title: 'Older timeline entry', content: 'Older compact entry.' },
      });

      const timeline = await handlers.mem_project({ action: 'timeline', project_key: 'repo:timeline-mcp', limit: 1, budget_chars: 2_000 });
      expect(timeline).toMatchObject({
        structuredContent: {
          schema: 'thoth-mem.mcp.mem_project',
          data: {
            action: 'timeline',
            items: [{ id: memory.id, title: 'Timeline choice', snippet: 'Use the compact timeline.', topicKey: 'timeline/choice', outcome: 'mixed', status: 'current' }],
            nextCursor: expect.any(String),
            hasMore: true,
          },
          sources: [memory.id],
          budget: { requested_chars: 2_000, returned_chars: expect.any(Number) },
          warnings: ['payload_truncated'],
        },
      });
      const serialized = JSON.stringify(timeline.structuredContent);
      expect(serialized).not.toContain(memory.evidenceIds[0]!);
      expect(serialized).not.toContain('RAW SUPPORT MUST STAY DEFERRED');
      expect(serialized).not.toContain('OLDER RAW SUPPORT MUST STAY DEFERRED');
      expect(serialized).not.toMatch(/evidenceIds|supportIds|submissionEvidenceId|claims|observations|session_events/iu);

      const nextCursor = (timeline.structuredContent.data as { nextCursor: string }).nextCursor;
      const nextPage = await handlers.mem_project({ action: 'timeline', project_key: 'repo:timeline-mcp', cursor: nextCursor, limit: 1, budget_chars: 2_000 });
      expect(nextPage).toMatchObject({ structuredContent: { data: { action: 'timeline', items: [{ title: 'Older timeline entry' }], nextCursor: null, hasMore: false }, warnings: [] } });

      const expanded = await handlers.mem_get({ id: memory.id });
      expect(expanded).toMatchObject({ structuredContent: { data: { record: { id: memory.id, evidenceIds: memory.evidenceIds } } } });
      expect(ALL_TOOLS).toHaveLength(6);
    } finally { service.close(); }
  });

  it('rejects unsafe timeline requests without writes and returns an empty unknown-project page', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const handlers = createToolHandlers(service);
      const before = service.listProjects();
      const invalid = await handlers.mem_project({ action: 'timeline', project_key: 'repo:missing', since: 'invalid' });
      const malformed = await handlers.mem_project({ action: 'timeline', project_key: 'repo:missing', cursor: 'not+a+cursor' });
      const unsupported = await handlers.mem_project({ action: 'timeline', project_key: 'repo:missing', temporal: 'history' });
      const listWithTimelineField = await handlers.mem_project({ action: 'list', since: '2026-01-01T00:00:00Z' });
      const briefingWithTimelineField = await handlers.mem_project({ action: 'briefing', project_key: 'repo:missing', until: '2026-01-01T00:00:00Z' });
      const legacy = await handlers.mem_project({ action: 'briefing', project_key: 'repo:missing', include_timeline: true });
      expect(invalid).toMatchObject({ structuredContent: { error: { message: 'since must be an ISO-8601 instant for action="timeline"; send e.g. "2026-01-01T00:00:00Z"' } } });
      expect(malformed).toMatchObject({ structuredContent: { error: { message: 'cursor must be an unchanged nextCursor from mem_project action="timeline"' } } });
      for (const cursor of ['', 'x'.repeat(4_097)]) {
        expect(await handlers.mem_project({ action: 'timeline', project_key: 'repo:missing', cursor })).toMatchObject({ isError: true, structuredContent: { error: { message: 'cursor: cursor must be an unchanged nextCursor from mem_project action="timeline"' } } });
      }
      const invalidBudget = await handlers.mem_project({ action: 'timeline', project_key: 'repo:missing', budget_chars: 0 });
      expect(invalidBudget).toMatchObject({ isError: true, structuredContent: { error: { message: 'budget_chars must be a positive integer for action="timeline"' } } });
      const invalidLimit = await handlers.mem_project({ action: 'timeline', project_key: 'repo:missing', limit: 0 });
      expect(invalidLimit).toMatchObject({ isError: true, structuredContent: { error: { message: 'limit: limit must be an integer from 1 to 100 for action="timeline" or action="observations"' } } });
      for (const result of [invalid, malformed, unsupported, listWithTimelineField, briefingWithTimelineField, legacy]) expect(result.isError).toBe(true);
      expect(unsupported).toMatchObject({ structuredContent: { error: { message: 'action="timeline" does not accept temporal; send only project_key, since, until, cursor, limit, and budget_chars' } } });
      expect(listWithTimelineField).toMatchObject({ structuredContent: { error: { message: 'received since for action="list"; omit these timeline-only fields or use action="timeline"' } } });
      expect(briefingWithTimelineField).toMatchObject({ structuredContent: { error: { message: 'received until for action="briefing"; omit these timeline-only fields or use action="timeline"' } } });
      const multipleForbidden = await handlers.mem_project({ action: 'timeline', project_key: 'repo:missing', id: 'record', root_session_key: 'root', harness: 'codex', temporal: 'current', state: 'pending' });
      expect(multipleForbidden).toMatchObject({ isError: true, structuredContent: { error: { message: 'action="timeline" does not accept id, root_session_key, harness, temporal, state; send only project_key, since, until, cursor, limit, and budget_chars' } } });
      const multipleTimelineFields = await handlers.mem_project({ action: 'history', id: 'record', since: '2026-01-01T00:00:00Z', cursor: 'cursor' });
      expect(multipleTimelineFields).toMatchObject({ isError: true, structuredContent: { error: { message: 'received since, cursor for action="history"; omit these timeline-only fields or use action="timeline"' } } });

      const unknown = await handlers.mem_project({ action: 'timeline', project_key: 'repo:missing' });
      expect(unknown).toMatchObject({ structuredContent: { data: { action: 'timeline', items: [], nextCursor: null, hasMore: false }, sources: [], warnings: [] } });
      expect(service.listProjects()).toEqual(before);
      expect(ALL_TOOLS).toHaveLength(6);
    } finally { service.close(); }
  });

  it('names the required identifier for each project action', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const handlers = createToolHandlers(service);
      for (const action of ['timeline', 'briefing', 'summaries', 'observations']) {
        const result = await handlers.mem_project({ action });
        expect(result).toMatchObject({ isError: true, structuredContent: { error: { message: `project_key is required for action="${action}"` } } });
      }
      const history = await handlers.mem_project({ action: 'history' });
      expect(history).toMatchObject({ isError: true, structuredContent: { error: { message: 'id is required for action="history"; send a record id from a prior result' } } });
      expect((await handlers.mem_project({ action: 'list' })).isError).not.toBe(true);
      expect(service.listProjects()).toEqual([]);
    } finally { service.close(); }
  });

  it('directs missing-record lookups to prior result ids and accepts evidence ids', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const handlers = createToolHandlers(service);
      const missing = await handlers.mem_get({ id: 'missing-selected-id' });
      expect(missing).toMatchObject({
        isError: true,
        structuredContent: { error: { message: 'id: no memory, summary, observation, or evidence record exists for "missing-selected-id"; send an id returned by a prior tool result' } },
      });
      const saved = service.save({ project: { key: 'repo:evidence-get', name: 'evidence-get' }, evidence: { kind: 'explicit_save', content: 'Evidence record.' } });
      const expanded = await handlers.mem_get({ id: saved.evidence.id, history: true });
      expect(expanded).toMatchObject({ structuredContent: { data: { record: { id: saved.evidence.id, content: 'Evidence record.' }, lineage: [] } } });
    } finally { service.close(); }
  });

  it('advertises and enforces a non-empty recall query', async () => {
    expect(MEMORY_TOOL_CATALOG.find((tool) => tool.name === 'mem_recall')?.inputSchema).toMatchObject({ properties: { query: { minLength: 1 } } });
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const handlers = createToolHandlers(service);
      for (const query of ['', ' \t ', undefined, 7]) {
        const result = await handlers.mem_recall({ project_key: 'repo:missing', query });
        expect(result).toMatchObject({ isError: true, structuredContent: { error: { message: 'query must be a non-empty search string' } } });
      }
      expect(await handlers.mem_recall({ project_key: ' ', query: ' ' })).toMatchObject({ isError: true, structuredContent: { error: { message: 'project_key is required' } } });
      expect(service.listProjects()).toEqual([]);
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
        const result = await handlers.mem_save({ project_key: `repo:memory:${index}`, project_name: 'taxonomy', evidence: { kind: 'explicit_save', content: `Evidence ${kind}` }, memory: { kind, title: `Memory ${kind}`, content: `Memory ${kind}`, topic_key: `taxonomy/${kind}` } });
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
      await handlers.mem_save({ project_key: 'repo:foreign', project_name: 'foreign', evidence: { kind: 'handoff', content: 'Foreign evidence.' }, memory: { kind: 'handoff', topic_key: 'handoff/test-line-212', title: 'Foreign', content: 'FOREIGN-PROJECT-CONTEXT' } });
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

  it.each([
    { operation: 'capture_root', kind: 'checkpoint', message: 'summary is only valid for operation="checkpoint_pre_compact" or operation="finalize"; received operation="capture_root"' },
    { operation: 'checkpoint_pre_compact', kind: 'final', message: 'summary.kind: send "checkpoint" for operation="checkpoint_pre_compact" or "final" for operation="finalize"; received "final" for operation="checkpoint_pre_compact"' },
    { operation: 'finalize', kind: 'checkpoint', message: 'summary.kind: send "checkpoint" for operation="checkpoint_pre_compact" or "final" for operation="finalize"; received "checkpoint" for operation="finalize"' },
  ])('explains the allowed summary for operation=$operation and kind=$kind', async ({ operation, kind, message }) => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const result = await createToolHandlers(service).mem_session({
        operation, harness: 'codex', project_key: 'repo:invalid-operation', project_name: 'invalid', root_session_key: 'root-1', event_key: 'invalid',
        summary: { kind, coverage: { from_sequence: 1, to_sequence: 1 }, generator: { kind: 'root_agent', name: 'codex' }, claims: [{ kind: 'objective', content: 'Ship safely.', support_ids: ['missing'] }] },
      });
      expect(result).toMatchObject({ isError: true, structuredContent: { error: { message } } });
      expect(service.listProjects()).toEqual([]);
    } finally { service.close(); }
  });

  it('requires identical content and summary when retrying a session event_key', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:summary-retry', name: 'summary-retry' };
    const session = { rootSessionKey: 'root-1', harness: 'codex' as const };
    try {
      const support = service.save({ project, session, eventKey: 'support', evidence: { kind: 'explicit_save', content: 'Support.' } });
      const handlers = createToolHandlers(service);
      const input = {
        operation: 'checkpoint_pre_compact', harness: session.harness, project_key: project.key, project_name: project.name, root_session_key: session.rootSessionKey, event_key: 'checkpoint', content: 'Checkpoint content.',
        summary: { kind: 'checkpoint', coverage: { from_sequence: 1, to_sequence: 1 }, generator: { kind: 'root_agent', name: 'codex' }, claims: [{ kind: 'objective', content: 'Ship safely.', support_ids: [support.evidence.id] }] },
      };
      expect((await handlers.mem_session(input)).isError).not.toBe(true);
      for (const retry of [
        { ...input, content: 'Changed content.' },
        { ...input, summary: { ...input.summary, claims: [{ ...input.summary.claims[0]!, content: 'Changed summary.' }] } },
      ]) {
        expect(await handlers.mem_session(retry)).toMatchObject({ isError: true, structuredContent: { error: { message: 'event_key was reused with different content/summary for operation="checkpoint_pre_compact"; retries with the same event_key must resend identical content/summary' } } });
      }
      expect(await handlers.mem_session(input)).toMatchObject({ structuredContent: { data: { duplicate: true } } });
      expect(service.save({ project, session, eventKey: 'after-retry', evidence: { kind: 'explicit_save', content: 'Next support.' } }).event?.sequence).toBe(4);
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

      for (const { identity, message } of [
        { identity: { root_session_key: 'root-1' }, message: 'root_session_key supplied without harness' },
        { identity: { harness: 'codex' }, message: 'harness supplied without root_session_key' },
      ]) {
        const partialContext = await handlers.mem_context({ project_key: 'repo:test', ...identity });
        expect(partialContext).toMatchObject({ isError: true, structuredContent: { error: { message: `Supply both root_session_key and harness for session context, or omit both for project context; ${message}` } } });
        for (const action of ['briefing', 'summaries', 'observations']) {
          const partialProject = await handlers.mem_project({ action, project_key: 'repo:test', ...identity });
          expect(partialProject).toMatchObject({ isError: true, structuredContent: { error: { message } } });
        }
      }
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

  it('tells memory-only saves to include direct evidence without a generic branch error', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const result = await createToolHandlers(service).mem_save({
        project_key: 'repo:missing-evidence', project_name: 'validation',
        memory: { kind: 'decision', title: 'Validation', content: 'Require direct evidence.' },
      });
      expect(result).toMatchObject({ isError: true });
      expect(result.structuredContent).toEqual({
        schema: 'thoth-mem.mcp.error',
        error: { code: 'invalid_request', message: 'memory: memory requires direct evidence: send { evidence: { kind, content }, memory }', retryable: false },
      });
      expect(service.listProjects()).toEqual([]);
    } finally { service.close(); }
  });

  it('lists the allowed branches when a save has no operation or memory', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const result = await createToolHandlers(service).mem_save({ project_key: 'repo:no-branch', project_name: 'validation' });
      expect(result).toMatchObject({
        isError: true,
        structuredContent: { error: { message: 'request: send exactly one of evidence, observation, observation_review, observation_promotion' } },
      });
      expect(service.listProjects()).toEqual([]);
    } finally { service.close(); }
  });

  it.each([
    { label: 'harness only', identity: { harness: 'codex' }, message: 'harness supplied without root_session_key' },
    { label: 'empty root with harness', identity: { root_session_key: '', harness: 'codex' }, message: 'harness supplied without root_session_key' },
    { label: 'blank root with harness', identity: { root_session_key: ' \t ', harness: 'codex' }, message: 'harness supplied without root_session_key' },
    { label: 'root only', identity: { root_session_key: 'root-1' }, message: 'root_session_key supplied without harness' },
  ])('names the missing session field for a save with $label', async ({ identity, message }) => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const result = await createToolHandlers(service).mem_save({
        project_key: 'repo:partial-session', project_name: 'validation', ...identity,
        evidence: { kind: 'explicit_save', content: 'Must not persist.' },
      });
      expect(result).toMatchObject({ isError: true, structuredContent: { error: { code: 'invalid_request', message, retryable: false } } });
      expect(service.listProjects()).toEqual([]);
    } finally { service.close(); }
  });

  it('keeps blank roots absent when no harness is supplied', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const handlers = createToolHandlers(service);
      for (const rootSessionKey of ['', ' \t ']) {
        const result = await handlers.mem_save({ project_key: 'repo:blank-session', project_name: 'validation', root_session_key: rootSessionKey, evidence: { kind: 'explicit_save', content: 'No session identity.' } });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({ schema: 'thoth-mem.mcp.mem_save' });
      }
    } finally { service.close(); }
  });

  it.each([
    {
      label: 'review with root only', identity: { root_session_key: 'root-1' },
      branch: { observation_review: { observation_id: 'missing', verdict: 'accepted', basis: 'root_user_confirmed', policy: { id: 'policy', version: '1' }, reason: 'Confirmed.', support_ids: ['missing'] } },
      message: 'harness: root_session_key supplied without harness',
    },
    {
      label: 'promotion with harness only', identity: { harness: 'codex' },
      branch: { observation_promotion: { observation_id: 'missing' } },
      message: 'root_session_key: harness supplied without root_session_key',
    },
    {
      label: 'structured support with blank root', identity: { root_session_key: ' \t ', harness: 'codex' },
      branch: { evidence: { kind: 'explicit_save', content: 'Validation.', metadata: { observation_validation: { observation_id: 'missing', result: 'passed', method: 'vitest' } } } },
      message: 'root_session_key: harness supplied without root_session_key',
    },
    {
      label: 'promotion with neither session field', identity: {},
      branch: { observation_promotion: { observation_id: 'missing' } },
      message: 'root_session_key: root_session_key and harness are required for this operation',
    },
  ])('names required session fields for $label before persistence', async ({ identity, branch, message }) => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const result = await createToolHandlers(service).mem_save({ project_key: 'repo:required-session', project_name: 'validation', event_key: 'required-session', ...identity, ...branch });
      expect(result).toMatchObject({ isError: true, structuredContent: { error: { message } } });
      expect(service.listProjects()).toEqual([]);
    } finally { service.close(); }
  });

  it('reports all missing fields for a session-scoped observation together', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const result = await createToolHandlers(service).mem_save({
        project_key: 'repo:session-observation', project_name: 'validation', harness: 'codex',
        observation: {
          kind: 'fact', scope: 'session', title: 'Candidate', claim: 'Candidate claim.',
          proposed_memory: { kind: 'discovery', title: 'Candidate', content: 'Candidate claim.' },
          support_ids: ['missing'], generator: { kind: 'root_agent', name: 'codex' },
        },
      });
      expect(result).toMatchObject({
        isError: true,
        structuredContent: { error: { message: 'event_key: event_key is required for observation operations; root_session_key: harness supplied without root_session_key; observation.coverage: coverage is required for session scope' } },
      });
      expect(service.listProjects()).toEqual([]);
    } finally { service.close(); }
  });

  it('reports every schema issue with its field path or request prefix', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const result = await createToolHandlers(service).mem_save({
        project_key: '', project_name: '', evidence: { kind: 'certification', content: 'Invalid kind.' }, unexpected: true,
      });
      expect(result).toMatchObject({ isError: true });
      expect(result.structuredContent).toEqual({
        schema: 'thoth-mem.mcp.error',
        error: {
          code: 'invalid_request', retryable: false,
          message: 'project_key: Too small: expected string to have >=1 characters; project_name: Too small: expected string to have >=1 characters; evidence.kind: Invalid input; request: Unrecognized key: "unexpected"',
        },
      });
      expect(service.listProjects()).toEqual([]);
    } finally { service.close(); }
  });

  it('retains joined validation guidance beyond 500 characters while capping errors at 1000', async () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const handlers = createToolHandlers(service);
      const result = await handlers.mem_session({
        operation: 'finalize', harness: 'codex', project_key: '', project_name: '', root_session_key: '', event_key: '',
        summary: { kind: 'final', coverage: { from_sequence: 0, to_sequence: 0 }, generator: { kind: 'root_agent', name: '' }, claims: [{ kind: 'completed', content: '', support_ids: [] }] },
      });
      expect(result).toMatchObject({ isError: true, structuredContent: { error: { message: [
        'project_key: Too small: expected string to have >=1 characters',
        'project_name: Too small: expected string to have >=1 characters',
        'root_session_key: Too small: expected string to have >=1 characters',
        'event_key: Too small: expected string to have >=1 characters',
        'summary.coverage.from_sequence: Too small: expected number to be >0',
        'summary.coverage.to_sequence: Too small: expected number to be >0',
        'summary.generator.name: Too small: expected string to have >=1 characters',
        'summary.claims.0.content: Too small: expected string to have >=1 characters',
        'summary.claims.0.support_ids: Too small: expected array to have >=1 items',
      ].join('; ') } } });
      const bounded = await handlers.mem_get({ id: 'x'.repeat(1_100) });
      expect((bounded.structuredContent.error as { message: string }).message).toHaveLength(1_000);
      expect(service.listProjects()).toEqual([]);
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
      expect(ambiguous).toMatchObject({ structuredContent: { error: { message: 'request: received evidence and observation; send exactly one of evidence, observation, observation_review, observation_promotion' } } });
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
