import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { InitializeResultSchema, LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SaveMemoryResult } from '../../src/memory-core/contracts.js';
import { createServer } from '../../src/server.js';

const project = { project_key: 'repo:connection', project_name: 'Connection' };

async function connect(name = 'generic-test') {
  const directory = mkdtempSync(join(tmpdir(), 'thoth-connection-'));
  const built = createServer({ dataDir: directory });
  const client = new Client({ name, version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await built.server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    ...built, client,
    async close() {
      await client.close();
      await built.server.close();
      built.service.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

async function save(client: Client, extra: Record<string, unknown> = {}) {
  const result = await client.callTool({ name: 'mem_save', arguments: {
    ...project,
    evidence: { kind: 'explicit_save', content: 'The connection selected SQLite.' },
    memory: { kind: 'decision', title: 'Storage choice', content: 'Use SQLite for local storage.' },
    ...extra,
  } });
  expect(result.isError).not.toBe(true);
  return result.structuredContent!.data as SaveMemoryResult;
}

describe('generic MCP connection sessions', () => {
  beforeEach(() => vi.stubEnv('THOTH_MEM_NATIVE_HOST', ''));
  afterEach(() => vi.unstubAllEnvs());

  it.each(['opencode', 'codex', 'claude', 'pi'])('keeps sessionless %s-marker saves unattributed', async (harness) => {
    vi.stubEnv('THOTH_MEM_NATIVE_HOST', harness);
    const connection = await connect();
    try {
      expect((await save(connection.client)).sessionId).toBeNull();
      expect(connection.service.adoption(project.project_key).sessions.count).toBe(0);
    } finally { await connection.close(); }
  });

  it('recognizes the repository-owned Pi client name as a native fallback', async () => {
    const connection = await connect('thoth-mem-pi');
    try {
      expect((await save(connection.client)).sessionId).toBeNull();
    } finally { await connection.close(); }
  });

  it('leaves explicit pairs untouched and rejects incomplete pairs', async () => {
    const connection = await connect();
    try {
      const saved = await save(connection.client, { root_session_key: 'verified-root', harness: 'codex' });
      expect(connection.service.adoption(project.project_key).sessions.perSession).toEqual([
        { sessionId: saved.sessionId, rootSessionKey: 'verified-root', harness: 'codex', saves: 1 },
      ]);
      for (const pair of [{ root_session_key: 'partial' }, { harness: 'codex' }]) {
        const result = await connection.client.callTool({ name: 'mem_save', arguments: { ...project, ...pair, evidence: { kind: 'explicit_save', content: 'Invalid pair' } } });
        expect(result).toMatchObject({ isError: true, structuredContent: { error: { code: 'invalid_request' } } });
      }
      expect(connection.service.adoption(project.project_key).sessions.count).toBe(1);
    } finally { await connection.close(); }
  });

  it('denies root operations for its assigned identity even after native client-info spoofing', async () => {
    const connection = await connect();
    try {
      const saved = await save(connection.client);
      const assigned = connection.service.adoption(project.project_key).sessions.perSession[0]!;
      const pair = { root_session_key: assigned.rootSessionKey, harness: assigned.harness };
      await connection.client.request({ method: 'initialize', params: {
        protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'thoth-mem-pi', version: '1' },
      } }, InitializeResultSchema);
      expect((await save(connection.client)).sessionId).toBe(saved.sessionId);
      const denied = { isError: true, structuredContent: { error: {
        code: 'invalid_request', message: 'Connection sessions are unverified and cannot authorize observation review, promotion, or mem_session operations.',
      } } };
      for (const branch of [
        { observation_review: { observation_id: 'candidate', verdict: 'accepted', basis: 'root_user_confirmed', policy: { id: 'policy', version: '1' }, reason: 'Confirmed.', support_ids: [saved.evidence.id] } },
        { observation_promotion: { observation_id: 'candidate' } },
      ]) {
        for (const identity of [pair, {}]) {
          expect(await connection.client.callTool({ name: 'mem_save', arguments: { ...project, ...identity, event_key: 'authority', ...branch } })).toMatchObject(denied);
        }
      }
      for (const operation of ['enroll', 'recover', 'capture_root', 'checkpoint_pre_compact', 'guide_post_compact', 'finalize']) {
        expect(await connection.client.callTool({ name: 'mem_session', arguments: { ...project, ...pair, operation, event_key: operation } })).toMatchObject(denied);
      }
      expect(await connection.client.callTool({ name: 'mem_session', arguments: { ...project, ...pair, operation: 'finalize', event_key: 'submit', summary: {
        kind: 'final', coverage: { from_sequence: 1, to_sequence: 1 }, generator: { kind: 'root_agent', name: 'spoofed' },
        claims: [{ kind: 'decision', content: 'Use SQLite.', support_ids: [saved.evidence.id] }],
      } } })).toMatchObject(denied);
      expect(await connection.client.callTool({ name: 'mem_session', arguments: { ...project, root_session_key: 'verified', harness: 'codex', operation: 'enroll', event_key: 'native' } })).not.toHaveProperty('isError', true);
      expect(connection.service.projectSummaries({ projectKey: project.project_key }).items).toEqual([]);
    } finally { await connection.close(); }
  });

  it('never grants authority to an assigned identity reused with a new server instance', async () => {
    const previous = await connect();
    let pair!: { root_session_key: string; harness: string };
    try {
      await save(previous.client);
      const assigned = previous.service.adoption(project.project_key).sessions.perSession[0]!;
      pair = { root_session_key: assigned.rootSessionKey, harness: assigned.harness };
    } finally { await previous.close(); }
    const next = await connect('thoth-mem-pi');
    try {
      const denied = { isError: true, structuredContent: { error: { code: 'invalid_request', message: 'Connection sessions are unverified and cannot authorize observation review, promotion, or mem_session operations.' } } };
      for (const branch of [
        { observation_review: { observation_id: 'candidate', verdict: 'accepted', basis: 'root_user_confirmed', policy: { id: 'policy', version: '1' }, reason: 'Confirmed.', support_ids: ['evidence'] } },
        { observation_promotion: { observation_id: 'candidate' } },
      ]) {
        expect(await next.client.callTool({ name: 'mem_save', arguments: { ...project, ...pair, event_key: 'reused', ...branch } })).toMatchObject(denied);
      }
      expect(await next.client.callTool({ name: 'mem_session', arguments: { ...project, ...pair, operation: 'enroll', event_key: 'reused' } })).toMatchObject(denied);
      expect((await save(next.client, pair)).sessionId).toEqual(expect.any(String));
    } finally { await next.close(); }
  });

  it('uses recovery selection for sessionless context, but preserves explicit own-session reads', async () => {
    const connection = await connect();
    try {
      connection.service.save({
        project: { key: project.project_key, name: project.project_name }, session: { rootSessionKey: 'previous', harness: 'pi' },
        evidence: { kind: 'root_prompt', content: 'Continue the previous storage investigation.', capturedAt: '2020-01-01T00:00:00.000Z' },
      });
      const previous = connection.service.lifecycle({
        operation: 'finalize', project: { key: project.project_key, name: project.project_name }, harness: 'pi', rootSessionKey: 'previous', eventKey: 'previous-final',
      });
      const saved = await save(connection.client);
      const own = connection.service.deriveAndPersistSessionSummary(saved.sessionId!, 'checkpoint')!;
      const assigned = connection.service.adoption(project.project_key).sessions.perSession.find((session) => session.sessionId === saved.sessionId)!;
      const context = await connection.client.callTool({ name: 'mem_context', arguments: { project_key: project.project_key } });
      expect(context).toMatchObject({ structuredContent: { data: { selectedSummaryIds: [previous.summaryId] } } });
      const briefing = await connection.client.callTool({ name: 'mem_project', arguments: { action: 'briefing', project_key: project.project_key } });
      expect(briefing).toMatchObject({ structuredContent: { data: { selectedSummaryIds: [previous.summaryId] } } });
      const explicit = await connection.client.callTool({ name: 'mem_context', arguments: { project_key: project.project_key, root_session_key: assigned.rootSessionKey, harness: 'mcp' } });
      expect(explicit).toMatchObject({ structuredContent: { data: { selectedSummaryIds: [own.id] } } });
    } finally { await connection.close(); }
  });

  it('finalizes every connection project exactly once on transport close, leaving explicit sessions alone', async () => {
    const connection = await connect();
    try {
      const first = await save(connection.client);
      const other = await save(connection.client, { project_key: 'repo:second-project' });
      await save(connection.client, { root_session_key: 'native-root', harness: 'pi' });
      await connection.client.close();
      await connection.server.close();
      await connection.server.close();
      connection.finalizeConnectionSessions();
      connection.finalizeConnectionSessions();
      for (const [key, id] of [[project.project_key, first.sessionId], ['repo:second-project', other.sessionId]]) {
        const summaries = connection.service.projectSummaries({ projectKey: key!, history: true });
        expect(summaries.items).toMatchObject([{ sessionId: id, kind: 'final', version: 1, generator: { kind: 'harness' } }]);
        expect(summaries.items).toHaveLength(1);
      }
      expect(connection.service.projectSummaries({ projectKey: project.project_key, rootSessionKey: 'native-root', harness: 'pi' }).items).toEqual([]);
    } finally { await connection.close(); }
  });

  it('attributes sessionless evidence and memories to one mcp session per connection and project', async () => {
    const connection = await connect();
    try {
      const first = await save(connection.client);
      const second = await save(connection.client, { memory: undefined });
      expect(first.sessionId).toEqual(expect.any(String));
      expect(first.evidence.sessionId).toBe(first.sessionId);
      expect(second.sessionId).toBe(first.sessionId);
      expect(second.event?.sequence).toBe(2);
      expect(connection.service.adoption(project.project_key).sessions.perSession).toEqual([
        { sessionId: first.sessionId, rootSessionKey: expect.any(String), harness: 'mcp', saves: 2 },
      ]);
      const other = await save(connection.client, { project_key: 'repo:other-connection-project' });
      expect(other.sessionId).not.toBe(first.sessionId);
      expect(connection.service.adoption('repo:other-connection-project').sessions.perSession[0]?.harness).toBe('mcp');
    } finally { await connection.close(); }
  });
});
