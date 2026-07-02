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

  it('does not use maxContextChars for context-mode recall output', async () => {
    store.close();
    store = new Store(':memory:', { maxContextChars: 50 });
    registerMemRecall({
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_recall') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer, store);
    store.saveObservation({
      title: 'Independent recall budget',
      content: 'independent recall marker '.repeat(80),
      project: 'recall-project',
    });

    const result = await toolHandler?.({ query: 'independent recall marker', project: 'recall-project', mode: 'context' });
    const text = result?.content[0].text ?? '';

    expect(result?.isError).not.toBe(true);
    expect(text.length).toBeGreaterThan(50);
    expect(text.length).toBeLessThanOrEqual(6000);
    expect(text).toContain('<retrieved_context observation_id=');
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

  it('surfaces maintenance effects in compact and context output', async () => {
    store.close();
    store = new Store(':memory:', {
      maintenance: {
        consolidation: { enabled: true },
        reflection: { enabled: true, minSourceCount: 2 },
        decay: { enabled: true, staleAfterDays: 1, scoreMultiplier: 0.5 },
      },
      knowledgeGraph: { kgMultiHopEnabled: false },
    });
    registerMemRecall({
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_recall') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer, store);
    const first = store.saveObservation({
      title: 'Recall maintenance source A',
      content: 'maintenance recall duplicate marker',
      project: 'recall-maint-project',
      type: 'manual',
    }).observation;
    const second = store.saveObservation({
      title: 'Recall maintenance source B',
      content: 'maintenance recall duplicate marker',
      project: 'recall-maint-project',
      type: 'manual',
    }).observation;
    store.getDb().prepare("UPDATE observations SET created_at = '2020-01-01 00:00:00', updated_at = '2020-01-01 00:00:00' WHERE id IN (?, ?)")
      .run(first.id, second.id);
    store.runMaintenance({ scope: { project: 'recall-maint-project' } });

    const compact = await toolHandler?.({ query: 'maintenance recall duplicate marker', project: 'recall-maint-project', limit: 5 });
    const context = await toolHandler?.({ query: 'maintenance recall duplicate marker', project: 'recall-maint-project', mode: 'context', limit: 5 });
    const compactText = compact?.content[0].text ?? '';
    const contextText = context?.content[0].text ?? '';

    expect(compact?.isError).not.toBe(true);
    expect(compactText).toContain('maintenance:');
    expect(compactText).toContain('consolidation');
    expect(compactText).toContain('decay state=attenuated');
    expect(contextText).toContain('maintenance:');
    expect(contextText).toContain('sources=obs:');
  });

  it('community annotation is additive', async () => {
    vi.spyOn(store, 'hybridRetrieve').mockResolvedValue({
      results: [{
        observation: {
          id: 101,
          sync_id: 'sync-101',
          session_id: 'session-101',
          type: 'manual',
          title: 'Community evidence host',
          content: 'Community source observation content',
          tool_name: null,
          project: 'recall-community-project',
          scope: 'project',
          topic_key: null,
          normalized_hash: null,
          revision_count: 1,
          duplicate_count: 1,
          last_seen_at: null,
          created_at: '2026-01-01 00:00:00',
          updated_at: '2026-01-01 00:00:00',
          deleted_at: null,
        },
        score: 0.42,
        evidence: {
          primary: {
            lane: 'kg',
            observationId: 101,
            score: 0.42,
            source: 'kg_community_summary',
            text: 'Community c_demo connects auth and sessions.',
            community: {
              communityId: 'c_demo',
              runId: 7,
              freshness: 'fresh',
              degraded: false,
              sourceObservationIds: [101, 102],
              entityCount: 2,
              tripleCount: 3,
            },
          },
          byLane: {
            kg: [{
              lane: 'kg',
              observationId: 101,
              score: 0.42,
              source: 'kg_community_summary',
              text: 'Community c_demo connects auth and sessions.',
              community: {
                communityId: 'c_demo',
                runId: 7,
                freshness: 'fresh',
                degraded: false,
                sourceObservationIds: [101, 102],
                entityCount: 2,
                tripleCount: 3,
              },
            }],
          },
        },
      }],
      pending: false,
      degradedFallback: [],
      laneOrder: ['kg'],
      semanticInputs: [],
    } as any);

    const compact = await toolHandler?.({ query: 'auth sessions', project: 'recall-community-project', limit: 1 });
    const context = await toolHandler?.({ query: 'auth sessions', project: 'recall-community-project', mode: 'context', limit: 1 });
    const compactText = compact?.content[0].text ?? '';
    const contextText = context?.content[0].text ?? '';

    expect(compact?.isError).not.toBe(true);
    expect(compactText).toContain('[kg/kg_community_summary]');
    expect(compactText).toContain('community=c_demo');
    expect(compactText).toContain('freshness=fresh');
    expect(compactText).toContain('coverage=obs:2 triples:3');
    expect(contextText).toContain('<retrieved_context observation_id="101" lane="kg" source="kg_community_summary">');
    expect(contextText).toContain('community=c_demo');
    expect(contextText).toContain('degraded=no');
  });
});
