import { Activity } from 'lucide-react';

import type { OperationTrace, OperationTraceOrigin, OperationTraceStatus } from '../../api/client.js';
import GuidedSelect from '../GuidedSelect.js';
import { formatBoundedResult, presentStoredText } from '../safe-presentation.js';

const originOptions = [
  { value: 'mcp', label: 'Agent tools' },
  { value: 'http', label: 'Dashboard and HTTP' },
  { value: 'cli', label: 'Command line' },
  { value: 'system', label: 'Background work' },
];

const statusOptions = [
  { value: 'ok', label: 'Completed' },
  { value: 'error', label: 'Needs attention' },
];

interface Props {
  traces: OperationTrace[];
  selected: OperationTrace | null;
  detailLoading?: boolean;
  detailError?: string;
  origin: OperationTraceOrigin | '';
  status: OperationTraceStatus | '';
  target: string;
  targets: string[];
  onOrigin: (value: OperationTraceOrigin | '') => void;
  onStatus: (value: OperationTraceStatus | '') => void;
  onTarget: (value: string) => void;
  onSelect: (value: OperationTrace) => void;
}

export default function TracesPanel(props: Props) {
  const targetOptions = props.targets.map((target, index) => ({
    canonical: target,
    label: presentStoredText(target),
    value: `action-${index + 1}`,
  }));
  const selectedTargetValue = targetOptions.find((option) => option.canonical === props.target)?.value ?? '';
  return (
    <div className="control-split">
      <section className="control-panel" data-user-goal="review-activity">
        <div className="control-panel-intro">
          <span>Recent activity</span>
          <h2><Activity /> How memory has been used</h2>
          <p>Filter recent saves, searches, and maintenance work to find the event you care about.</p>
        </div>
        <div className="trace-controls">
          <GuidedSelect
            label="Activity source"
            value={props.origin || undefined}
            options={originOptions}
            allLabel="Every source"
            onChange={(value) => props.onOrigin((value ?? '') as OperationTraceOrigin | '')}
          />
          <GuidedSelect
            label="Activity outcome"
            value={props.status || undefined}
            options={statusOptions}
            allLabel="Every outcome"
            onChange={(value) => props.onStatus((value ?? '') as OperationTraceStatus | '')}
          />
          <GuidedSelect
            label="Memory action"
            value={selectedTargetValue || undefined}
            options={targetOptions}
            allLabel="Every action"
            emptyMessage="No actions found"
            onChange={(value) => props.onTarget(targetOptions.find((option) => option.value === value)?.canonical ?? '')}
          />
        </div>
        <ol className="trace-tape">{props.traces.map((trace) => <li key={trace.trace_id}><button type="button" onClick={() => props.onSelect(trace)}><span>{trace.origin === 'mcp' ? 'agent' : trace.origin}</span><strong>{presentStoredText(trace.target)}</strong><small>{trace.duration_ms}ms</small><em className={trace.status}>{trace.status === 'ok' ? 'done' : 'attention'}</em></button></li>)}</ol>
      </section>

      <section className="control-panel trace-detail" data-user-goal="understand-activity" aria-busy={props.detailLoading}>
        <div className="control-panel-intro"><span>Selected event</span><h2>What happened</h2><p>Open technical evidence only when you need to diagnose the exact request.</p></div>
        {props.detailError
          ? <p className="degraded" role="alert">These details could not be loaded. {presentStoredText(props.detailError, 260)}</p>
          : props.detailLoading
            ? <p role="status">Gathering activity details…</p>
            : props.selected
              ? <details className="technical-disclosure"><summary>Show technical evidence</summary><code>{presentStoredText(props.selected.trace_id)}</code><pre>{formatBoundedResult({ target: presentStoredText(props.selected.target), project: props.selected.project, request: props.selected.request_json, response: props.selected.response_json, error: props.selected.error })}</pre></details>
              : <p>Choose an event to understand it here.</p>}
      </section>
    </div>
  );
}
