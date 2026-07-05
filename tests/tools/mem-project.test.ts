import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../../src/store/index.js';
import { MEM_PROJECT_INPUT_SCHEMA, registerMemProject } from '../../src/tools/mem-project.js';

describe('mem_project tool', () => {
  let store: Store;
  let toolHandler: ((input: any) => Promise<any>) | undefined;

  function seedLargeProject(project = 'project-a'): string {
    const fullMarker = 'MEM-PROJECT-FULL-MARKER';
    for (let i = 0; i < 30; i++) {
      store.saveObservation({
        title: `Large project ${i}`,
        content: `${'project summary body '.repeat(220)}${fullMarker}-${i}`,
        project,
      });
    }
    return fullMarker;
  }

  function seedCommunityGraph(project = 'project-a'): void {
    const db = store.getDb();
    db.prepare('INSERT INTO sessions (id, project) VALUES (?, ?) ON CONFLICT(id) DO NOTHING')
      .run(`${project}-community-session`, project);
    const source = db.prepare(
      `INSERT INTO observations (session_id, type, title, content, project, scope, normalized_hash, sync_id)
       VALUES (?, 'manual', ?, 'project community source body', ?, 'project', ?, ?)`
    ).run(
      `${project}-community-session`,
      `${project} community source`,
      project,
      `${project}-community-hash`,
      `${project}-community-sync`,
    ).lastInsertRowid as number;
    const subject = db.prepare(
      `INSERT INTO kg_entities (entity_key, entity_type, canonical_name)
       VALUES (?, 'concept', ?) RETURNING id`
    ).get(`${project}:subject`, `${project} Subject`) as { id: number };
    const object = db.prepare(
      `INSERT INTO kg_entities (entity_key, entity_type, canonical_name)
       VALUES (?, 'concept', ?) RETURNING id`
    ).get(`${project}:object`, `${project} Object`) as { id: number };
    db.prepare(
      `INSERT INTO kg_triples (
        subject_entity_id, relation, object_entity_id, source_type, source_id,
        project, provenance, confidence, triple_hash
      ) VALUES (?, 'HAS_WHAT', ?, 'observation', ?, ?, '{}', 0.9, ?)`
    ).run(subject.id, object.id, source, project, `${project}:community-triple`);
  }

  beforeEach(() => {
    store = new Store(':memory:');
    toolHandler = undefined;
    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_project') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;
    registerMemProject(server, store);
  });

  afterEach(() => {
    store.close();
  });

  it('lists projects', async () => {
    store.saveObservation({ title: 'Project item', content: 'body', project: 'project-a' });

    const result = await toolHandler?.({ action: 'list' });

    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].text).toContain('project-a');
  });

  it('returns summary, graph, and topic-key views', async () => {
    store.saveObservation({
      title: 'Topic item',
      content: '**What**: Durable topic\n**Why**: Testing project tool',
      project: 'project-a',
      topic_key: 'architecture/topic-a',
    });

    const summary = await toolHandler?.({ action: 'summary', project: 'project-a' });
    const graph = await toolHandler?.({ action: 'graph', project: 'project-a' });
    const topics = await toolHandler?.({ action: 'topics', project: 'project-a' });
    const topic = await toolHandler?.({ action: 'topic', project: 'project-a', topic_key: 'architecture/topic-a' });

    expect(summary?.content[0].text).toContain('## Project Summary: project-a');
    expect(graph?.content[0].text).toContain('## Knowledge Graph Ledger: project-a');
    expect(topics?.content[0].text).toContain('architecture/topic-a');
    expect(topic?.content[0].text).toContain('## Topic Key: architecture/topic-a');
  });

  it('returns compact operational health without requiring a project', async () => {
    store.saveObservation({
      title: 'Health target',
      content: '**What**: Health telemetry target',
      project: 'project-a',
    });

    const result = await toolHandler?.({ action: 'health', max_chars: 2000 });
    const text = result?.content[0].text ?? '';

    expect(result?.isError).not.toBe(true);
    expect(text).toContain('## Operational Health');
    expect(text).toContain('- overall:');
    expect(text).toContain('- legacy_drift: ok');
    expect(text).toContain('## Semantic');
    expect(text).toContain('## Visualization / KG');
    expect(text).toContain('## Jobs');
    expect(text).toContain('## Coverage');
    expect(text.length).toBeLessThanOrEqual(2000);
  });

  it('reports explicit legacy drift in health when observation_facts is missing', async () => {
    store.close();
    store = new Store(':memory:', { graphFactsSource: 'legacy' });
    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_project') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;
    registerMemProject(server, store);

    const result = await toolHandler?.({ action: 'health', project: 'legacy-project', max_chars: 2000 });
    const text = result?.content[0].text ?? '';

    expect(result?.isError).not.toBe(true);
    expect(text).toContain('- legacy_drift: degraded');
    expect(text).toContain('missing table observation_facts');
    expect(text).toContain('graph_source: legacy');
  });

  it('annotates project graph with maintenance provenance without replacing KG facts', async () => {
    store.close();
    store = new Store(':memory:', {
      maintenance: {
        decay: { enabled: true, staleAfterDays: 1, scoreMultiplier: 0.5 },
      },
      knowledgeGraph: { kgMultiHopEnabled: false },
    });
    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_project') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;
    registerMemProject(server, store);
    const first = store.saveObservation({
      title: 'Graph maintenance source A',
      content: '**What**: graph maintenance evidence',
      project: 'project-a',
      type: 'manual',
    }).observation;
    const second = store.saveObservation({
      title: 'Graph maintenance source B',
      content: '**What**: graph maintenance evidence',
      project: 'project-a',
      type: 'manual',
    }).observation;
    store.getDb().prepare("UPDATE observations SET created_at = '2020-01-01 00:00:00', updated_at = '2020-01-01 00:00:00' WHERE id IN (?, ?)")
      .run(first.id, second.id);
    store.runMaintenance({ scope: { project: 'project-a' } });

    const result = await toolHandler?.({ action: 'graph', project: 'project-a', max_chars: 4000 });
    const text = result?.content[0].text ?? '';

    expect(text).toContain('Graph maintenance source');
    expect(text).toContain('Maintenance evidence:');
    expect(text).toContain('consolidation');
    expect(text).toContain('decay state=attenuated');
    expect(text).not.toContain('maintenance_runs');
  });

  it('bounds summary output by default and with per-call max_chars', async () => {
    seedLargeProject();

    const defaultResult = await toolHandler?.({ action: 'summary', project: 'project-a' });
    const tightResult = await toolHandler?.({ action: 'summary', project: 'project-a', max_chars: 900 });
    const defaultText = defaultResult?.content[0].text ?? '';
    const tightText = tightResult?.content[0].text ?? '';

    expect(defaultText.length).toBeLessThanOrEqual(8000);
    expect(defaultText).toContain('Showing');
    expect(defaultText).toContain('mem_get(id=');
    expect(tightText.length).toBeLessThanOrEqual(900);
    expect(defaultText.length).toBeGreaterThan(tightText.length);
    expect(store.config.maxContextChars).toBe(8000);
  });

  it('allows max_chars 0 for summary as an unbounded full-content override', async () => {
    const fullMarker = seedLargeProject();

    const result = await toolHandler?.({ action: 'summary', project: 'project-a', max_chars: 0 });
    const text = result?.content[0].text ?? '';

    expect(text.length).toBeGreaterThan(8000);
    expect(text).toContain(fullMarker);
    expect(text).not.toContain('mem_get(id=');
  });

  it('keeps graph and topic max_chars validation at 200 or greater', () => {
    expect(() => MEM_PROJECT_INPUT_SCHEMA.parse({ action: 'summary', project: 'project-a', max_chars: 0 })).not.toThrow();
    expect(() => MEM_PROJECT_INPUT_SCHEMA.parse({ action: 'health', max_chars: 0 })).not.toThrow();
    expect(() => MEM_PROJECT_INPUT_SCHEMA.parse({ action: 'graph', project: 'project-a', max_chars: 0 })).toThrow(/max_chars must be >= 200/);
    expect(() => MEM_PROJECT_INPUT_SCHEMA.parse({ action: 'graph', project: 'project-a', max_chars: 150 })).toThrow(/max_chars must be >= 200/);
    expect(() => MEM_PROJECT_INPUT_SCHEMA.parse({ action: 'graph', project: 'project-a', max_chars: 300 })).not.toThrow();
    expect(() => MEM_PROJECT_INPUT_SCHEMA.parse({ action: 'topic', project: 'project-a', topic_key: 'architecture/topic-a', max_chars: 0 })).toThrow(/max_chars must be >= 200/);
  });

  it('community annotation is additive', async () => {
    store.close();
    store = new Store(':memory:', {
      communitySummaries: {
        readPath: { enabled: true },
      },
    });
    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_project') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;
    registerMemProject(server, store);

    const absent = await toolHandler?.({ action: 'summary', project: 'project-a', max_chars: 2000 });
    const absentText = absent?.content[0].text ?? '';
    expect(absentText).toContain('## Project Summary: project-a');
    expect(absentText).not.toContain('## Community Summaries');

    seedCommunityGraph('project-a');
    store.rebuildCommunitySummaries({ project: 'project-a' });

    const summary = await toolHandler?.({ action: 'summary', project: 'project-a', max_chars: 4000 });
    const graph = await toolHandler?.({ action: 'graph', project: 'project-a', max_chars: 4000 });
    const summaryText = summary?.content[0].text ?? '';
    const graphText = graph?.content[0].text ?? '';

    expect(summary?.isError).not.toBe(true);
    expect(summaryText).toContain('## Project Summary: project-a');
    expect(summaryText).toContain('## Community Summaries');
    expect(summaryText).toContain('community=');
    expect(summaryText).toContain('coverage=obs:1 triples:1');
    expect(graphText).toContain('## Knowledge Graph Ledger: project-a');
    expect(graphText).not.toContain('## Community Summaries');
  });
});
