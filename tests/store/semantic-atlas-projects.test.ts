import { describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';
import { SemanticAtlasError } from '../../src/store/types.js';

describe('Store project semantic atlas', () => {
  it('opens Universe as private-safe project nebulae with project-owned constellation cores', () => {
    const store = new Store(':memory:');
    try {
      const fixtures = [
        { title: 'Alpha page.ts', project: 'Alpha workspace' },
        { title: 'Alpha sidebar.tsx', project: 'Alpha workspace' },
        { title: 'Beta service.ts', project: 'Beta workspace' },
        { title: 'Beta model.ts', project: 'Beta workspace' },
        { title: 'Loose memory.ts', project: null },
      ] as const;
      for (const fixture of fixtures) {
        const saved = store.saveObservation({
          title: fixture.title,
          content: `Public evidence for ${fixture.title}`,
          project: fixture.project,
        });
        if (fixture.project === null) {
          store.getDb().prepare('UPDATE observations SET project = NULL WHERE id = ?')
            .run(saved.observation.id);
        }
      }

      const universe = store.getSemanticAtlasPage({
        hierarchy: 'project',
        level: 'universe',
        page_size: 24,
      });

      expect(universe.hierarchy).toBe('project');
      expect(universe.project_regions).toHaveLength(3);
      expect(universe.project_regions.map((region) => region.label).sort()).toEqual([
        'Alpha workspace',
        'Beta workspace',
        'Unassigned',
      ]);
      expect(universe.nodes.length).toBeGreaterThanOrEqual(3);
      expect(universe.nodes.every((node) => (
        node.kind === 'community'
        && typeof node.owner_project_id === 'string'
        && node.owner_project_id.length > 0
      ))).toBe(true);
      expect(universe.nodes.some((node) => fixtures.some((fixture) => fixture.title === node.label))).toBe(false);
      expect(universe.navigation).toMatchObject({
        project_id: null,
        source_project_count: 3,
        visible_project_count: 3,
        omitted_projects: 0,
        source_constellation_count: universe.nodes.length,
        visible_constellation_count: universe.nodes.length,
        omitted_constellations: 0,
        source_memory_count: 5,
      });
      expect(universe.project_regions.reduce((total, region) => total + region.memory_count, 0)).toBe(5);
    } finally {
      store.close();
    }
  });

  it('opens one project as only its owned constellations', () => {
    const store = new Store(':memory:');
    try {
      for (const [title, project] of [
        ['Alpha decision', 'Alpha workspace'],
        ['Alpha discovery', 'Alpha workspace'],
        ['Beta decision', 'Beta workspace'],
      ] as const) {
        store.saveObservation({ title, content: `${title} public evidence`, project });
      }
      const universe = store.getSemanticAtlasPage({ hierarchy: 'project', level: 'universe' });
      const alpha = universe.project_regions.find((region) => region.label === 'Alpha workspace')!;

      const project = store.getSemanticAtlasPage({
        hierarchy: 'project',
        level: 'project',
        project_id: alpha.id,
        page_size: 150,
      });

      expect(project.hierarchy).toBe('project');
      expect(project.level).toBe('project');
      expect(project.navigation).toMatchObject({
        project_id: alpha.id,
        source_project_count: 1,
        visible_project_count: 1,
        source_memory_count: 2,
      });
      expect(project.nodes.length).toBeGreaterThan(0);
      expect(project.nodes.every((node) => node.owner_project_id === alpha.id)).toBe(true);
      expect(project.nodes.reduce((total, node) => total + (node.member_count ?? 0), 0)).toBe(2);
      expect(project.project_regions).toEqual([]);

      const community = store.getSemanticAtlasPage({
        hierarchy: 'project', level: 'community', project_id: alpha.id,
        community_id: project.nodes[0]!.community_id!, presentation: 'semantic-zoom',
      });
      expect(community.navigation).toMatchObject({
        source_constellation_count: 1,
        visible_constellation_count: 1,
        omitted_constellations: 0,
      });
    } finally {
      store.close();
    }
  });

  it('rejects project-owned identities without explicit hierarchy and incomplete project locations', () => {
    const store = new Store(':memory:');
    try {
      store.saveObservation({ title: 'Owned memory', content: 'Owned evidence', project: 'Owned project' });
      const universe = store.getSemanticAtlasPage({ hierarchy: 'project', level: 'universe' });
      const project = universe.project_regions[0]!;
      const projectCommunityId = project.constellation_ids[0]!;
      const globalCommunityId = store.getSemanticAtlasPage({ hierarchy: 'global', level: 'universe' }).nodes[0]!.id;
      const expectHierarchyInvalid = (read: () => unknown) => {
        try {
          read();
          throw new Error('Expected hierarchy validation to fail');
        } catch (error) {
          expect(error).toBeInstanceOf(SemanticAtlasError);
          expect((error as SemanticAtlasError).code).toBe('VIZ_ATLAS_HIERARCHY_INVALID');
        }
      };
      expect(() => store.getSemanticAtlasPage({ level: 'project', project_id: project.id })).toThrow(/hierarchy|project/i);
      expect(() => store.getSemanticAtlasPage({ hierarchy: 'project', level: 'project' })).toThrow(/project/i);
      expect(() => store.getSemanticAtlasPage({ hierarchy: 'project', level: 'community', community_id: project.constellation_ids[0] })).toThrow(/project/i);
      expect(() => store.getSemanticAtlasPage({ hierarchy: 'project', level: 'universe', project_id: project.id })).toThrow(/project|universe/i);
      expectHierarchyInvalid(() => store.getSemanticAtlasPage({ hierarchy: 'global', level: 'universe', community_id: globalCommunityId }));
      expectHierarchyInvalid(() => store.getSemanticAtlasPage({ hierarchy: 'project', level: 'universe', community_id: projectCommunityId }));
      expectHierarchyInvalid(() => store.getSemanticAtlasPage({ hierarchy: 'project', level: 'project', project_id: project.id, community_id: projectCommunityId }));
      expectHierarchyInvalid(() => store.getSemanticAtlasPage({ hierarchy: 'project', level: 'community', project_id: project.id, community_id: projectCommunityId, focus_node_id: 'obs:1' }));
    } finally {
      store.close();
    }
  });

  it('keeps safe-label collisions opaque, distinct, and deterministic', () => {
    const build = (projects: string[]) => {
      const store = new Store(':memory:');
      try {
        projects.forEach((project, index) => store.saveObservation({
          title: `Collision memory ${index}`,
          content: 'Public collision evidence',
          project,
        }));
        return store.getSemanticAtlasPage({ hierarchy: 'project', level: 'universe' })
          .project_regions.map(({ id, label }) => ({ id, label })).sort((left, right) => left.id.localeCompare(right.id));
      } finally {
        store.close();
      }
    };
    const projects = ['Shared <private>ALPHA_SECRET</private>', 'Shared <private>BETA_SECRET</private>'];
    const forward = build(projects);
    const reversed = build([...projects].reverse());

    expect(forward).toEqual(reversed);
    expect(new Set(forward.map(({ id }) => id))).toHaveLength(2);
    expect(new Set(forward.map(({ label }) => label))).toHaveLength(2);
    expect(JSON.stringify(forward)).not.toMatch(/ALPHA_SECRET|BETA_SECRET|<private>/);
  });

  it('represents cross-project semantic evidence only as a project bridge', () => {
    const store = new Store(':memory:');
    try {
      const alpha = store.saveObservation({ title: 'Alpha memory', content: 'Alpha evidence', project: 'Alpha' }).observation;
      const beta = store.saveObservation({ title: 'Beta memory', content: 'Beta evidence', project: 'Beta' }).observation;
      const db = store.getDb();
      const insertEntity = db.prepare(`INSERT INTO kg_entities (
        entity_key, entity_type, canonical_name, aliases_json, metadata_json, updated_at
      ) VALUES (?, 'concept', ?, '[]', '{}', datetime('now')) RETURNING id`);
      const subject = (insertEntity.get('project-bridge:subject', 'Project bridge subject') as { id: number }).id;
      const object = (insertEntity.get('project-bridge:object', 'Project bridge object') as { id: number }).id;
      const insertTriple = db.prepare(`INSERT INTO kg_triples (
        subject_entity_id, relation, object_entity_id, source_type, source_id,
        project, provenance, confidence, triple_hash, extractor_version
      ) VALUES (?, 'USES', ?, 'observation', ?, ?, ?, 0.9, ?, 'project-atlas-test')`);
      insertTriple.run(subject, object, alpha.id, 'Alpha', `observation:${alpha.id}`, 'project-bridge:alpha');
      insertTriple.run(subject, object, beta.id, 'Beta', `observation:${beta.id}`, 'project-bridge:beta');

      const universe = store.getSemanticAtlasPage({ hierarchy: 'project', level: 'universe' });
      expect(universe.project_bridges).toHaveLength(1);
      expect(universe.nodes.every((node) => (node.member_count ?? 0) === 1)).toBe(true);
      const owners = new Set(universe.nodes.map((node) => node.owner_project_id));
      expect(owners).toHaveLength(2);
      expect(universe.edges).toEqual([]);
    } finally {
      store.close();
    }
  });

  it('validates project ownership through Constellation and Neighborhood', () => {
    const store = new Store(':memory:');
    try {
      const alphaIds = ['Alpha first', 'Alpha second'].map((title) => store.saveObservation({
        title,
        content: `${title} public evidence`,
        project: 'Alpha workspace',
      }).observation.id);
      store.saveObservation({
        title: 'Beta only',
        content: 'Beta public evidence',
        project: 'Beta workspace',
      });
      const universe = store.getSemanticAtlasPage({ hierarchy: 'project', level: 'universe' });
      const alpha = universe.project_regions.find((region) => region.label === 'Alpha workspace')!;
      const beta = universe.project_regions.find((region) => region.label === 'Beta workspace')!;
      const project = store.getSemanticAtlasPage({
        hierarchy: 'project',
        level: 'project',
        project_id: alpha.id,
      });
      const communityId = project.nodes[0]!.id;

      const constellation = store.getSemanticAtlasPage({
        hierarchy: 'project',
        level: 'community',
        project_id: alpha.id,
        community_id: communityId,
      });
      expect(constellation.hierarchy).toBe('project');
      expect(constellation.nodes.map((node) => node.id).sort()).toEqual(
        alphaIds.map((id) => `obs:${id}`).sort(),
      );
      expect(constellation.nodes.every((node) => node.owner_project_id === alpha.id)).toBe(true);

      expect(() => store.getSemanticAtlasPage({
        hierarchy: 'project',
        level: 'community',
        project_id: beta.id,
        community_id: communityId,
      })).toThrow(/constellation|project/i);

      const neighborhood = store.getSemanticAtlasPage({
        hierarchy: 'project',
        level: 'neighborhood',
        project_id: alpha.id,
        community_id: communityId,
        focus_node_id: `obs:${alphaIds[0]}`,
      });
      expect(neighborhood.hierarchy).toBe('project');
      expect(neighborhood.navigation).toMatchObject({
        project_id: alpha.id,
        community_id: communityId,
        focus_node_id: `obs:${alphaIds[0]}`,
      });
      expect(neighborhood.nodes.every((node) => node.owner_project_id === alpha.id)).toBe(true);
    } finally {
      store.close();
    }
  });

  it('resolves search pivots to the current opaque project owner tuple', async () => {
    const store = new Store(':memory:');
    try {
      const saved = store.saveObservation({
        title: 'Alpha pivot memory',
        content: 'Alpha pivot public evidence',
        project: 'Alpha <private>OWNER_SECRET</private>',
      }).observation;
      const context = store.getSemanticObservatoryContext({ query: 'Alpha pivot' });
      const recall = await store.getSemanticObservatoryRecall({
        hierarchy: 'project',
        context_token: context.context_token,
        lanes: ['lexical'],
        limit: 1,
      });
      const hit = recall.lanes.lexical[0]!;

      expect(hit.project_id).toMatch(/^project:/);
      expect(hit.community_id).toMatch(/^community:/);
      const pivot = store.resolveSemanticObservatoryPivot({
        hierarchy: 'project',
        pivot_token: hit.pivot_token,
        target: 'map',
      });
      expect(pivot).toMatchObject({
        hierarchy: 'project',
        project_id: hit.project_id,
        community_id: hit.community_id,
        focus_node_id: `obs:${saved.id}`,
        target: 'map',
      });
      expect(JSON.stringify({ recall, pivot })).not.toMatch(/OWNER_SECRET|<private>/);
    } finally {
      store.close();
    }
  });

  it('keeps 181 projects reachable through bounded non-overlapping Universe pages', () => {
    const store = new Store(':memory:');
    try {
      for (let index = 1; index <= 181; index += 1) {
        store.saveObservation({
          title: `Project memory ${index}`,
          content: `Public project evidence ${index}`,
          project: `Project ${String(index).padStart(3, '0')}`,
        });
      }
      const seenProjectIds = new Set<string>();
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = store.getSemanticAtlasPage({
          hierarchy: 'project',
          level: 'universe',
          page_size: 24,
          cursor,
        });
        pages += 1;
        expect(page.project_regions.length).toBeLessThanOrEqual(24);
        expect(page.nodes.length).toBeLessThanOrEqual(72);
        for (const region of page.project_regions) {
          expect(seenProjectIds.has(region.id)).toBe(false);
          seenProjectIds.add(region.id);
        }
        cursor = page.continuation ?? undefined;
      } while (cursor);

      expect(pages).toBe(8);
      expect(seenProjectIds).toHaveLength(181);
    } finally {
      store.close();
    }
  });
});
