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
          <span className="observatory-kicker"><DatabaseZap size={14} /> Memory readiness</span>
          <h2 id="health-heading">Check what is ready to explore</h2>
        </div>
        {degraded ? <AlertTriangle size={18} className="health-warning" /> : <CheckCircle2 size={18} className="health-ready" />}
      </div>

      <div className="health-grid">
        <div>
          <span>Meaning-based search</span>
          <strong>{current?.semantic_state === 'ready' ? 'Ready' : current?.semantic_state === 'degraded' ? 'Partly ready' : 'Preparing'}</strong>
        </div>
        <div>
          <span>Memories preparing</span>
          <strong>{current?.pending_jobs ?? 0}</strong>
        </div>
      </div>

      <div className="health-impact">
        <Activity size={15} />
        <p>
          {degraded
            ? 'Some meaning-based connections are still preparing. Saved memories and visible facts remain available.'
            : 'Everything needed for search, exploration, history, and connected facts is ready.'}
        </p>
      </div>
    </section>
  );
}
