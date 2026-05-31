import { Activity, AlertTriangle, CheckCircle2, DatabaseZap } from 'lucide-react';

import type { VizHealthResponse } from '../../api/client.js';

interface HealthIndexingSurfaceProps {
  health: VizHealthResponse | null;
  contextHealth: VizHealthResponse | null;
}

export default function HealthIndexingSurface({ health, contextHealth }: HealthIndexingSurfaceProps) {
  const current = health ?? contextHealth;
  const degraded = current?.semantic_state !== 'ready' || Boolean(current?.pending_jobs);

  return (
    <section className="observatory-panel health-surface" aria-labelledby="health-heading" data-testid="health-indexing-surface">
      <div className="observatory-panel-header">
        <div>
          <span className="observatory-kicker"><DatabaseZap size={14} /> Health & Indexing</span>
          <h2 id="health-heading">Lane readiness</h2>
        </div>
        {degraded ? <AlertTriangle size={18} className="health-warning" /> : <CheckCircle2 size={18} className="health-ready" />}
      </div>

      <div className="health-grid">
        <div>
          <span>Semantic index</span>
          <strong>{current?.semantic_state ?? 'unknown'}</strong>
        </div>
        <div>
          <span>Pending jobs</span>
          <strong>{current?.pending_jobs ?? 0}</strong>
        </div>
      </div>

      <div className="health-impact">
        <Activity size={15} />
        <p>
          {degraded
            ? 'Semantic lanes may be stale or partial; lexical, facts, and visible provenance remain usable.'
            : 'All visible lanes are ready for scoped recall, map traversal, timeline, and ledger pivots.'}
        </p>
      </div>
    </section>
  );
}
