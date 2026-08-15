import { createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { getConfig } from '../src/config.js';
import { createHttpBridge } from '../src/http-server.js';
import { Store } from '../src/store/index.js';

function seedVizSupersededFact(store: Store, input: {
  observationId: number;
  project: string;
  subjectKey: string;
  objectKey: string;
  objectName: string;
  superseded?: boolean;
}): void {
  const db = store.getDb();
  const subject = db.prepare(
    `INSERT INTO kg_entities (entity_key, entity_type, canonical_name)
     VALUES (?, 'concept', ?)
     ON CONFLICT(entity_key) DO UPDATE SET updated_at = datetime('now')
     RETURNING id`
  ).get(input.subjectKey, input.subjectKey) as { id: number };
  const object = db.prepare(
    `INSERT INTO kg_entities (entity_key, entity_type, canonical_name)
     VALUES (?, 'concept', ?)
     ON CONFLICT(entity_key) DO UPDATE SET updated_at = datetime('now')
     RETURNING id`
  ).get(input.objectKey, input.objectName) as { id: number };

  db.prepare(
    `INSERT INTO kg_triples (
       subject_entity_id, relation, object_entity_id, source_type, source_id,
       project, provenance, confidence, triple_hash, extractor_version, superseded_at
     ) VALUES (?, 'HAS_WHAT', ?, 'observation', ?, ?, 'test', 0.9, ?, 'test', ?)`
  ).run(
    subject.id,
    object.id,
    input.observationId,
    input.project,
    `${input.project}:${input.objectKey}`,
    input.superseded ? '2026-01-01 00:00:00' : null,
  );
}

function seedDenseAtlasCommunity(store: Store, input: {
  project: string;
  connectedCount: number;
  totalCount: number;
}): void {
  const observationIds = Array.from({ length: input.totalCount }, (_, index) => store.saveObservation({
    title: `Detail default ${index + 1}`,
    content: `Public detail default evidence ${index + 1}`,
    project: input.project,
  }).observation.id);
  const db = store.getDb();
  const insertEntity = db.prepare(
    `INSERT INTO kg_entities (entity_key, entity_type, canonical_name)
     VALUES (?, 'concept', ?) RETURNING id`
  );
  const sharedObject = insertEntity.get('detail-default:shared-object', 'Shared detail object') as { id: number };
  const insertTriple = db.prepare(
    `INSERT INTO kg_triples (
       subject_entity_id, relation, object_entity_id, source_type, source_id,
       project, provenance, confidence, triple_hash, extractor_version
     ) VALUES (?, 'USES', ?, 'observation', ?, ?, 'test', 0.9, ?, 'detail-default-test')`
  );
  db.transaction(() => {
    for (let left = 0; left < input.connectedCount; left += 1) {
      for (let right = left + 1; right < input.connectedCount; right += 1) {
        const pairKey = `detail-default:${left}:${right}`;
        const subject = insertEntity.get(pairKey, pairKey) as { id: number };
        insertTriple.run(subject.id, sharedObject.id, observationIds[left], input.project, `${pairKey}:left`);
        insertTriple.run(subject.id, sharedObject.id, observationIds[right], input.project, `${pairKey}:right`);
      }
    }
  })();
}

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not resolve ephemeral port.')));
        return;
      }
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function resolveAtlasScopeTokens(
  port: number,
  projectLabel: string,
  sessionLabel: string,
): Promise<{ projectToken: string; sessionToken: string }> {
  const response = await fetch(`http://127.0.0.1:${port}/viz/atlas?level=universe&page_size=150`);
  if (!response.ok) throw new Error(`Unable to resolve semantic atlas facets: ${response.status}`);
  const body = await response.json() as {
    facets: {
      projects: Array<{ token: string; label: string }>;
      sessions: Array<{ token: string; label: string }>;
    };
  };
  const projectToken = body.facets.projects.find((facet) => facet.label === projectLabel)?.token;
  const sessionToken = body.facets.sessions.find((facet) => facet.label === sessionLabel)?.token;
  if (!projectToken || !sessionToken) throw new Error(`Missing semantic atlas facets for ${projectLabel}/${sessionLabel}`);
  return { projectToken, sessionToken };
}

