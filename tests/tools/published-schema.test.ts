import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createServer } from '../../src/server.js';
import { MEMORY_TOOL_CATALOG, type MemoryToolName } from '../../src/tools/index.js';

const identity = { project_key: 'repo:published-schema', project_name: 'published-schema', root_session_key: 'root', harness: 'pi' };
const observation = {
  kind: 'fact', scope: 'session', title: 'Strict validation', claim: 'Keep validation strict.',
  proposed_memory: { kind: 'convention', title: 'Strict validation', content: 'Validate every input.', topic_key: 'validation/strict', outcome: 'succeeded' },
  support_ids: ['support'], coverage: { from_sequence: 1, to_sequence: 1 },
  generator: { kind: 'root_agent', name: 'pi', version: '1', config_hash: 'a'.repeat(64) },
  concepts: ['validation'], files: ['src/tools/index.ts'],
};
const validation = { observation_id: 'candidate', result: 'passed', method: 'vitest' };
const attestation = { observation_id: 'candidate', verdict: 'accepted', reviewer: 'independent reviewer', method: 'inspection' };
const invalidInputs: Array<{ label: string; name: MemoryToolName; input: Record<string, unknown>; error: 'sdk' | 'handler' }> = [
  { label: 'empty search', name: 'mem_recall', input: { project_key: identity.project_key, query: '' }, error: 'sdk' },
  { label: 'empty evidence', name: 'mem_save', input: { ...identity, evidence: { kind: 'explicit_save', content: '' } }, error: 'sdk' },
  { label: 'over-length string', name: 'mem_save', input: { ...identity, event_key: 'invalid', observation: { ...observation, title: 'x'.repeat(501) } }, error: 'sdk' },
  { label: 'out-of-range integer', name: 'mem_project', input: { action: 'timeline', project_key: identity.project_key, limit: 101 }, error: 'sdk' },
  { label: 'nonpositive sequence', name: 'mem_save', input: { ...identity, event_key: 'invalid', observation: { ...observation, coverage: { from_sequence: 0, to_sequence: 1 } } }, error: 'sdk' },
  { label: 'empty supports', name: 'mem_save', input: { ...identity, event_key: 'invalid', observation: { ...observation, support_ids: [] } }, error: 'sdk' },
  { label: 'unknown nested key', name: 'mem_save', input: { ...identity, event_key: 'invalid', observation: { ...observation, generator: { ...observation.generator, unexpected: true } } }, error: 'sdk' },
  { label: 'combined metadata variants', name: 'mem_save', input: { ...identity, event_key: 'invalid', evidence: { kind: 'explicit_save', content: 'Support.', metadata: { observation_validation: validation, observation_review_attestation: attestation } } }, error: 'sdk' },
  { label: 'wrong evidence/metadata pairing', name: 'mem_save', input: { ...identity, event_key: 'invalid', evidence: { kind: 'handoff', content: 'Support.', metadata: { observation_validation: validation } } }, error: 'sdk' },
  { label: 'bad config_hash', name: 'mem_save', input: { ...identity, event_key: 'invalid', observation: { ...observation, generator: { ...observation.generator, config_hash: 'not-a-hash' } } }, error: 'sdk' },
  { label: 'metadata with memory', name: 'mem_save', input: { ...identity, event_key: 'invalid', evidence: { kind: 'explicit_save', content: 'Support.', metadata: { observation_validation: validation } }, memory: observation.proposed_memory }, error: 'handler' },
];

async function withClient(run: (client: Client) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'thoth-published-schema-'));
  const built = createServer({ dataDir: root, databasePath: ':memory:' });
  const client = new Client({ name: 'thoth-mem-pi', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await built.server.connect(serverTransport);
    await client.connect(clientTransport);
    await run(client);
  } finally {
    await client.close();
    await built.server.close();
    built.service.close();
    rmSync(root, { recursive: true, force: true });
  }
}

