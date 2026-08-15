import { Save, Terminal } from 'lucide-react';

import type { ObservationType, OperationCatalogEntry } from '../../api/client.js';
import GuidedSelect from '../GuidedSelect.js';
import { presentObservationType } from '../dashboard-presentation.js';
import { presentStoredText } from '../safe-presentation.js';

const types: ObservationType[] = ['decision', 'architecture', 'bugfix', 'pattern', 'config', 'discovery', 'learning', 'session_summary', 'manual'];
const typeOptions = types.map((value) => ({ value, label: presentObservationType(value) }));

interface Props {
  busy: boolean;
  title: string;
  content: string;
  type: ObservationType;
  operations: OperationCatalogEntry[];
  onTitle: (value: string) => void;
  onContent: (value: string) => void;
  onType: (value: ObservationType) => void;
  onCreate: () => void;
}

export default function OperationsPanel(props: Props) {
  return (
    <div className="control-split">
      <section className="control-panel" data-user-goal="capture-memory">
        <div className="control-panel-intro">
          <span>Keep something important</span>
          <h2><Save /> Save a memory</h2>
          <p>Capture the outcome and why it matters so agents can use it in future work.</p>
        </div>
        <label>Short name<input value={props.title} onChange={(event) => props.onTitle(event.target.value)} placeholder="What should this memory be called?" /></label>
        <GuidedSelect
          label="Memory type"
          value={props.type}
          options={typeOptions}
          clearable={false}
          onChange={(value) => {
            if (value) props.onType(value as ObservationType);
          }}
        />
        <label>What should agents remember?<textarea value={props.content} onChange={(event) => props.onContent(event.target.value)} placeholder="Describe what happened, why, and what was learned." /></label>
        <button type="button" className="primary-action" disabled={!props.title || !props.content || props.busy} onClick={props.onCreate}><Save /> Review and save</button>
      </section>

      <section className="control-panel" data-user-goal="understand-capabilities">
        <div className="control-panel-intro">
          <span>Available capabilities</span>
          <h2><Terminal /> What agents can do</h2>
          <p>This local service exposes tools for saving, finding, and maintaining memory.</p>
        </div>
        <details className="technical-disclosure">
          <summary>Show operation catalog</summary>
          <ol className="operation-catalog">{props.operations.map((operation) => <li key={operation.id}><strong>{presentStoredText(operation.label)}</strong><span>{presentStoredText(operation.method ?? operation.origin)} {presentStoredText(operation.path ?? operation.target)}</span><small>{presentStoredText(operation.kind)}</small></li>)}</ol>
        </details>
      </section>
    </div>
  );
}