describe('viz routes', () => {
  const active: Array<{ store: Store; stop: () => Promise<void>; port: number }> = [];

  afterEach(async () => {
    while (active.length > 0) {
      const item = active.pop();
      if (!item) continue;
      await item.stop();
      item.store.close();
    }
  });

  it('serves viz slice and expand with privacy sanitization and read-only expand', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:');
    store.saveObservation({
      title: 'Auth private',
      content: '<private>do not show</private> visible content',
      project: 'viz-http',
      session_id: 'viz-session-a',
      topic_key: 'architecture/auth',
      type: 'architecture',
    });
    store.saveObservation({
      title: 'Billing relation',
      content: 'What: Payments',
      project: 'viz-http',
      session_id: 'viz-session-b',
      topic_key: 'architecture/billing',
      type: 'discovery',
    });
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    const sliceResponse = await fetch(`http://127.0.0.1:${port}/viz/slice?project=viz-http&session_id=viz-session-b&relation=HAS_WHAT&query=payments&observation_type=discovery&type=discovery&max_nodes=20&max_edges=20&depth=1`);
    expect(sliceResponse.status).toBe(200);
    const sliceBody = await sliceResponse.json();
    expect(sliceBody.nodes.length).toBeGreaterThan(0);
    expect(sliceBody.nodes[0].snippet).not.toContain('do not show');

    const beforeMutations = (store.getDb().prepare('SELECT COUNT(*) as count FROM sync_mutations').get() as { count: number }).count;
    const expandResponse = await fetch(`http://127.0.0.1:${port}/viz/expand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'viz-http', session_id: 'viz-session-b', relation: 'HAS_WHAT', query: 'payments', observation_type: 'discovery', node_id: sliceBody.nodes[0].id, depth: 1, max_nodes: 20, max_edges: 20 }),
    });
    expect(expandResponse.status).toBe(200);
    const afterMutations = (store.getDb().prepare('SELECT COUNT(*) as count FROM sync_mutations').get() as { count: number }).count;
    expect(afterMutations).toBe(beforeMutations);

    const healthResponse = await fetch(`http://127.0.0.1:${port}/viz/health?project=viz-http`);
    expect(healthResponse.status).toBe(200);
    const healthBody = await healthResponse.json();
    expect(['ready', 'pending', 'degraded', 'rebuilding']).toContain(healthBody.semantic_state);
    expect(healthBody.semantic.jobs.pending).toBeGreaterThan(0);
    expect(healthBody.semantic.jobs.queue_lag_ms).toEqual(expect.any(Number));
    expect(healthBody.semantic.jobs.by_kind.some((job: { kind: string; pending: number }) => (
      job.kind === 'chunk' && job.pending > 0
    ))).toBe(true);
    expect(healthBody.semantic.coverage.observations).toBe(2);
    expect(Array.isArray(healthBody.semantic.recent_errors)).toBe(true);

    const filtersResponse = await fetch(`http://127.0.0.1:${port}/viz/filters?project=viz-http&session_id=viz-session-b`);
    expect(filtersResponse.status).toBe(200);
    const filtersBody = await filtersResponse.json();
    expect(filtersBody.sessions).toContain('viz-session-b');
    expect(filtersBody.relations).toContain('HAS_WHAT');
  });

  it('serves the token-safe semantic atlas and Observatory search flow through the real dispatcher', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:', { dedupeWindowMinutes: 0 });
    const privateProjects = [
      'http-atlas-<private>ALPHA_HTTP_SECRET</private>',
      'http-atlas-<private>BETA_HTTP_SECRET</private>',
    ];
    for (let index = 0; index < 12; index += 1) {
      store.saveObservation({
        title: `HTTP semantic memory ${index}`,
        content: `**What**: shared-http-evidence-${Math.floor(index / 4)}`,
        project: privateProjects[index % 2],
        session_id: `http-atlas-session-${index}`,
        topic_key: `http/atlas/${index}`,
        type: index % 2 === 0 ? 'decision' : 'discovery',
      });
    }
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    const universeResponse = await fetch(`http://127.0.0.1:${port}/viz/atlas?level=universe`);
    expect(universeResponse.status).toBe(200);
    const universe = await universeResponse.json();
    expect(universe).toMatchObject({
      level: 'universe',
      counts: { memory_count: 12, project_count: 2 },
    });
    expect(universe.nodes.every((node: { kind: string }) => node.kind === 'community')).toBe(true);
    expect(new Set(universe.facets.projects.map((option: { token: string }) => option.token)).size).toBe(2);
    const serializedUniverse = JSON.stringify(universe);
    expect(serializedUniverse).not.toContain('ALPHA_HTTP_SECRET');
    expect(serializedUniverse).not.toContain('BETA_HTTP_SECRET');
    expect(serializedUniverse).not.toContain('<private>');

    const projectToken = universe.facets.projects[0].token as string;
    const communityId = universe.nodes[0].id as string;
    const communityResponse = await fetch(
      `http://127.0.0.1:${port}/viz/atlas?level=community&community_id=${encodeURIComponent(communityId)}&page_size=2`,
    );
    expect(communityResponse.status).toBe(200);
    const community = await communityResponse.json();
    expect(community.presentation).toBe('complete');
    expect(community.nodes.every((node: { kind: string }) => node.kind === 'observation')).toBe(true);
    const semanticResponse = await fetch(
      `http://127.0.0.1:${port}/viz/atlas?level=community&community_id=${encodeURIComponent(communityId)}&presentation=semantic-zoom`,
    );
    expect(semanticResponse.status).toBe(200);
    const semantic = await semanticResponse.json();
    expect(semantic).toMatchObject({ presentation: 'semantic-zoom', continuation: null });
    expect(semantic.navigation.visible_relationship_count).toBe(semantic.edges.length + semantic.region_bridges.length);
    expect(semantic.regions.reduce((sum: number, region: { member_count: number }) => sum + region.member_count, 0))
      .toBe(semantic.navigation.source_memory_count);
    expect(JSON.stringify(semantic)).not.toMatch(/ALPHA_HTTP_SECRET|BETA_HTTP_SECRET|<private>|\[private\]/i);
    const focusNodeId = community.nodes[0].id as string;
    const neighborhoodResponse = await fetch(
      `http://127.0.0.1:${port}/viz/atlas?level=neighborhood&community_id=${encodeURIComponent(communityId)}&focus_node_id=${encodeURIComponent(focusNodeId)}&depth=2`,
    );
    expect(neighborhoodResponse.status).toBe(200);
    const neighborhood = await neighborhoodResponse.json();
    expect(neighborhood.navigation).toMatchObject({ focus_node_id: focusNodeId, depth: 2 });
    expect(neighborhood.nodes.length).toBeLessThanOrEqual(300);

    const invalidFacet = await fetch(
      `http://127.0.0.1:${port}/viz/atlas?level=universe&project_token=facet%3Aproject%3Anot-current`,
    );
    expect(invalidFacet.status).toBe(400);
    expect(await invalidFacet.json()).toMatchObject({ code: 'VIZ_ATLAS_FACET_INVALID', retryable: false });
    const rawFacet = await fetch(
      `http://127.0.0.1:${port}/viz/atlas?level=universe&project=${encodeURIComponent(privateProjects[0]!)}`,
    );
    expect(rawFacet.status).toBe(400);

    const contextResponse = await fetch(
      `http://127.0.0.1:${port}/observatory/context?project_token=${encodeURIComponent(projectToken)}&query=HTTP%20semantic`,
    );
    expect(contextResponse.status).toBe(200);
    const context = await contextResponse.json();
    expect(context.scope.project.token).toBe(projectToken);
    const recallResponse = await fetch(
      `http://127.0.0.1:${port}/observatory/recall?context_token=${encodeURIComponent(context.context_token)}&lanes=lexical&limit=2`,
    );
    expect(recallResponse.status).toBe(200);
    const recall = await recallResponse.json();
    const hit = recall.lanes.lexical[0];
    expect(hit.project.token).toBe(projectToken);
    expect(hit.community_id).toMatch(/^community:/);
    const pivotResponse = await fetch(`http://127.0.0.1:${port}/observatory/pivot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pivot_token: hit.pivot_token, target: 'map' }),
    });
    expect(pivotResponse.status).toBe(200);
    const pivot = await pivotResponse.json();
    expect(pivot).toMatchObject({
      focus_node_id: `obs:${hit.observation_id}`,
      community_id: hit.community_id,
      target: 'map',
    });
    expect(pivot.scope.project.token).toBe(projectToken);
    expect(JSON.stringify({ context, recall, pivot })).not.toMatch(/ALPHA_HTTP_SECRET|BETA_HTTP_SECRET|<private>/);

    const openApi = await (await fetch(`http://127.0.0.1:${port}/openapi.json`)).json();
    expect(openApi.paths['/viz/atlas'].get.responses).toHaveProperty('409');
    expect(openApi.components.schemas.SemanticAtlasPageResponse).toBeDefined();
    expect(openApi.components.schemas.SemanticAtlasEdge.required).toEqual(expect.arrayContaining([
      'tier', 'relationship_class', 'direction', 'confidence', 'evidence_count', 'provenance',
    ]));
    expect(openApi.components.schemas.SemanticAtlasPageResponse.properties).toMatchObject({
      presentation: { $ref: '#/components/schemas/SemanticAtlasPresentation' },
      regions: { items: { $ref: '#/components/schemas/SemanticAtlasRegion' } },
      region_bridges: { items: { $ref: '#/components/schemas/SemanticAtlasRegionBridge' } },
      navigation: { $ref: '#/components/schemas/SemanticAtlasNavigation' },
    });
    expect(openApi.components.schemas.SemanticAtlasRegion.required).toEqual([
      'id', 'community_id', 'label', 'summary', 'member_count', 'project_count', 'time_from', 'time_to',
      'concepts', 'facets', 'representatives', 'seed_x', 'seed_y', 'unclustered',
    ]);
    expect(openApi.components.schemas.SemanticAtlasRegionFacets.required).toEqual([
      'projects', 'sessions', 'topics', 'types',
    ]);
    expect(openApi.components.schemas.SemanticAtlasRegionBridge.required).toEqual([
      'id', 'source_region_id', 'target_region_id', 'tier', 'relationship_class', 'direction', 'weight',
      'evidence_count', 'relations', 'confidence', 'representative_edge_ids', 'provenance',
    ]);
    expect(openApi.components.schemas.SemanticAtlasNavigation.required).toEqual([
      'project_id', 'community_id', 'focus_node_id', 'depth', 'region_id',
      'source_project_count', 'visible_project_count', 'omitted_projects',
      'source_constellation_count', 'visible_constellation_count', 'omitted_constellations',
      'source_memory_count', 'visible_memory_count',
      'source_relationship_count', 'visible_relationship_count', 'represented_source_relationship_count',
      'omitted_nodes', 'omitted_edges', 'raw_rich_render_safe', 'raw_rich_render_limit', 'scope',
    ]);
  });

  it('negotiates project hierarchy and opaque pivot ownership through HTTP and OpenAPI', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:', { dedupeWindowMinutes: 0 });
    const saved = store.saveObservation({
      title: 'HTTP project pivot',
      content: 'Public HTTP project pivot evidence',
      project: 'HTTP project <private>HTTP_OWNER_SECRET</private>',
    }).observation;
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    const universeResponse = await fetch(
      `http://127.0.0.1:${port}/viz/atlas?hierarchy=project&level=universe&page_size=24`,
    );
    expect(universeResponse.status).toBe(200);
    const universe = await universeResponse.json();
    expect(universe).toMatchObject({ hierarchy: 'project', level: 'universe' });
    expect(universe.project_regions).toHaveLength(1);
    const projectId = universe.project_regions[0].id as string;
    const projectResponse = await fetch(
      `http://127.0.0.1:${port}/viz/atlas?hierarchy=project&level=project&project_id=${encodeURIComponent(projectId)}`,
    );
    expect(projectResponse.status).toBe(200);
    const project = await projectResponse.json();
    expect(project.navigation.project_id).toBe(projectId);

    for (const query of [
      `hierarchy=global&level=universe&community_id=${encodeURIComponent(project.nodes[0].community_id)}`,
      `hierarchy=project&level=universe&community_id=${encodeURIComponent(project.nodes[0].community_id)}`,
      `hierarchy=project&level=project&project_id=${encodeURIComponent(projectId)}&community_id=${encodeURIComponent(project.nodes[0].community_id)}`,
      `hierarchy=project&level=community&project_id=${encodeURIComponent(projectId)}&community_id=${encodeURIComponent(project.nodes[0].community_id)}&focus_node_id=obs%3A${saved.id}`,
    ]) {
      const invalidOwner = await fetch(`http://127.0.0.1:${port}/viz/atlas?${query}`);
      expect(invalidOwner.status).toBe(400);
      await expect(invalidOwner.json()).resolves.toMatchObject({ code: 'VIZ_ATLAS_HIERARCHY_INVALID' });
    }

    const context = await (await fetch(
      `http://127.0.0.1:${port}/observatory/context?query=HTTP%20project%20pivot`,
    )).json();
    const recallResponse = await fetch(
      `http://127.0.0.1:${port}/observatory/recall?hierarchy=project&context_token=${encodeURIComponent(context.context_token)}&lanes=lexical&limit=1`,
    );
    expect(recallResponse.status).toBe(200);
    const recall = await recallResponse.json();
    const hit = recall.lanes.lexical[0];
    expect(hit).toMatchObject({ project_id: projectId });
    const pivotResponse = await fetch(`http://127.0.0.1:${port}/observatory/pivot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hierarchy: 'project', pivot_token: hit.pivot_token, target: 'map' }),
    });
    expect(pivotResponse.status).toBe(200);
    await expect(pivotResponse.json()).resolves.toMatchObject({
      hierarchy: 'project',
      project_id: projectId,
      community_id: hit.community_id,
      focus_node_id: `obs:${saved.id}`,
    });

    const openApi = await (await fetch(`http://127.0.0.1:${port}/openapi.json`)).json();
    expect(openApi.paths['/viz/atlas'].get.parameters.map((parameter: { name: string }) => parameter.name))
      .toEqual(expect.arrayContaining(['hierarchy', 'level', 'project_id', 'page_size', 'cursor']));
    const atlasOperation = openApi.paths['/viz/atlas'].get;
    expect(atlasOperation.description).toMatch(/canonical owner-field matrix/i);
    expect(atlasOperation['x-valid-owner-matrix']).toEqual([
      { hierarchy: 'global', level: 'universe', valid: true, required_owner_fields: [], forbidden_owner_fields: ['project_id', 'community_id', 'focus_node_id'] },
      { hierarchy: 'global', level: 'project', valid: false, required_owner_fields: [], forbidden_owner_fields: ['project_id', 'community_id', 'focus_node_id'] },
      { hierarchy: 'global', level: 'community', valid: true, required_owner_fields: ['community_id'], forbidden_owner_fields: ['project_id', 'focus_node_id'] },
      { hierarchy: 'global', level: 'neighborhood', valid: true, required_owner_fields: ['community_id', 'focus_node_id'], forbidden_owner_fields: ['project_id'] },
      { hierarchy: 'project', level: 'universe', valid: true, required_owner_fields: [], forbidden_owner_fields: ['project_id', 'community_id', 'focus_node_id'] },
      { hierarchy: 'project', level: 'project', valid: true, required_owner_fields: ['project_id'], forbidden_owner_fields: ['community_id', 'focus_node_id'] },
      { hierarchy: 'project', level: 'community', valid: true, required_owner_fields: ['project_id', 'community_id'], forbidden_owner_fields: ['focus_node_id'] },
      { hierarchy: 'project', level: 'neighborhood', valid: true, required_owner_fields: ['project_id', 'community_id', 'focus_node_id'], forbidden_owner_fields: [] },
    ]);
    expect(atlasOperation['x-page-size-by-hierarchy']).toEqual({
      global: { minimum: 1, maximum: 250, default: 250 },
      project: { minimum: 1, maximum: 150, universe_default: 24, detail_default: 150 },
    });
    const atlasPageSize = atlasOperation.parameters
      .find((parameter: { name: string }) => parameter.name === 'page_size');
    expect(atlasPageSize.description).toMatch(/151\.\.250.*only.*global/i);
    expect(atlasPageSize.schema).toEqual({
      type: 'integer',
      minimum: 1,
      maximum: 250,
      default: 250,
      'x-project-hierarchy-maximum': 150,
    });
    expect(openApi.components.schemas.SemanticAtlasPageResponse.required)
      .toEqual(expect.arrayContaining(['hierarchy', 'project_regions', 'project_bridges']));
    expect(openApi.components.schemas.AtlasPivotLocation.required)
      .toEqual(expect.arrayContaining(['hierarchy', 'project_id', 'community_id', 'focus_node_id']));
    expect(JSON.stringify({ universe, project, recall })).not.toMatch(/HTTP_OWNER_SECRET|<private>/);
  });

  it('uses hierarchy-specific defaults for complete Community pages through HTTP', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:', { dedupeWindowMinutes: 0 });
    seedDenseAtlasCommunity(store, {
      project: 'Detail defaults project',
      connectedCount: 151,
      totalCount: 604,
    });
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    const projectUniverse = await (await fetch(
      `http://127.0.0.1:${port}/viz/atlas?hierarchy=project&level=universe`,
    )).json();
    const projectId = projectUniverse.project_regions[0].id as string;
    const projectPage = await (await fetch(
      `http://127.0.0.1:${port}/viz/atlas?hierarchy=project&level=project&project_id=${encodeURIComponent(projectId)}`,
    )).json();
    const projectCommunityId = projectPage.nodes
      .find((node: { member_count: number }) => node.member_count === 151).community_id as string;
    const projectCommunity = await (await fetch(
      `http://127.0.0.1:${port}/viz/atlas?hierarchy=project&level=community&project_id=${encodeURIComponent(projectId)}&community_id=${encodeURIComponent(projectCommunityId)}`,
    )).json();
    expect(projectCommunity.nodes).toHaveLength(150);
    expect(projectCommunity.continuation).toEqual(expect.any(String));

    const globalUniverse = await (await fetch(
      `http://127.0.0.1:${port}/viz/atlas?hierarchy=global&level=universe&page_size=250`,
    )).json();
    const globalCommunityId = globalUniverse.nodes
      .find((node: { member_count: number }) => node.member_count === 151).community_id as string;
    const globalCommunity = await (await fetch(
      `http://127.0.0.1:${port}/viz/atlas?hierarchy=global&level=community&community_id=${encodeURIComponent(globalCommunityId)}`,
    )).json();
    expect(globalCommunity.nodes).toHaveLength(151);
    expect(globalCommunity.continuation).toBeNull();
  });

  it('serves complete scoped graph pages and rejects invalidated generations through the real bridge', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:', { dedupeWindowMinutes: 0 });
    const tokens = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
    for (let index = 0; index < 6; index += 1) {
      store.saveObservation({
        title: `HTTP complete ${tokens[index]}`,
        content: `**What**: HTTP graph page ${tokens[index]}`,
        project: index === 5 ? 'other-project' : 'viz-http-complete',
        session_id: index % 2 === 0 ? 'included-session' : 'other-session',
        topic_key: index % 2 === 0 ? `included/topic-${index}` : `other/topic-${index}`,
        type: index % 2 === 0 ? 'decision' : 'discovery',
      });
    }
    expect(store.getDb().prepare(
      "SELECT id FROM observations WHERE project = 'viz-http-complete' AND session_id = 'included-session' AND type = 'decision' AND deleted_at IS NULL"
    ).all()).toHaveLength(3);
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    const openApiResponse = await fetch(`http://127.0.0.1:${port}/openapi.json`);
    expect(openApiResponse.status).toBe(200);
    const openApi = await openApiResponse.json();
    expect(openApi.paths['/viz/graph'].get.parameters.map((parameter: { name: string }) => parameter.name)).toEqual([
      'project',
      'session_id',
      'topic_key',
      'type',
      'observation_type',
      'relation',
      'query',
      'page_size',
      'cursor',
    ]);
    expect(openApi.paths['/viz/graph'].get.parameters.at(-2).schema).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 250,
    });
    expect(openApi.paths['/viz/graph'].get.responses).toMatchObject({
      200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/VizSliceResponse' } } } },
      400: { $ref: '#/components/responses/VizGraphPageError' },
      409: { $ref: '#/components/responses/VizGraphPageError' },
    });
    expect(openApi.components.schemas.VizGraphPageError).toMatchObject({
      required: ['error', 'code', 'retryable'],
      properties: {
        code: { enum: ['VIZ_GRAPH_CURSOR_INVALID', 'VIZ_GRAPH_GENERATION_STALE'] },
        retryable: { type: 'boolean' },
      },
    });

    const base = `http://127.0.0.1:${port}/viz/graph?project=viz-http-complete&session_id=included-session&type=decision&observation_type=decision&relation=HAS_TYPE&query=HTTP&page_size=1`;
    const topicFiltered = await fetch(`${base}&topic_key=included%2Ftopic-2`);
    expect(topicFiltered.status).toBe(200);
    await expect(topicFiltered.json()).resolves.toMatchObject({
      nodes: expect.arrayContaining([expect.objectContaining({
        kind: 'observation',
        topic_key: 'included/topic-2',
      })]),
    });
    const pages: Array<{ nodes: Array<{ id: string }>; edges: Array<{ id: string; source_id: string; target_id: string }>; continuation: string | null; truncated: boolean }> = [];
    let cursor: string | null = null;
    do {
      const response = await fetch(`${base}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      expect(response.status).toBe(200);
      const page = await response.json();
      const nodeIds = new Set(page.nodes.map((node: { id: string }) => node.id));
      expect(page.edges.every((edge: { source_id: string; target_id: string }) => (
        nodeIds.has(edge.source_id) && nodeIds.has(edge.target_id)
      ))).toBe(true);
      pages.push(page);
      cursor = page.continuation;
    } while (cursor);

    expect(
      pages.length,
      JSON.stringify(pages.map((page) => ({ nodes: page.nodes.map((node) => node.id), continuation: page.continuation }))),
    ).toBeGreaterThanOrEqual(3);
    expect(pages.at(-1)).toMatchObject({ continuation: null, truncated: false });
    expect(new Set(pages.flatMap((page) => page.nodes.filter((node) => node.id.startsWith('obs:')).map((node) => node.id))).size).toBe(3);
    const drainedEdgeIds = pages.flatMap((page) => page.edges.map((edge) => edge.id));
    expect(new Set(drainedEdgeIds).size).toBe(drainedEdgeIds.length);
    expect(pages.some((page) => page.edges.length > 3)).toBe(true);

    const malformed = await fetch(`${base}&cursor=not-a-cursor`);
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ code: 'VIZ_GRAPH_CURSOR_INVALID' });

    for (const pageSize of [0, 251]) {
      const outOfBounds = await fetch(`${base.replace('page_size=1', `page_size=${pageSize}`)}`);
      expect(outOfBounds.status).toBe(400);
      await expect(outOfBounds.json()).resolves.toMatchObject({ error: expect.any(String) });
    }

    const first = await fetch(base);
    const firstBody = await first.json();
    const replayedScope = await fetch(
      `http://127.0.0.1:${port}/viz/graph?project=other-project&page_size=1&cursor=${encodeURIComponent(firstBody.continuation)}`,
    );
    expect(replayedScope.status).toBe(400);
    await expect(replayedScope.json()).resolves.toMatchObject({ code: 'VIZ_GRAPH_CURSOR_INVALID' });

    store.getDb().prepare(
      "UPDATE observations SET title = 'Generation changed', updated_at = datetime('now') WHERE id = (SELECT id FROM observations WHERE project = 'viz-http-complete' AND session_id = 'included-session' ORDER BY id LIMIT 1)"
    ).run();
    const stale = await fetch(`${base}&cursor=${encodeURIComponent(firstBody.continuation)}`);
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      code: 'VIZ_GRAPH_GENERATION_STALE',
      retryable: true,
    });

    const compatibility = await fetch(`http://127.0.0.1:${port}/viz/slice?project=viz-http-complete&max_nodes=20&max_edges=20`);
    expect(compatibility.status).toBe(200);
    await expect(compatibility.json()).resolves.toMatchObject({
      nodes: expect.any(Array),
      edges: expect.any(Array),
      health: expect.any(Object),
    });
  });

  it('rebuilds graph-lite facts through HTTP POST /graph/rebuild without legacy table dependency', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:');
    const saved = store.saveObservation({
      title: 'HTTP rebuild graph',
      content: '**What**: HTTP rebuild KG content',
      project: 'http-rebuild',
      session_id: 'http-rebuild-session',
      topic_key: 'http/rebuild',
      type: 'decision',
    }).observation;
    store.getDb().prepare("DELETE FROM kg_triples WHERE source_type = 'observation'").run();
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    const response = await fetch(`http://127.0.0.1:${port}/graph/rebuild`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'http-rebuild' }),
    });
    const body = await response.json();
    const triples = store.getDb().prepare(
      "SELECT COUNT(*) AS count FROM kg_triples WHERE source_type = 'observation' AND source_id = ?"
    ).get(saved.id) as { count: number };
    const legacyTable = store.getDb().prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'observation_facts'"
    ).get() as { name: string } | undefined;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      project: 'http-rebuild',
      observations_scanned: 1,
      facts_deleted: 0,
    });
    expect(body.facts_created).toBeGreaterThan(0);
    expect(triples.count).toBeGreaterThan(0);
    expect(legacyTable).toBeUndefined();
    expect(store.getObservationFacts({ observation_id: saved.id }).map((fact) => fact.relation)).toEqual([
      'HAS_TYPE',
      'IN_PROJECT',
      'HAS_TOPIC_KEY',
      'HAS_WHAT',
    ]);
  });

  it('signals empty/sparse/dense states across slice sizes', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:');
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    const emptyResponse = await fetch(`http://127.0.0.1:${port}/viz/slice?project=no-data&max_nodes=10&max_edges=10`);
    const emptyBody = await emptyResponse.json();
    expect(emptyBody.state).toBe('empty');

    store.saveObservation({ title: 'one', content: 'one', project: 'viz-state', topic_key: 'a/b' });
    const sparseResponse = await fetch(`http://127.0.0.1:${port}/viz/slice?project=viz-state&max_nodes=20&max_edges=20`);
    const sparseBody = await sparseResponse.json();
    expect(['sparse', 'dense']).toContain(sparseBody.state);

    for (let index = 0; index < 20; index += 1) {
      store.saveObservation({ title: `dense-${index}`, content: `dense-${index}`, project: 'viz-state', topic_key: `k/${index}` });
    }
    const denseResponse = await fetch(`http://127.0.0.1:${port}/viz/slice?project=viz-state&max_nodes=10&max_edges=100`);
    const denseBody = await denseResponse.json();
    expect(denseBody.state).toBe('dense');
  });

  it('serves observatory routes with token and continuation validation', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:');
    const saved = store.saveObservation({
      title: 'Observatory auth',
      content: 'jwt rotation',
      project: 'obs-http',
      session_id: 'obs-session',
      topic_key: 'auth/jwt',
      type: 'decision',
    });
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    const { projectToken, sessionToken } = await resolveAtlasScopeTokens(port, 'obs-http', 'obs-session');
    const contextResponse = await fetch(`http://127.0.0.1:${port}/observatory/context?project_token=${encodeURIComponent(projectToken)}&session_token=${encodeURIComponent(sessionToken)}&query=jwt`);
    expect(contextResponse.status).toBe(200);
    const contextBody = await contextResponse.json();
    expect(contextBody.context_token).toBeTypeOf('string');

    const recallResponse = await fetch(`http://127.0.0.1:${port}/observatory/recall?context_token=${encodeURIComponent(contextBody.context_token)}&lanes=lexical`);
    expect(recallResponse.status).toBe(200);
    const recallBody = await recallResponse.json();
    expect(recallBody.lanes.lexical.length).toBeGreaterThan(0);

    const pivotResponse = await fetch(`http://127.0.0.1:${port}/observatory/pivot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pivot_token: recallBody.lanes.lexical[0].pivot_token, target: 'map' }),
    });
    expect(pivotResponse.status).toBe(200);

    const frontierResponse = await fetch(`http://127.0.0.1:${port}/observatory/map/frontier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_token: contextBody.context_token, focus_node_id: `obs:${saved.observation.id}`, visible_node_ids: [], max_nodes: 1 }),
    });
    expect(frontierResponse.status).toBe(200);
    const frontierBody = await frontierResponse.json();
    expect(frontierBody.frontier_state.added_node_ids.length).toBeGreaterThan(0);

    const invalidContinuationResponse = await fetch(`http://127.0.0.1:${port}/observatory/map/frontier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_token: contextBody.context_token, focus_node_id: `obs:${saved.observation.id}`, continuation: 'bad-token' }),
    });
    expect(invalidContinuationResponse.status).toBe(400);

    const invalidTokenResponse = await fetch(`http://127.0.0.1:${port}/observatory/recall?context_token=not-a-token`);
    expect(invalidTokenResponse.status).toBe(400);

    const ledgerResponse = await fetch(`http://127.0.0.1:${port}/observatory/ledger/${saved.observation.id}`);
    expect(ledgerResponse.status).toBe(200);

    const timelineResponse = await fetch(`http://127.0.0.1:${port}/observatory/timeline?context_token=${encodeURIComponent(contextBody.context_token)}&limit=1`);
    expect(timelineResponse.status).toBe(200);
  });

  it('observatory ledger defaults to current facts for omitted and false-like include_superseded values', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:');
    const saved = store.saveObservation({
      title: 'Ledger default current',
      content: '**What**: generated content ignored by fixture',
      project: 'ledger-history',
      session_id: 'ledger-history-session',
      topic_key: 'ledger/history',
      type: 'decision',
    });
    store.getDb().prepare(
      "DELETE FROM kg_triples WHERE source_type = 'observation' AND source_id = ? AND relation = 'HAS_WHAT'"
    ).run(saved.observation.id);
    seedVizSupersededFact(store, {
      observationId: saved.observation.id,
      project: 'ledger-history',
      subjectKey: 'ledger-current-subject',
      objectKey: 'ledger-current-object',
      objectName: 'Current ledger fact',
    });
    seedVizSupersededFact(store, {
      observationId: saved.observation.id,
      project: 'ledger-history',
      subjectKey: 'ledger-historical-subject',
      objectKey: 'ledger-historical-object',
      objectName: 'Historical ledger fact',
      superseded: true,
    });
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    for (const suffix of ['', '?include_superseded=false', '?include_superseded=', '?include_superseded=banana']) {
      const response = await fetch(`http://127.0.0.1:${port}/observatory/ledger/${saved.observation.id}${suffix}`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.what).toEqual(['Current ledger fact']);
      expect(body.facts.filter((fact: { relation: string }) => fact.relation === 'HAS_WHAT').map((fact: { object: string }) => fact.object)).toEqual(['Current ledger fact']);
      expect(body.facts.some((fact: { superseded?: boolean }) => fact.superseded === true)).toBe(false);
    }
  });

  it('observatory ledger include_superseded=true includes tagged historical facts', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:');
    const saved = store.saveObservation({
      title: 'Ledger opt-in current',
      content: '**What**: generated content ignored by fixture',
      project: 'ledger-history-opt-in',
      session_id: 'ledger-history-opt-in-session',
      topic_key: 'ledger/history',
      type: 'decision',
    });
    store.getDb().prepare(
      "DELETE FROM kg_triples WHERE source_type = 'observation' AND source_id = ? AND relation = 'HAS_WHAT'"
    ).run(saved.observation.id);
    seedVizSupersededFact(store, {
      observationId: saved.observation.id,
      project: 'ledger-history-opt-in',
      subjectKey: 'ledger-opt-current-subject',
      objectKey: 'ledger-opt-current-object',
      objectName: 'Current opt-in ledger fact',
    });
    seedVizSupersededFact(store, {
      observationId: saved.observation.id,
      project: 'ledger-history-opt-in',
      subjectKey: 'ledger-opt-historical-subject',
      objectKey: 'ledger-opt-historical-object',
      objectName: 'Historical opt-in ledger fact',
      superseded: true,
    });
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    const response = await fetch(`http://127.0.0.1:${port}/observatory/ledger/${saved.observation.id}?include_superseded=true`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.what).toEqual(['Current opt-in ledger fact', 'Historical opt-in ledger fact']);
    expect(body.facts.filter((fact: { relation: string }) => fact.relation === 'HAS_WHAT')).toEqual([
      expect.objectContaining({ object: 'Current opt-in ledger fact' }),
      expect.objectContaining({ object: 'Historical opt-in ledger fact', superseded: true }),
    ]);
  });

  it('observatory lane truth: HTTP recall lane payload must not clone lexical evidence into semantic/kg lanes', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:');
    store.saveObservation({
      title: 'HTTP lexical only',
      content: 'lexical-only phrase for http lane truth',
      project: 'obs-http-lane',
      session_id: 'obs-http-session',
    });
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    const { projectToken, sessionToken } = await resolveAtlasScopeTokens(port, 'obs-http-lane', 'obs-http-session');
    const contextResponse = await fetch(`http://127.0.0.1:${port}/observatory/context?project_token=${encodeURIComponent(projectToken)}&session_token=${encodeURIComponent(sessionToken)}&query=lexical-only`);
    expect(contextResponse.status).toBe(200);
    const contextBody = await contextResponse.json();

    const recallResponse = await fetch(
      `http://127.0.0.1:${port}/observatory/recall?context_token=${encodeURIComponent(contextBody.context_token)}&lanes=lexical,sentence-vector,chunk-vector,fact-kg&limit=20`,
    );
    expect(recallResponse.status).toBe(200);
    const recallBody = await recallResponse.json();

    expect(recallBody.lanes.lexical.length).toBeGreaterThan(0);
    expect(recallBody.lanes['sentence-vector'].length).toBe(0);
    expect(recallBody.lanes['chunk-vector'].length).toBe(0);
    expect(recallBody.lanes['fact-kg'].length).toBeGreaterThan(0);
    expect(recallBody.lane_states.lexical.status).toBe('ready');
    expect(recallBody.lane_states['sentence-vector'].status).toBe('pending');
    expect(recallBody.lane_states['chunk-vector'].status).toBe('pending');
    expect(recallBody.lane_states['fact-kg'].status).toBe('ready');
    expect(recallBody.lane_states['sentence-vector'].reason).toMatch(/^semantic-/);
    expect(recallBody.lane_states['chunk-vector'].reason).toMatch(/^semantic-/);
    expect(recallBody.lane_states['fact-kg'].reason).toBe('ok');
  });

  it('exposes background indexing failures through HTTP index status', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:');
    const saved = store.saveObservation({
      title: 'Index failure telemetry',
      content: 'provider outage should remain visible',
      project: 'idx-http-failure',
      session_id: 'idx-session',
    });
    store.getDb().prepare(
      `UPDATE semantic_jobs
       SET state = 'failed',
           attempt_count = 3,
           last_error = 'embedding provider offline',
           updated_at = datetime('now')
       WHERE job_key = ?`
    ).run(`chunk:${saved.observation.id}`);
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    const statusResponse = await fetch(`http://127.0.0.1:${port}/index/status?project=idx-http-failure`);
    expect(statusResponse.status).toBe(200);
    const statusBody = await statusResponse.json();
    expect(statusBody.health.semantic.recent_errors.some((error: { last_error: string | null; job_key: string }) => (
      error.job_key === `chunk:${saved.observation.id}`
      && error.last_error === 'embedding provider offline'
    ))).toBe(true);
    expect(statusBody.progress.recentErrors.some((error: { lastError: string | null; jobKey: string }) => (
      error.jobKey === `chunk:${saved.observation.id}`
      && error.lastError === 'embedding provider offline'
    ))).toBe(true);
  });
});
