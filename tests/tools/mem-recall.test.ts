import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../../src/store/index.js';
import { registerMemRecall } from '../../src/tools/mem-recall.js';

describe('mem_recall tool', () => {
  let store: Store;
  let toolHandler: ((input: any) => Promise<any>) | undefined;

  beforeEach(() => {
    store = new Store(':memory:');
    toolHandler = undefined;
    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_recall') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;
    registerMemRecall(server, store);
  });

  afterEach(() => {
    store.close();
  });

  it('returns fused compact recall metadata', async () => {
    store.saveObservation({ title: 'Recall target', content: 'hybrid compact marker', project: 'recall-project' });

    const result = await toolHandler?.({ query: 'hybrid compact marker', project: 'recall-project', limit: 3 });

    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].text).toContain('Recall query: hybrid compact marker');
    expect(result?.content[0].text).toContain('pending:');
    expect(result?.content[0].text).toContain('degraded_fallback:');
    expect(result?.content[0].text).toContain('evidence_lanes:');
  });

  it('can expand recall into context text', async () => {
    store.saveObservation({ title: 'Context target', content: 'expanded recall body marker', project: 'recall-project' });

    const result = await toolHandler?.({ query: 'expanded recall body marker', project: 'recall-project', mode: 'context' });

    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].text).toContain('expanded recall body marker');
    expect(result?.content[0].text).toContain('<retrieved_context observation_id=');
    expect(result?.content[0].text).toContain('</retrieved_context>');
  });

  it('context mode keeps primary sentence first and labels promoted parent context', async () => {
    const saved = store.saveObservation({
      title: 'Sentence-first context',
      content: 'Rotate encryption keys weekly. Keep parent context nearby.',
      project: 'recall-project',
    });

    const db = store.getDb();
    db.prepare(
      `INSERT INTO semantic_chunks (observation_id, chunk_key, chunk_index, content, project)
       VALUES (?, 'chunk:recall-sentence-first', 0, 'Rotate encryption keys weekly. Keep parent context nearby.', 'recall-project')`
    ).run(saved.observation.id);
    db.prepare(
      `INSERT INTO semantic_sentences (observation_id, chunk_key, sentence_key, sentence_index, content, project)
       VALUES (?, 'chunk:recall-sentence-first', 'sentence:recall-sentence-first', 0, 'Rotate encryption keys weekly.', 'recall-project')`
    ).run(saved.observation.id);
    db.prepare(
      `INSERT INTO semantic_vector_rowids (lane, source_key, vec_rowid, observation_id, lineage_hash)
       VALUES ('sentence', 'sentence:recall-sentence-first', 2001, ?, 'sentence:recall-sentence-first')`
    ).run(saved.observation.id);
    db.prepare(
      `INSERT INTO semantic_vector_rowids (lane, source_key, vec_rowid, observation_id, lineage_hash)
       VALUES ('chunk', 'chunk:recall-sentence-first', 2002, ?, 'chunk:recall-sentence-first')`
    ).run(saved.observation.id);

    const vector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 0.55 : 0));
    db.prepare('INSERT INTO vec_sentences(rowid, embedding) VALUES (2001, ?)').run(Buffer.from(new Float32Array(vector).buffer));
    db.prepare('INSERT INTO vec_chunks(rowid, embedding) VALUES (2002, ?)').run(Buffer.from(new Float32Array(vector).buffer));
    db.prepare(
      "UPDATE semantic_index_state SET pending = 0, stale = 0, degraded = 0 WHERE lane IN ('chunk','sentence')"
    ).run();

    const embeddingProvider = {
      config: store.config.embedding!,
      embed: async (texts: string[]) => texts.map(() => vector),
    };
    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_recall') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;
    registerMemRecall(server, store, { embeddingProvider });

    const result = await toolHandler?.({ query: 'rotate encryption keys', project: 'recall-project', mode: 'context' });
    const text = result?.content[0].text ?? '';
    expect(text).toContain('retrieval_contract=sentence-primary-with-parent');
    expect(text).toContain('compression_ratio=');
    expect(text).toContain('primary_sentence: Rotate encryption keys weekly.');
    expect(text).toContain('surrounding_parent_chunk: Rotate encryption keys weekly. Keep parent context nearby.');
  });

  it('passes structured filters through to hybrid retrieval', async () => {
    store.saveObservation({
      title: 'Allowed filtered recall',
      content: 'structured filter marker alpha',
      project: 'recall-project',
      session_id: 'session-allowed',
      scope: 'personal',
      topic_key: 'allowed/topic',
      type: 'decision',
    });
    store.saveObservation({
      title: 'Blocked filtered recall',
      content: 'structured filter marker alpha',
      project: 'recall-project',
      session_id: 'session-blocked',
      scope: 'project',
      topic_key: 'blocked/topic',
      type: 'bugfix',
    });

    const result = await toolHandler?.({
      query: 'structured filter marker alpha',
      project: 'recall-project',
      session_id: 'session-allowed',
      scope: 'personal',
      topic_key: 'allowed/topic',
      type: 'decision',
      limit: 5,
    });
    const text = result?.content[0].text ?? '';

    expect(result?.isError).not.toBe(true);
    expect(text).toContain('session_id: session-allowed');
    expect(text).toContain('scope: personal');
    expect(text).toContain('topic_key: allowed/topic');
    expect(text).toContain('type: decision');
    expect(text).toContain('Allowed filtered recall');
    expect(text).not.toContain('Blocked filtered recall');
  });

  it('passes time filters through to hybrid retrieval', async () => {
    store.saveObservation({
      title: 'Temporal recall target',
      content: 'temporal filter marker beta',
      project: 'recall-project',
    });

    const result = await toolHandler?.({
      query: 'temporal filter marker beta',
      project: 'recall-project',
      time_from: '2999-01-01',
      limit: 5,
    });
    const text = result?.content[0].text ?? '';

    expect(result?.isError).not.toBe(true);
    expect(text).toContain('time_from: 2999-01-01');
    expect(text).toContain('evidence:\nnone');
    expect(text).not.toContain('Temporal recall target');
  });
});
