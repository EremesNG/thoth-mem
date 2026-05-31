import { ArrowRight, GitBranch, ListFilter, Search } from 'lucide-react';

import type { ObservatoryLane, ObservatoryRecallResponse } from '../../api/client.js';
import { readableLane } from './observatory-utils.js';

interface RecallWorkspaceProps {
  recall: ObservatoryRecallResponse | null;
  lanes: ObservatoryLane[];
  query: string;
  loading: boolean;
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
  onPivot: (pivotToken: string, target: 'map' | 'timeline' | 'ledger' | 'recall') => void;
}

export default function RecallWorkspace({ recall, lanes, query, loading, onQueryChange, onRefresh, onPivot }: RecallWorkspaceProps) {
  return (
    <section className="observatory-panel recall-workspace" aria-labelledby="recall-heading" data-testid="recall-workspace">
      <div className="observatory-panel-header">
        <div>
          <span className="observatory-kicker"><ListFilter size={14} /> Recall Workspace</span>
          <h2 id="recall-heading">Hybrid lane evidence</h2>
        </div>
        <button type="button" className="map-icon-button" onClick={onRefresh} title="Refresh recall" disabled={loading}>
          <Search size={15} />
        </button>
      </div>

      <label className="map-field">
        <span>Query</span>
        <div className="map-input-icon">
          <Search size={14} />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search evidence across lanes" />
        </div>
      </label>

      <div className="observatory-lane-stack">
        {lanes.map((lane) => {
          const hits = recall?.lanes[lane] ?? [];
          return (
            <article key={lane} className="observatory-lane-group">
              <div className="observatory-lane-heading">
                <span>{readableLane(lane)}</span>
                <span className="badge badge-neutral">{hits.length}</span>
              </div>
              {hits.length === 0 ? (
                <p className="observatory-muted">No scoped evidence returned.</p>
              ) : (
                hits.slice(0, 4).map((hit) => (
                  <div key={`${lane}-${hit.observation_id}`} className="observatory-evidence-item" tabIndex={0}>
                    <div>
                      <strong>{hit.title}</strong>
                      <p>{hit.preview || 'No public preview available.'}</p>
                      <span className="observatory-provenance">
                        {hit.project || 'Any project'} / {hit.topic_key || 'no topic'} / {new Date(hit.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="observatory-pivot-actions" aria-label={`Pivot actions for ${hit.title}`}>
                      <button type="button" onClick={() => onPivot(hit.pivot_token, 'map')} title="Pivot to map">
                        <GitBranch size={14} />
                      </button>
                      <button type="button" onClick={() => onPivot(hit.pivot_token, 'ledger')} title="Pivot to ledger">
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
