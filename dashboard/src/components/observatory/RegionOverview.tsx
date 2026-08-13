import type { SemanticAtlasRegion, SemanticAtlasRegionBridge, VizNode } from '../../api/client.js';
import { buildRegionOverviewModel } from './region-overview-model.js';

interface RegionOverviewProps {
  region: SemanticAtlasRegion;
  bridges: SemanticAtlasRegionBridge[];
  nodes: VizNode[];
  onClear: () => void;
  onOpenMemory: (nodeId: string) => void;
}

export default function RegionOverview({ region, bridges, nodes, onClear, onOpenMemory }: RegionOverviewProps) {
  const model = buildRegionOverviewModel(region, bridges, nodes);
  return (
    <section className="region-overview" aria-labelledby="region-overview-heading">
      <header>
        <span className="region-overview-kicker">Focused semantic cloud</span>
        <h2 id="region-overview-heading">{model.label}</h2>
        <p className="region-overview-counts"><strong>{region.member_count.toLocaleString()}</strong> source memories <span aria-hidden="true">·</span> <strong>{region.project_count.toLocaleString()}</strong> projects</p>
      </header>
      <p className="region-overview-summary">{model.summary}</p>
      {region.time_from && region.time_to ? <p className="region-overview-time"><strong>Active span</strong><span>{new Date(region.time_from).toLocaleDateString()} – {new Date(region.time_to).toLocaleDateString()}</span></p> : null}
      <div className="region-concepts" aria-label="Distinguishing concepts">
        {model.concepts.map((concept) => <span key={concept.label}>{concept.label} · {concept.count}</span>)}
      </div>
      {model.facets.length > 0 ? <div className="region-facets" aria-label="Region facets">{model.facets.map((facet) => <span key={facet.label}>{facet.label} · {facet.count}</span>)}</div> : null}
      <h3>Representative memories</h3>
      <ul className="region-representatives">
        {model.representatives.slice(0, 8).map(({ node, representative }) => (
          <li key={node.id}>
            <button type="button" onClick={() => onOpenMemory(node.id)}>{node.label}</button>
            <span>{representative.reason}</span>
          </li>
        ))}
      </ul>
      {model.representatives.length > 8 ? <p className="region-overview-more">+ {model.representatives.length - 8} more representatives remain in the semantic navigator</p> : null}
      {model.strongestBridges.length > 0 ? (
        <section className="region-bridge-summary" aria-label="Strongest aggregate bridges">
          <h3>Strongest currents</h3>
          {model.strongestBridges.slice(0, 3).map((bridge) => (
            <p key={bridge.id}><strong>{bridge.evidence_count} evidence items</strong><span>{bridge.confidence} confidence · {bridge.direction} · weight {bridge.weight.toFixed(2)}</span></p>
          ))}
        </section>
      ) : null}
      <button className="region-clear-button" type="button" onClick={onClear}>Return to constellation overview</button>
    </section>
  );
}
