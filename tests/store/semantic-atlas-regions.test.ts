import { describe, expect, it } from 'vitest';
import { buildSemanticAtlasCommunityView } from '../../src/store/semantic-atlas-regions.js';
import type { AtlasCommunityProjection, AtlasEvidenceLink } from '../../src/store/semantic-atlas.js';
import type { Observation, SemanticAtlasNode } from '../../src/store/types.js';

function fixture(order: 'forward' | 'reverse', regionSize = 30) {
  const ids = Array.from({ length: regionSize * 8 }, (_, index) => `obs:${index + 1}`);
  const observations = ids.map((id, index) => ({
    id: Number(id.slice(4)), session_id: `session-${index % 12}`, type: 'decision',
    title: `Memory ${index + 1}`, content: `Content ${index + 1}`,
    project: `project-${index % 6}`, scope: 'project', topic_key: `topic/${index % 8}`,
    normalized_hash: `hash-${index}`, created_at: new Date(2025, 0, 1 + (index % 28)).toISOString(),
    updated_at: new Date(2025, 0, 1 + (index % 28)).toISOString(), deleted_at: null,
  })) satisfies Observation[];
  const nodes = new Map<string, SemanticAtlasNode>(observations.map((observation, index) => {
    const id = `obs:${observation.id}`;
    return [id, {
      id, kind: 'observation', label: observation.title, snippet: observation.content,
      project: observation.project ? { kind: 'project', token: `project:${index % 6}`, label: `Project ${index % 6 + 1}` } : null,
      session: { kind: 'session', token: `session:${index % 12}`, label: `Session ${index % 12 + 1}` },
      topic: observation.topic_key ? { kind: 'topic', token: `topic:${index % 8}`, label: `Topic ${index % 8 + 1}` } : null,
      type: observation.type,
      community_id: 'community:parent', member_count: null, project_count: null,
      unclustered: false, seed_x: 0, seed_y: 0,
    }];
  }));
  const links: AtlasEvidenceLink[] = [];
  for (let region = 0; region < 8; region += 1) {
    const start = region * regionSize;
    for (let offset = 0; offset < regionSize; offset += 1) {
      const source = ids[start + offset]!;
      const target = ids[start + ((offset + 1) % regionSize)]!;
      links.push({ source_id: source, target_id: target, weight: 2, evidence_count: 2, relations: ['USES'], direction: 'directed', provenance: [{ source_kind: 'kg-triple', source_id: `evidence:${region}:${offset}`, relation: 'USES', evidence_count: 2, confidence: 'high' }] });
    }
    if (region < 7) links.push({
      source_id: ids[start + 1]!, target_id: ids[start + regionSize + 1]!, weight: 0.2,
      evidence_count: 1, relations: ['AFFECTS'], direction: 'unknown', provenance: [{ source_kind: 'unknown', source_id: `evidence:bridge:${region}`, relation: 'AFFECTS', evidence_count: 1, confidence: 'unknown' }],
    });
  }
  const community: AtlasCommunityProjection = {
    id: 'community:parent', member_ids: ids, unclustered: false,
    node: { ...nodes.get(ids[0]!)!, id: 'community:parent', kind: 'community', member_count: ids.length },
  };
  const presentationEvidence = observations.flatMap((observation, index) => [
    { observation_id: observation.id, label: `Region ${Math.floor(index / regionSize) + 1} <private>SECRET</private>` },
    { observation_id: observation.id, label: 'Globally repeated evidence' },
  ]);
  if (order === 'reverse') {
    community.member_ids.reverse(); observations.reverse(); links.reverse(); presentationEvidence.reverse();
  }
  return { community, observations, observationNodes: nodes, evidenceLinks: links, presentationEvidence };
}

