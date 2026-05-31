import { BookOpen, GitCommitHorizontal, Link as LinkIcon } from 'lucide-react';

import type { ObservatoryLedgerResponse } from '../../api/client.js';

const sections = [
  ['what', 'What'],
  ['why', 'Why'],
  ['where', 'Where'],
  ['learned', 'Learned'],
] as const;

interface KnowledgeLedgerSurfaceProps {
  ledger: ObservatoryLedgerResponse | null;
  loading: boolean;
  onPivotToMap: (nodeId: string) => void;
}

export default function KnowledgeLedgerSurface({ ledger, loading, onPivotToMap }: KnowledgeLedgerSurfaceProps) {
  return (
    <section className="observatory-panel ledger-surface" aria-labelledby="ledger-heading" data-testid="knowledge-ledger-surface">
      <div className="observatory-panel-header">
        <div>
          <span className="observatory-kicker"><BookOpen size={14} /> Knowledge Ledger</span>
          <h2 id="ledger-heading">Structured explanation</h2>
        </div>
        {ledger && <span className="badge badge-primary">{ledger.type}</span>}
      </div>

      {!ledger && <p className="observatory-muted">{loading ? 'Loading ledger detail...' : 'Pivot to an observation to inspect source chains.'}</p>}

      {ledger && (
        <div className="ledger-body">
          <div>
            <h3>{ledger.title}</h3>
            <p className="observatory-provenance">
              {ledger.provenance.project || 'Any project'} / {ledger.provenance.topic_key || 'no topic'} / {new Date(ledger.provenance.created_at).toLocaleString()}
            </p>
          </div>

          <div className="ledger-fields">
            {sections.map(([key, label]) => (
              <article key={key}>
                <strong>{label}</strong>
                {ledger[key].length ? (
                  <ul>{ledger[key].slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul>
                ) : (
                  <span>No extracted field.</span>
                )}
              </article>
            ))}
          </div>

          <div className="ledger-facts">
            <div className="observatory-lane-heading">
              <span>Facts and provenance</span>
              <span className="badge badge-neutral">{ledger.facts.length}</span>
            </div>
            {ledger.facts.slice(0, 5).map((fact) => (
              <button key={fact.id} type="button" className="ledger-fact" onClick={() => onPivotToMap(`obs:${fact.observation_id}`)}>
                <GitCommitHorizontal size={14} />
                <span><strong>{fact.subject}</strong> {fact.relation} {fact.object}</span>
              </button>
            ))}
            <div className="observatory-provenance"><LinkIcon size={13} /> Source session {ledger.provenance.session_id}</div>
          </div>
        </div>
      )}
    </section>
  );
}
