import type { VizEdge, VizNode } from '../../api/client.js';
import { presentNodeKind, presentRelation } from '../dashboard-presentation.js';
import { presentStoredText } from '../safe-presentation.js';
import { connectedNodeIds } from './map-navigation.js';

interface GraphNavigatorProps {
  nodes: VizNode[];
  edges: VizEdge[];
  focusNodeId: string | null;
  onFocus: (nodeId: string) => void;
  onExpand: (nodeId: string) => void;
}

export default function GraphNavigator({ nodes, edges, focusNodeId, onFocus, onExpand }: GraphNavigatorProps) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const visibleIds = connectedNodeIds(focusNodeId, nodes, edges);
  return (
    <section className="graph-navigator" aria-labelledby="graph-navigator-heading">
      <header><h3 id="graph-navigator-heading">Nearby memories</h3><span>{visibleIds.length} in this trail</span></header>
      <p className="sr-only">Choose a visible memory or one of its neighbors. Each row lets you focus it or reveal more connections.</p>
      <ul>
        {visibleIds.map((id) => {
          const node = nodeById.get(id);
          if (!node) return null;
          const relation = edges.find((edge) => edge.source_id === id || edge.target_id === id)?.relation;
          const summary = `${presentNodeKind(node.kind)}: ${presentStoredText(node.label)}${relation ? `, ${presentRelation(relation)}` : ''}`;
          return (
            <li key={id} className={id === focusNodeId ? 'active' : ''}>
              <button type="button" aria-current={id === focusNodeId ? 'true' : undefined} onClick={() => onFocus(id)}>{summary}</button>
              <button type="button" className="navigator-expand" onClick={() => onExpand(id)} aria-label={`Explore connections from ${presentStoredText(node.label)}`}>+</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
