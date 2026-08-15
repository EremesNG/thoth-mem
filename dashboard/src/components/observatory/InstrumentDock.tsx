import type { ObservatoryContextResponse, ObservatoryLedgerResponse, ObservatoryRecallResponse, ObservatoryTimelineResponse, VizHealthResponse } from '../../api/client.js';
import type { ObservatorySurface } from './context-store.js';
import RecallWorkspace from './RecallWorkspace.js';
import TimelineSurface from './TimelineSurface.js';
import KnowledgeLedgerSurface from './KnowledgeLedgerSurface.js';
import HealthIndexingSurface from './HealthIndexingSurface.js';
import { presentStoredText } from '../safe-presentation.js';
import { presentSurface } from '../dashboard-presentation.js';

interface Props {
  active: ObservatorySurface;
  recall: ObservatoryRecallResponse | null; timeline: ObservatoryTimelineResponse | null; ledger: ObservatoryLedgerResponse | null; health: VizHealthResponse | null; context: ObservatoryContextResponse | null;
  focusNodeId: string | null; query: string; loading: { recall: boolean; timeline: boolean; ledger: boolean };
  onQuery: (query: string) => void; onRecallRefresh: () => void; onLoadMore: () => void; onPivotToken: (token: string, target: ObservatorySurface) => void; onPivotNode: (id: string, target: ObservatorySurface) => void;
  error?: string | null;
  onRetry: () => void;
}
export default function InstrumentDock(props: Props) {
  if (props.active === 'map') return null;
  return <section className="instrument-dock" aria-label={`${presentSurface(props.active)} view`}>
    {props.error && <div className="error-container" role="alert"><span>This view could not be loaded. {presentStoredText(props.error, 240)}</span><button type="button" onClick={props.onRetry}>Try {presentSurface(props.active).toLocaleLowerCase()} again</button></div>}
    {props.active === 'recall' && <RecallWorkspace recall={props.recall} lanes={['lexical','sentence-vector','chunk-vector','fact-kg']} query={props.query} loading={props.loading.recall} onQueryChange={props.onQuery} onRefresh={props.onRecallRefresh} onPivot={props.onPivotToken} />}
    {props.active === 'timeline' && <TimelineSurface timeline={props.timeline} focusNodeId={props.focusNodeId} loading={props.loading.timeline} onLoadMore={props.onLoadMore} onPivot={props.onPivotNode} />}
    {props.active === 'ledger' && <KnowledgeLedgerSurface ledger={props.ledger} loading={props.loading.ledger} onPivotToMap={(id) => props.onPivotNode(id, 'map')} />}
    {props.active === 'health' && <HealthIndexingSurface health={props.health} contextHealth={props.context?.health ?? null} />}
  </section>;
}
