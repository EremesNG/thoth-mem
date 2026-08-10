import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, GitBranch, Loader2, Orbit, RotateCcw, X } from 'lucide-react';

import { api, type VizInspectNodeResponse, type VizNode } from '../../api/client.js';
import { presentMemorySummary, presentNodeKind, presentObservationType } from '../dashboard-presentation.js';
import { presentStoredText } from '../safe-presentation.js';
import { nodeIdToObservationId } from './observatory-utils.js';

interface MemoryLensProps {
  nodeId: string | null;
  node?: VizNode | null;
  connectedNodes?: VizNode[];
  knownNodes?: VizNode[];
  project?: string;
  open: boolean;
  onClose: () => void;
  onExpand: (nodeId: string) => void;
  onPivot: (nodeId: string, target: 'recall' | 'timeline' | 'ledger') => void;
  onConnected: (nodeId: string) => void;
}

function metadataValue(details: VizInspectNodeResponse | null, key: string): unknown {
  return details?.metadata[key];
}

export default function MemoryLens({ nodeId, node, connectedNodes = [], knownNodes = [], project, open, onClose, onExpand, onPivot, onConnected }: MemoryLensProps) {
  const [details, setDetails] = useState<VizInspectNodeResponse | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!nodeId || !open || node?.kind !== 'observation' || nodeIdToObservationId(nodeId) === null) {
      setDetails(null);
      setError('');
      return;
    }
    const controller = new AbortController();
    const requestId = ++requestRef.current;
    setDetails(null);
    setError('');
    api.inspectVizNode(nodeId, { project }, controller.signal)
      .then((value) => { if (requestId === requestRef.current) setDetails(value); })
      .catch((cause: Error) => {
        if (cause.name !== 'AbortError' && requestId === requestRef.current) setError(presentStoredText(cause.message, 280));
      });
    return () => {
      controller.abort();
      requestRef.current += 1;
    };
  }, [node?.kind, nodeId, open, project, retry]);

  if (!open) return null;

  const title = presentStoredText(details?.label ?? node?.label) || 'Selected memory';
  const kind = details?.kind ?? node?.kind ?? 'observation';
  const summary = presentMemorySummary(details?.snippet ?? node?.snippet) || 'No public summary is available yet.';
  const connectionIds = details?.links.length ? details.links : connectedNodes.map(({ id }) => id);
  const connectedById = new Map([...knownNodes, ...connectedNodes].map((connectedNode) => [connectedNode.id, connectedNode]));
  const isObservation = kind === 'observation';

  return (
    <aside className="memory-lens" role="dialog" aria-labelledby="memory-lens-heading">
      <header>
        <div>
          <span className="lens-kicker"><Orbit size={14} /> Memory details</span>
          <h2 id="memory-lens-heading">{title}</h2>
        </div>
        <button type="button" className="icon-control" onClick={onClose} aria-label="Close memory details"><X size={17} /></button>
      </header>

      {!nodeId && <p>Choose a memory from the constellation to understand it here.</p>}
      {nodeId && isObservation && !details && !error && <div className="lens-state" role="status"><Loader2 className="spin-icon" /> Gathering its story…</div>}
      {error && <div className="lens-state degraded" role="alert"><AlertTriangle /> <span>These details could not be loaded. {error}</span><button type="button" onClick={() => setRetry((value) => value + 1)}><RotateCcw size={14} /> Try again</button></div>}

      {nodeId && (
        <>
          <span className="node-kind" data-node-kind={kind}>{presentNodeKind(kind)}</span>
          <section className="lens-summary">
            <h3>What this memory says</h3>
            <p>{summary}</p>
          </section>

          <section className="lens-section" aria-labelledby="lens-belongs-heading">
            <h3 id="lens-belongs-heading">Where it belongs</h3>
            <dl className="lens-provenance">
              <div><dt>Project</dt><dd>{presentStoredText(node?.project ?? metadataValue(details, 'project')) || 'Across projects'}</dd></div>
              <div><dt>Session</dt><dd>{presentStoredText(node?.session_id ?? metadataValue(details, 'session_id')) || 'No session attached'}</dd></div>
              <div><dt>Topic</dt><dd>{presentStoredText(node?.topic_key ?? metadataValue(details, 'topic_key')) || 'No topic attached'}</dd></div>
              {node?.type && <div><dt>Memory type</dt><dd>{presentObservationType(node.type)}</dd></div>}
            </dl>
          </section>

          <div className="lens-actions">
            <button type="button" className="lens-primary-action" onClick={() => onExpand(nodeId)}><GitBranch size={15} /> Explore connections</button>
            <button type="button" onClick={() => onPivot(nodeId, 'recall')}><Orbit size={15} /> Find related</button>
            <button type="button" onClick={() => onPivot(nodeId, 'timeline')}>Follow its story</button>
            {isObservation && <button type="button" onClick={() => onPivot(nodeId, 'ledger')}><BookOpen size={15} /> See what changed</button>}
          </div>

          {connectionIds.length > 0 && (
            <section className="lens-connections">
              <h3>Nearby memories</h3>
              <ul>{connectionIds.slice(0, 16).map((id, index) => {
                const connectedNode = connectedById.get(id);
                const fallbackKind = presentNodeKind(id.split(':', 1)[0]);
                return <li key={id}><button type="button" onClick={() => onConnected(id)}>{presentStoredText(connectedNode?.label) || `${fallbackKind} ${index + 1}`}</button></li>;
              })}</ul>
            </section>
          )}

          <details className="technical-disclosure">
            <summary>Technical details</summary>
            <code>{presentStoredText(nodeId)}</code>
            <dl className="lens-technical-list">
              <div><dt>Node kind</dt><dd>{presentStoredText(kind)}</dd></div>
              {details && Object.entries(details.metadata).slice(0, 12).map(([key, value]) => <div key={key}><dt>{presentStoredText(key)}</dt><dd>{presentStoredText(value)}</dd></div>)}
            </dl>
          </details>
        </>
      )}
    </aside>
  );
}
