import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMemSave } from '../../src/tools/mem-save.js';
import { Store } from '../../src/store/index.js';

describe('mem_save tool (via Store)', () => {
  let store: Store;
  let toolHandler: (input: any) => Promise<any>;
  let toolSchema: Record<string, z.ZodTypeAny>;

  async function invokeMemSave(input: Record<string, unknown>): Promise<any> {
    const parsed = z.object(toolSchema).safeParse(input);
    if (!parsed.success) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: parsed.error.issues.map((issue) => issue.message).join('; ') }],
      };
    }

    return toolHandler(parsed.data);
  }

  beforeEach(() => {
    store = new Store(':memory:');

    const server = {
      tool: vi.fn((name: string, _description: string, schema: Record<string, z.ZodTypeAny>, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_save') {
          toolSchema = schema;
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;

    registerMemSave(server, store);
  });

  afterEach(() => {
    store.close();
  });

  it('saves a new observation and returns created action', () => {
    const result = store.saveObservation({
      title: 'Test observation',
      content: '**What**: Test\n**Why**: Testing',
      project: 'test-project',
    });

    expect(result.action).toBe('created');
    expect(result.observation.id).toBeGreaterThan(0);
    expect(result.observation.title).toBe('Test observation');
  });

  it('deduplicates identical content within window', () => {
    const r1 = store.saveObservation({ title: 'Same', content: 'Same content', project: 'p' });
    const r2 = store.saveObservation({ title: 'Same', content: 'Same content', project: 'p' });

    expect(r1.action).toBe('created');
    expect(r2.action).toBe('deduplicated');
    expect(r2.observation.id).toBe(r1.observation.id);
  });

  it('upserts via topic_key', () => {
    const r1 = store.saveObservation({ title: 'V1', content: 'Version 1', topic_key: 'arch/test', project: 'p' });
    const r2 = store.saveObservation({ title: 'V2', content: 'Version 2', topic_key: 'arch/test', project: 'p' });

    expect(r1.action).toBe('created');
    expect(r2.action).toBe('upserted');
    expect(r2.observation.id).toBe(r1.observation.id);
    expect(r2.observation.revision_count).toBe(2);
  });

  it('strips private tags from content', () => {
    const result = store.saveObservation({
      title: 'Secret',
      content: 'Public info <private>secret data</private> more public',
    });

    expect(result.observation.content).not.toContain('secret data');
    expect(result.observation.content).toContain('Public info');
  });

  it('uses default type when not provided', () => {
    const result = store.saveObservation({ title: 'Test', content: 'Content' });

    expect(result.observation.type).toBe('manual');
  });

  it('handler saves prompts through kind=prompt', async () => {
    const result = await invokeMemSave({
      kind: 'prompt',
      content: 'User asked to simplify the MCP surface',
      session_id: 'save-session',
      project: 'save-project',
    });

    expect(result?.isError).not.toBe(true);
    expect(result.content[0].text).toContain('Prompt saved (prompt ID:');
    expect(result.content[0].text).toContain('mem_get(kind="prompt"');
    expect(result.content[0].text).not.toContain('Identity fallback:');
  });

  it('keeps identical root prompts in one canonical row within the dedupe window', async () => {
    const input = {
      kind: 'prompt',
      content: 'The root prompt must remain canonical',
      session_id: 'canonical-session',
      project: 'canonical-project',
    };

    const first = await invokeMemSave(input);
    const second = await invokeMemSave(input);

    expect(first.content[0].text).toContain('Prompt saved (prompt ID:');
    expect(second.content[0].text).toBe(first.content[0].text);
    expect(store.recentPrompts(10, 'canonical-project', 'canonical-session')).toHaveLength(1);
  });

  it('handler reports fallback identity for prompt saves without explicit identity', async () => {
    const result = await invokeMemSave({
      kind: 'prompt',
      content: 'User asked without identity',
    });

    expect(result?.isError).not.toBe(true);
    expect(result.content[0].text).toContain('Identity fallback:');
    expect(result.content[0].text).toContain('session_id missing -> manual-save-thoth-mem');
    expect(result.content[0].text).not.toContain('project schema-required -> unknown');
  });

  it('handler captures passive learnings through kind=passive_learnings', async () => {
    const result = await invokeMemSave({
      kind: 'passive_learnings',
      content: '## Key Learnings:\n- Compact MCP tools reduce agent confusion',
      session_id: 'save-session',
      project: 'save-project',
    });

    expect(result?.isError).not.toBe(true);
    expect(result.content[0].text).toContain('Extracted 1 learnings');
  });

  it('handler saves session summaries through kind=session_summary', async () => {
    const result = await invokeMemSave({
      kind: 'session_summary',
      content: '## Goal\nCompact tools\n\n## Accomplished\n- Done',
      session_id: 'save-session',
      project: 'save-project',
    });

    expect(result?.isError).not.toBe(true);
    expect(result.content[0].text).toContain('Session summary saved');
    expect(result.content[0].text).not.toContain('Identity fallback:');
  });

  it('handler reports fallback identity for session summaries without an id', async () => {
    const result = await invokeMemSave({
      kind: 'session_summary',
      content: '## Goal\nFallback summary\n\n## Accomplished\n- Done',
      project: 'save-project',
    });

    expect(result?.isError).not.toBe(true);
    expect(result.content[0].text).toContain('Identity fallback: session_id missing -> manual-save-save-project');
  });

  it('handler reports fallback identity for observations without explicit identity', async () => {
    const result = await invokeMemSave({
      kind: 'observation',
      title: 'Fallback observation',
      content: 'Observation content without identity',
    });

    expect(result?.isError).not.toBe(true);
    expect(result.content[0].text).toContain('Observation saved');
    expect(result.content[0].text).toContain('Identity fallback:');
    expect(result.content[0].text).toContain('session_id missing -> manual-save-thoth-mem');
  });

});
