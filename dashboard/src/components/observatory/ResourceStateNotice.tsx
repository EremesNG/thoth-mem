import type { ResourcePhase } from './resource-state.js';
import { presentResourceState } from '../dashboard-presentation.js';

const actions: Partial<Record<ResourcePhase, string>> = {
  empty: 'Widen the view',
  sparse: 'Look again',
  dense: 'Refresh memories',
  truncated: 'Reveal more',
  exhausted: 'Start a new trail',
  degraded: 'Check again',
  aborted: 'Try again',
  'failed-inspection': 'Try details again',
  retry: 'Try again',
  error: 'Try again',
};

export default function ResourceStateNotice({ phase, onAction }: { phase: ResourcePhase; onAction?: () => void }) {
  const state = presentResourceState(phase);
  const action = actions[phase];
  return <div className={`resource-state-notice ${phase}`} data-resource-notice={phase} role={phase === 'error' || phase === 'failed-inspection' ? 'alert' : 'status'}>
    <span><strong>{state.label}</strong><small>{state.explanation}</small></span>
    {action && onAction && <button type="button" onClick={onAction}>{action}</button>}
  </div>;
}
