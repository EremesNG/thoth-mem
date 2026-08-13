import type { SemanticAtlasRegion, SemanticAtlasRegionBridge, VizNode } from '../../api/client.js';
import { presentStoredText } from '../safe-presentation.js';

export function buildRegionOverviewModel(region: SemanticAtlasRegion, bridges: SemanticAtlasRegionBridge[], nodes: VizNode[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const representatives = region.representatives.flatMap((representative) => {
    const node = nodeById.get(representative.node_id);
    return node ? [{ node: { ...node, label: presentStoredText(node.label) }, representative: { ...representative, reason: presentStoredText(representative.reason) } }] : [];
  }).slice(0, 12);
  const facets = [...region.facets.projects, ...region.facets.sessions, ...region.facets.topics, ...region.facets.types]
    .map((facet) => ({ label: presentStoredText('label' in facet ? facet.label : facet.value), count: facet.count }))
    .slice(0, 8);
  return {
    label: presentStoredText(region.label),
    summary: presentStoredText(region.summary),
    concepts: region.concepts.map((concept) => ({ ...concept, label: presentStoredText(concept.label) })),
    facets,
    representatives,
    strongestBridges: bridges.filter((bridge) => bridge.source_region_id === region.id || bridge.target_region_id === region.id)
      .sort((left, right) => right.weight - left.weight).slice(0, 5),
  };
}
