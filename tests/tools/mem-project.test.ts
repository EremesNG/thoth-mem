import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../../src/store/index.js';
import { ALL_TOOLS } from '../../src/tools/index.js';
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
    expect(graphText).not.toContain('P5');
    expect(graphText).not.toContain('P5 graph navigation v2');
    expect(graphText).not.toContain('GraphRAG');
    expect(graphText).not.toContain('multi-harness');
    expect(graphText).not.toContain('MemoryIntegrationCore');
  });

  it('keeps graph output as KG ledger semantics and avoids deferred-scope phrasing', async () => {
    store.saveObservation({
      title: 'Deferred-scope probe',
      content: 'Graph ledger stays factual and does not claim migration or parity scope.',
      project: 'project-a',
    });

    const graph = await toolHandler?.({ action: 'graph', project: 'project-a', max_chars: 1800 });
    const graphText = graph?.content[0].text ?? '';

    expect(graph?.isError).not.toBe(true);
    expect(graphText).toContain('## Knowledge Graph Ledger: project-a');
    expect(graphText).not.toContain('deferred scope');
    expect(graphText).not.toContain('multi-harness parity');
    expect(graphText).not.toContain('G3');
    expect(graphText).not.toContain('global default-on');
  });

  it('default graph compatibility keeps omitted navigation on the bounded KG ledger path', async () => {
    store.saveObservation({
      title: 'Default graph compatibility source',
      content: '**What**: Default graph compatibility ledger fact\n**Why**: Lock existing graph behavior',
      project: 'project-a',
      topic_key: 'graph/default-compatibility',
    });

    const graph = await toolHandler?.({
      action: 'graph',
      project: 'project-a',
      topic_key: 'graph/default-compatibility',
      relation: 'HAS_WHAT',
      limit: 1,
      max_chars: 1200,
    });
    const graphText = graph?.content[0].text ?? '';

    expect(graph?.isError).not.toBe(true);
    expect(graphText).toContain('## Knowledge Graph Ledger: project-a');
    expect(graphText).toContain('Filters: topic_key=graph/default-compatibility, relation=HAS_WHAT');
    expect(graphText).toContain('Showing 1 of');
    expect(graphText).toContain('HAS_WHAT');
    expect(graphText.length).toBeLessThanOrEqual(1200);
    expect(graphText).not.toContain('## Community Summaries');
    expect(graphText).not.toContain('GraphRAG');
    expect(graphText).not.toContain('deferred scope');
    expect(graphText).not.toContain('multi-harness');
    expect(() => MEM_PROJECT_INPUT_SCHEMA.parse({
      action: 'graph',
      project: 'project-a',
      max_chars: 0,
    })).toThrow(/max_chars must be >= 200/);
  });

  it('ledger navigation equivalence matches omitted navigation graph output', async () => {
    store.saveObservation({
      title: 'Ledger navigation equivalence source',
      content: '**What**: Ledger navigation equivalence fact\n**Learned**: Explicit ledger should preserve default semantics',
      project: 'project-a',
      topic_key: 'graph/ledger-equivalence',
    });

    const baseInput = {
      action: 'graph',
      project: 'project-a',
      topic_key: 'graph/ledger-equivalence',
      relation: 'HAS_WHAT',
      limit: 2,
      max_chars: 1600,
    };
    const omitted = await toolHandler?.(baseInput);
    const explicitLedger = await toolHandler?.({ ...baseInput, navigation: 'ledger' });

    expect(omitted?.isError).not.toBe(true);
    expect(explicitLedger?.isError).not.toBe(true);
    expect(explicitLedger?.content[0].text).toEqual(omitted?.content[0].text);
  });

  it('graph navigation schema accepts additive optional inputs and rejects unsupported modes', () => {
    const parsed = MEM_PROJECT_INPUT_SCHEMA.parse({
      action: 'graph',
      project: 'project-a',
      topic_key: 'graph/schema',
      relation: 'HAS_WHAT',
      limit: 5,
      max_chars: 1200,
      navigation: 'neighborhood',
      focus_node_id: 'entity:project-a:hub',
      observation_id: 42,
      continuation: 'opaque-frontier-token',
      include_superseded: true,
    });

    expect(parsed).toMatchObject({
      action: 'graph',
      project: 'project-a',
      topic_key: 'graph/schema',
      relation: 'HAS_WHAT',
      limit: 5,
      max_chars: 1200,
      navigation: 'neighborhood',
      focus_node_id: 'entity:project-a:hub',
      observation_id: 42,
      continuation: 'opaque-frontier-token',
      include_superseded: true,
    });
    expect(() => MEM_PROJECT_INPUT_SCHEMA.parse({
      action: 'graph',
      project: 'project-a',
      navigation: 'unbounded-dump',
      max_chars: 1200,
    })).toThrow();
    expect(() => MEM_PROJECT_INPUT_SCHEMA.parse({
      action: 'graph',
      project: 'project-a',
      navigation: 'ledger',
      max_chars: 150,
    })).toThrow(/max_chars must be >= 200/);
  });

  it('registered tool set stays compact for graph navigation v2', () => {
    const registeredNames = ALL_TOOLS.map((tool) => tool.name);

    expect(registeredNames).toEqual([
      'mem_save',
      'mem_recall',
      'mem_context',
      'mem_get',
      'mem_project',
      'mem_session',
    ]);
    expect(registeredNames).toHaveLength(6);
    expect(registeredNames.filter((name) => name.includes('graph') || name.includes('navigation'))).toEqual([]);
  });

  it('graph navigation modes return bounded mode-specific text views', async () => {
    store.saveObservation({
      title: 'Navigation mode source',
      content: [
        '**What**: Neighborhood frontier evidence',
        '**Why**: Lineage needs pivotable metadata',
        '**Learned**: Mode dispatch stays bounded',
      ].join('\n'),
      project: 'project-a',
      topic_key: 'graph/navigation-modes',
      type: 'decision',
    });
    seedCommunityGraph('project-a');
    store.rebuildCommunitySummaries({ project: 'project-a' });

    const neighborhood = await toolHandler?.({
      action: 'graph',
      project: 'project-a',
      navigation: 'neighborhood',
      focus_node_id: 'obs:1',
      limit: 2,
      max_chars: 1800,
    });
    const lineage = await toolHandler?.({
      action: 'graph',
      project: 'project-a',
      navigation: 'lineage',
      topic_key: 'graph/navigation-modes',
      limit: 2,
      max_chars: 1800,
    });
    const community = await toolHandler?.({
      action: 'graph',
      project: 'project-a',
      navigation: 'community',
      limit: 2,
      max_chars: 1800,
    });

    const neighborhoodText = neighborhood?.content[0].text ?? '';
    const lineageText = lineage?.content[0].text ?? '';
    const communityText = community?.content[0].text ?? '';

    expect(neighborhood?.isError).not.toBe(true);
    expect(neighborhoodText).toContain('## Graph Neighborhood: project-a');
    expect(neighborhoodText).toContain('focus_node_id=obs:1');
    expect(neighborhoodText).toContain('Frontier:');
    expect(neighborhoodText.length).toBeLessThanOrEqual(1800);

    expect(lineage?.isError).not.toBe(true);
    expect(lineageText).toContain('## Graph Lineage: project-a');
    expect(lineageText).toContain('obs:1');
    expect(lineageText).toContain('topic=graph/navigation-modes');
    expect(lineageText.length).toBeLessThanOrEqual(1800);

    expect(community?.isError).not.toBe(true);
    expect(communityText).toContain('## Graph Community Inspection: project-a');
    expect(communityText).toContain('state=');
    expect(communityText).toContain('community=');
    expect(communityText).toContain('sources=obs:');
    expect(communityText).not.toContain('GraphRAG');
    expect(communityText).not.toContain('global answer');
    expect(communityText.length).toBeLessThanOrEqual(1800);
  });

  it('focused lineage returns scoped observation outside the first timeline page', async () => {
    const focused = store.saveObservation({
      title: 'Focused lineage target',
      content: '**What**: Focused lineage target remains reachable',
      project: 'project-a',
      topic_key: 'graph/focused-lineage',
      type: 'decision',
    }).observation;
    store.saveObservation({
      title: 'Newer lineage distractor',
      content: '**What**: This newer item should occupy the first page',
      project: 'project-a',
      topic_key: 'graph/focused-lineage-distractor',
      type: 'decision',
    });
    store.saveObservation({
      title: 'Other project scoped target',
      content: '**What**: This item must not leak across projects',
      project: 'project-b',
      topic_key: 'graph/focused-lineage',
      type: 'decision',
    });

    const focusedResult = await toolHandler?.({
      action: 'graph',
      project: 'project-a',
      navigation: 'lineage',
      observation_id: focused.id,
      limit: 1,
      max_chars: 1800,
    });
    const wrongTopic = await toolHandler?.({
      action: 'graph',
      project: 'project-a',
      navigation: 'lineage',
      observation_id: focused.id,
      topic_key: 'graph/other-topic',
      limit: 1,
      max_chars: 1800,
    });
    const wrongProject = await toolHandler?.({
      action: 'graph',
      project: 'project-b',
      navigation: 'lineage',
      observation_id: focused.id,
      limit: 1,
      max_chars: 1800,
    });

    const focusedText = focusedResult?.content[0].text ?? '';
    expect(focusedResult?.isError).not.toBe(true);
    expect(focusedText).toContain('## Graph Lineage: project-a');
    expect(focusedText).toContain(`obs:${focused.id}`);
    expect(focusedText).toContain('Focused lineage target');
    expect(focusedText).not.toContain('Newer lineage distractor');
    expect(focusedText.length).toBeLessThanOrEqual(1800);
    expect(wrongTopic?.content[0].text).toContain('No lineage events found.');
    expect(wrongProject?.content[0].text).toContain('No lineage events found.');
  });

  it('superseded navigation is explicit and tagged while other graph views stay current-state', async () => {
    store.saveObservation({
      title: 'Superseded navigation source',
      content: '**What**: Redis cache',
      project: 'project-a',
      topic_key: 'graph/superseded-navigation',
      type: 'decision',
    });
    store.saveObservation({
      title: 'Superseded navigation source',
      content: '**What**: Valkey cache',
      project: 'project-a',
      topic_key: 'graph/superseded-navigation',
      type: 'decision',
    });

    const ledger = await toolHandler?.({
      action: 'graph',
      project: 'project-a',
      navigation: 'ledger',
      include_superseded: true,
      max_chars: 1800,
    });
    const neighborhood = await toolHandler?.({
      action: 'graph',
      project: 'project-a',
      navigation: 'neighborhood',
      focus_node_id: 'obs:1',
      include_superseded: true,
      max_chars: 1800,
    });
    const superseded = await toolHandler?.({
      action: 'graph',
      project: 'project-a',
      navigation: 'superseded',
      include_superseded: true,
      max_chars: 1800,
    });

    const ledgerText = ledger?.content[0].text ?? '';
    const neighborhoodText = neighborhood?.content[0].text ?? '';
    const supersededText = superseded?.content[0].text ?? '';

    expect(ledgerText).toContain('Valkey cache');
    expect(ledgerText).not.toContain('Redis cache');
    expect(neighborhoodText).not.toContain('Redis cache');
    expect(superseded?.isError).not.toBe(true);
    expect(supersededText).toContain('## Superseded Graph History: project-a');
    expect(supersededText).toContain('[SUPERSEDED]');
    expect(supersededText).toContain('Redis cache');
    expect(supersededText).toContain('Valkey cache');
  });

  it('graph navigation invalid inputs return safe MCP error responses', async () => {
    const badFocus = await toolHandler?.({
      action: 'graph',
      project: 'project-a',
      navigation: 'neighborhood',
      focus_node_id: 'entity:project-a:hub',
      max_chars: 1200,
    });
    const badContinuation = await toolHandler?.({
      action: 'graph',
      project: 'project-a',
      navigation: 'lineage',
      continuation: 'opaque-frontier-token',
      max_chars: 1200,
    });

    expect(badFocus?.isError).toBe(true);
    expect(badFocus?.content[0].text).toContain('focus_node_id must use obs:<id>');
    expect(badContinuation?.isError).toBe(true);
    expect(badContinuation?.content[0].text).toContain('Invalid continuation token');
    expect(() => MEM_PROJECT_INPUT_SCHEMA.parse({
      action: 'graph',
      project: 'project-a',
      navigation: 'lineage',
      limit: 501,
      max_chars: 1200,
    })).toThrow();
  });

  it('graph navigation attribution includes source ids topics timestamps and previews', async () => {
    store.saveObservation({
      title: 'Attribution source',
      content: '**What**: Attributed fact\n**Why**: Preview metadata should be visible',
      project: 'project-a',
      topic_key: 'graph/attribution',
      type: 'decision',
    });

    const ledger = await toolHandler?.({
      action: 'graph',
      project: 'project-a',
      navigation: 'ledger',
      topic_key: 'graph/attribution',
      max_chars: 1800,
    });
    const lineage = await toolHandler?.({
      action: 'graph',
      project: 'project-a',
      navigation: 'lineage',
      topic_key: 'graph/attribution',
      max_chars: 1800,
    });
    const superseded = await toolHandler?.({
      action: 'graph',
      project: 'project-a',
      navigation: 'superseded',
      topic_key: 'graph/attribution',
      max_chars: 1800,
    });

    for (const text of [
      ledger?.content[0].text ?? '',
      lineage?.content[0].text ?? '',
      superseded?.content[0].text ?? '',
    ]) {
      expect(text).toContain('obs:1');
      expect(text).toContain('topic=graph/attribution');
      expect(text).toContain('created=');
    }
    expect(lineage?.content[0].text).toContain('preview=');
    expect(superseded?.content[0].text).toContain('No superseded facts found.');
  });
});
