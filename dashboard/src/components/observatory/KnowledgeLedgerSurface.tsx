import { BookOpen, GitCommitHorizontal, Link as LinkIcon } from 'lucide-react';

import type { ObservatoryLedgerResponse } from '../../api/client.js';
import { presentStoredText } from '../safe-presentation.js';
import { presentObservationType, presentRelation } from '../dashboard-presentation.js';

const sections = [
  ['what', 'What'],
  ['why', 'Why'],
  ['where', 'Where'],
  ['learned', 'What we learned'],
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
          <span className="observatory-kicker"><BookOpen size={14} /> Memory history</span>
          <h2 id="ledger-heading">See what this memory captured</h2>
        </div>
        {ledger && <span className="badge badge-primary">{presentObservationType(ledger.type)}</span>}
      </div>

      {!ledger && <p className="observatory-muted">{loading ? 'Gathering this memory’s history…' : 'Choose a saved memory to see what it captured and where it came from.'}</p>}

      {ledger && (
        <div className="ledger-body">
          <div>
            <h3>{presentStoredText(ledger.title)}</h3>
            <p className="observatory-provenance">
              {presentStoredText(ledger.provenance.project) || 'Any project'} / {presentStoredText(ledger.provenance.topic_key) || 'no topic'} / {new Date(ledger.provenance.created_at).toLocaleString()}
            </p>
          </div>

          <div className="ledger-fields">
            {sections.map(([key, label]) => (
              <article key={key}>
                <strong>{label}</strong>
                {ledger[key].length ? (
                  <ul>{ledger[key].slice(0, 4).map((item, index) => <li key={`${key}-${index}`}>{presentStoredText(item)}</li>)}</ul>
                ) : (
                  <span>No extracted field.</span>
                )}
              </article>
            ))}
          </div>

          <div className="ledger-facts">
            <div className="observatory-lane-heading">
              <span>Connected facts</span>
              <span className="badge badge-neutral">{ledger.facts.length}</span>
            </div>
            {ledger.facts.slice(0, 5).map((fact) => (
              <button key={fact.id} type="button" className="ledger-fact" onClick={() => onPivotToMap(`obs:${fact.observation_id}`)}>
                <GitCommitHorizontal size={14} />
                <span><strong>{presentStoredText(fact.subject)}</strong> {presentRelation(fact.relation)} {presentStoredText(fact.object)}</span>
              </button>
            ))}
            <details className="technical-disclosure"><summary><LinkIcon size={13} /> Source details</summary><div className="observatory-provenance">Session {presentStoredText(ledger.provenance.session_id)}</div></details>
          </div>
        </div>
      )}
    </section>
  );
}