function forbiddenKeywords(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => forbiddenKeywords(item, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(['minLength', 'maxLength', 'minItems', 'maxItems', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'pattern', 'additionalProperties'].includes(key) ? [`${path}.${key}`] : []),
    ...forbiddenKeywords(child, `${path}.${key}`),
  ]);
}

function publishedSchema(name: MemoryToolName): Record<string, unknown> {
  return MEMORY_TOOL_CATALOG.find((tool) => tool.name === name)!.inputSchema;
}

function expectDeclaredFields(schema: Record<string, unknown>, input: unknown): void {
  if (Array.isArray(input)) {
    for (const item of input) expectDeclaredFields(schema.items as Record<string, unknown>, item);
  } else if (input && typeof input === 'object') {
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    for (const [key, value] of Object.entries(input)) {
      expect(Object.keys(properties)).toContain(key);
      expectDeclaredFields(properties[key], value);
    }
  }
}

describe('compact publication and strict validation', () => {
  it('publishes only structural constraints on every tool, with one evidence object', async () => {
    await withClient(async (client) => {
      const tools = (await client.listTools()).tools;
      for (const tool of tools) {
        expect(forbiddenKeywords(tool.inputSchema), tool.name).toEqual([]);
        const { $schema, ...schema } = tool.inputSchema;
        expect($schema).toBe('http://json-schema.org/draft-07/schema#');
        expect(schema).toEqual(MEMORY_TOOL_CATALOG.find((item) => item.name === tool.name)!.inputSchema);
      }
      const save = MEMORY_TOOL_CATALOG.find((tool) => tool.name === 'mem_save')!.inputSchema;
      expect(save).toMatchObject({ required: ['project_key', 'project_name'], properties: {
        evidence: { type: 'object', required: ['kind', 'content'], properties: {
          metadata: { type: 'object', properties: { observation_validation: { type: 'object' }, observation_review_attestation: { type: 'object' } } },
        } },
        observation: { properties: { coverage: { properties: { from_sequence: { type: 'integer' }, to_sequence: { type: 'integer' } } } } },
      } });
      const evidence = (save.properties as Record<string, Record<string, unknown>>).evidence;
      expect(evidence).not.toHaveProperty('anyOf');
      expect(evidence).not.toHaveProperty('oneOf');
      expect((evidence.properties as Record<string, Record<string, unknown>>).metadata).not.toHaveProperty('required');
    });
  });

  it.each(invalidInputs)('preserves the strict $error rejection for $label through MCP', async ({ name, input, error }) => {
    await withClient(async (client) => {
      const result = await client.callTool({ name, arguments: input });
      expect(result.isError).toBe(true);
      if (error === 'sdk') {
        expect(result.structuredContent).toBeUndefined();
        expect(result.content).toEqual([{ type: 'text', text: expect.stringContaining(`MCP error -32602: Input validation error: Invalid arguments for tool ${name}:`) }]);
      } else {
        expect(result.structuredContent).toEqual({ schema: 'thoth-mem.mcp.error', error: { code: 'invalid_request', message: 'memory: structured support evidence cannot include memory', retryable: false } });
        expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.structuredContent) }]);
      }
      expect(z.fromJSONSchema(publishedSchema(name)).safeParse(input).success).toBe(true);
    });
  });

  it('accepts strictly valid inputs for every tool, project action, and save branch in the published schema', async () => {
    await withClient(async (client) => {
      const call = async (name: MemoryToolName, input: Record<string, unknown>): Promise<Record<string, unknown>> => {
        const schema = publishedSchema(name);
        expectDeclaredFields(schema, input);
        expect(z.fromJSONSchema(schema).safeParse(input).success, `${name}: ${JSON.stringify(input)}`).toBe(true);
        const result = await client.callTool({ name, arguments: input });
        expect(result.isError, JSON.stringify(result)).not.toBe(true);
        return (result.structuredContent as { data: Record<string, unknown> }).data;
      };
      const source = await call('mem_save', { ...identity, event_key: 'source', evidence: { kind: 'explicit_save', content: 'Verified strict validation.', source_ref: 'src/tools/index.ts' } });
      const supportId = (source.evidence as { id: string }).id;
      const memory = await call('mem_save', { ...identity, event_key: 'memory', evidence: { kind: 'explicit_save', content: 'Verified convention.' }, memory: observation.proposed_memory });
      const memoryId = (memory.memory as { id: string }).id;
      await call('mem_save', { ...identity, event_key: 'successor', evidence: { kind: 'explicit_save', content: 'Updated convention.' }, memory: { ...observation.proposed_memory, content: 'Keep strict validation.', supersedes_id: memoryId } });
      const candidate = await call('mem_save', { ...identity, event_key: 'observation', observation: { ...observation, support_ids: [supportId] } });
      const candidateId = (candidate.observation as { id: string }).id;
      const correction = await call('mem_save', { ...identity, event_key: 'correction', observation: { ...observation, support_ids: [supportId], predecessor_id: candidateId } });
      const correctionId = (correction.observation as { id: string }).id;
      const { coverage: _coverage, ...projectObservation } = observation;
      await call('mem_save', { ...identity, event_key: 'project-observation', observation: { ...projectObservation, scope: 'project', support_ids: [supportId] } });
      const validated = await call('mem_save', { ...identity, event_key: 'validation', evidence: { kind: 'explicit_save', content: 'Tests passed.', source_ref: 'vitest', metadata: { observation_validation: { ...validation, observation_id: correctionId } } } });
      await call('mem_save', { ...identity, event_key: 'attestation', evidence: { kind: 'handoff', content: 'Independently inspected.', source_ref: 'review', metadata: { observation_review_attestation: { ...attestation, observation_id: correctionId } } } });
      await call('mem_save', { ...identity, event_key: 'review', observation_review: { observation_id: correctionId, verdict: 'accepted', basis: 'observable_validation', policy: { id: 'durable-memory', version: '1' }, reason: 'Verified with tests.', support_ids: [(validated.evidence as { id: string }).id] } });
      await call('mem_save', { ...identity, event_key: 'promotion', observation_promotion: { observation_id: correctionId } });
      await call('mem_session', { ...identity, operation: 'checkpoint_pre_compact', event_key: 'summary', content: 'Verified summary.', summary: { coverage: { from_sequence: 1, to_sequence: 1 }, generator: observation.generator, claims: [{ kind: 'verification', content: 'Verified strict validation.', outcome: 'succeeded', support_ids: [supportId] }] } });
      await call('mem_recall', { project_key: identity.project_key, query: 'validation', mode: 'compact', temporal: 'current', budget_chars: 2_000, limit: 5, correlation_id: 'published-recall', finalize_answer: true });
      await call('mem_context', { project_key: identity.project_key, root_session_key: identity.root_session_key, harness: identity.harness, budget_chars: 2_000, correlation_id: 'published-context', finalize_answer: true });
      await call('mem_get', { id: memoryId, history: true, correlation_id: 'published-get' });
      await call('mem_project', { action: 'list' });
      await call('mem_project', { action: 'history', id: memoryId });
      const timelineInput = { action: 'timeline', project_key: identity.project_key, since: '2020-01-01T00:00:00Z', until: '2099-01-01T00:00:00Z', limit: 1, budget_chars: 2_000 };
      const timeline = await call('mem_project', timelineInput);
      expect(timeline.nextCursor).toEqual(expect.any(String));
      await call('mem_project', { ...timelineInput, cursor: timeline.nextCursor });
      for (const action of ['briefing', 'summaries', 'observations']) {
        await call('mem_project', { action, project_key: identity.project_key, root_session_key: identity.root_session_key, harness: identity.harness, budget_chars: 2_000, ...(action !== 'briefing' ? { temporal: 'history' } : {}), ...(action === 'observations' ? { state: 'pending', limit: 10 } : {}) });
      }
    });
  });
});