describe('semantic atlas Community regions', () => {
  it('builds a stable bounded working set with exact membership and explanations', () => {
    const forward = buildSemanticAtlasCommunityView(fixture('forward'));
    const reversed = buildSemanticAtlasCommunityView(fixture('reverse'));

    expect(forward.regions.length).toBeGreaterThanOrEqual(6);
    expect(forward.regions.length).toBeLessThanOrEqual(12);
    expect(forward.regions.reduce((sum, region) => sum + region.member_count, 0)).toBe(240);
    expect(forward.nodes.length).toBeGreaterThanOrEqual(80);
    expect(forward.nodes.length).toBeLessThanOrEqual(180);
    expect(forward.edges.length + forward.region_bridges.length).toBeLessThanOrEqual(450);
    expect(forward.source_memory_count).toBe(240);
    expect(forward.omitted_memory_count).toBe(240 - forward.nodes.length);

    const explanations = forward.regions.flatMap((region) => region.representatives);
    expect(explanations).toHaveLength(forward.nodes.length);
    expect(new Set(explanations.map((item) => item.node_id)).size).toBe(forward.nodes.length);
    for (const region of forward.regions) {
      expect(region.label).not.toMatch(/SECRET|Globally repeated evidence|obs:|hash/i);
      expect(region.representatives.map((item) => item.rank)).toEqual(
        Array.from({ length: region.representatives.length }, (_, index) => index + 1),
      );
      for (const explanation of region.representatives) {
        expect(explanation.reason.length).toBeLessThanOrEqual(120);
        expect(explanation.signals.length).toBeGreaterThanOrEqual(1);
        expect(explanation.signals.length).toBeLessThanOrEqual(3);
        expect(explanation.reason).not.toMatch(/obs:|hash|score|SECRET|Content|Memory \d+/i);
      }
      expect(region.facets.projects.length).toBeGreaterThan(0);
      expect(region.facets.sessions.length).toBeGreaterThan(0);
      expect(region.facets.topics.length).toBeGreaterThan(0);
      expect(region.facets.projects.every((facet) => facet.token.startsWith('project:'))).toBe(true);
      expect(region.facets.sessions.every((facet) => facet.token.startsWith('session:'))).toBe(true);
      expect(region.facets.topics.every((facet) => facet.token.startsWith('topic:'))).toBe(true);
    }
    expect(explanations.some((item) => item.signals.includes('recency'))).toBe(true);
    expect(explanations.some((item) => item.signals.includes('confidence'))).toBe(true);
    expect(explanations.some((item) => item.signals.includes('diversity'))).toBe(true);
    for (const edge of forward.edges) {
      expect(edge.tier).toMatch(/^representative-(backbone|semantic)$/);
      expect(edge.relationship_class).toBe('semantic');
      expect(edge.direction).toMatch(/^(directed|mixed|unknown)$/);
      expect(edge.confidence).toMatch(/^(high|medium|low|unknown)$/);
      expect(edge.provenance?.length).toBeGreaterThan(0);
      expect(edge.provenance.every((item) => item.source_id.startsWith('evidence:'))).toBe(true);
    }
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });

  it('preserves reversed bridge orientation and collapses opposing evidence to mixed', () => {
    const reversedInput = fixture('forward', 10);
    const crossRegionLinks = reversedInput.evidenceLinks.filter((link) => link.weight === 0.2);
    for (const link of crossRegionLinks) {
      [link.source_id, link.target_id] = [link.target_id, link.source_id];
      link.direction = 'directed';
    }
    const reversed = buildSemanticAtlasCommunityView(reversedInput);
    const regionByNode = new Map(reversed.regions.flatMap((region) => (
      region.representatives.map((representative) => [representative.node_id, region.id] as const)
    )));
    for (const bridge of reversed.region_bridges) {
      const supportingEdge = reversedInput.evidenceLinks.find((link) => (
        regionByNode.get(link.source_id) === bridge.source_region_id
        && regionByNode.get(link.target_id) === bridge.target_region_id
      ));
      expect(bridge.direction).toBe('directed');
      expect(supportingEdge, bridge.id).toBeDefined();
    }

    const mixedInput = fixture('forward', 10);
    const bridgeEvidence = mixedInput.evidenceLinks.find((link) => link.weight === 0.2)!;
    bridgeEvidence.direction = 'mixed';
    const mixed = buildSemanticAtlasCommunityView(mixedInput);
    const mixedRegionByNode = new Map(mixed.regions.flatMap((region) => (
      region.representatives.map((representative) => [representative.node_id, region.id] as const)
    )));
    const mixedBridge = mixed.region_bridges.find((bridge) => (
      new Set([bridge.source_region_id, bridge.target_region_id]).has(mixedRegionByNode.get(bridgeEvidence.source_id)!)
      && new Set([bridge.source_region_id, bridge.target_region_id]).has(mixedRegionByNode.get(bridgeEvidence.target_id)!)
    ));
    expect(mixedBridge?.direction).toBe('mixed');
  });
});
