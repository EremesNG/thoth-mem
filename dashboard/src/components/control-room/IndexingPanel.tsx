import { Database, Gauge, GitBranch } from 'lucide-react';

import type { IndexStatusResponse } from '../../api/client.js';

interface Props {
  busy: boolean;
  index: IndexStatusResponse | null;
  onGraph: () => void;
  onIndex: () => void;
}

function readinessLabel(value?: string): string {
  if (value === 'ready') return 'Ready';
  if (value === 'degraded') return 'Partly ready';
  if (value === 'pending' || value === 'rebuilding') return 'Preparing';
  return 'Not checked';
}

export default function IndexingPanel(props: Props) {
  return (
    <div className="control-split">
      <section className="control-panel" data-user-goal="check-readiness">
        <div className="control-panel-intro">
          <span>Retrieval readiness</span>
          <h2><Gauge /> Memory readiness</h2>
          <p>See whether meaning-based search and connections are ready for agents.</p>
        </div>
        <div className="health-ledger">
          <span>Meaning-based search<strong>{readinessLabel(props.index?.health.semantic_state)}</strong></span>
          <span>Memories preparing<strong>{props.index?.health.pending_jobs ?? 0}</strong></span>
          <span>Needs attention<strong>{props.index?.health.semantic?.jobs.failed ?? 0}</strong></span>
        </div>
        <details className="technical-disclosure">
          <summary>Index health details</summary>
          <ol className="lane-ledger">{props.index?.health.semantic?.lanes.map((lane) => <li key={lane.lane}><Database /><strong>{lane.lane}</strong><span>{lane.degraded ? 'degraded' : lane.pending ? 'pending' : lane.stale ? 'stale' : 'ready'}</span></li>)}</ol>
        </details>
      </section>
      <section className="control-panel" data-user-goal="repair-derived-data">
        <div className="control-panel-intro">
          <span>Safe maintenance</span>
          <h2><GitBranch /> Refresh memory connections</h2>
          <p>These actions recalculate derived data. Your saved memories are preserved.</p>
        </div>
        <button type="button" disabled={props.busy} onClick={props.onGraph}><GitBranch /> Review connection rebuild</button>
        <button type="button" disabled={props.busy} onClick={props.onIndex}><Gauge /> Review search rebuild</button>
      </section>
    </div>
  );
}
