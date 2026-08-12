import type { ResourcePhase } from './resource-state.js';
import { presentResourceState } from '../dashboard-presentation.js';
import type { FullAtlasLoadPhase } from './full-atlas-loader.js';
import type { AtlasLevel } from '../../api/client.js';
import type { SemanticAtlasLoadPhase } from './semantic-atlas-loader.js';

const actions: Partial<Record<ResourcePhase, string>> = {
  empty: 'Widen the view',
  sparse: 'Look again',
  dense: 'Refresh memories',
  truncated: 'Refresh progress',
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

const atlasStates: Record<FullAtlasLoadPhase, { label: string; explanation: string }> = {
  initial: {
    label: 'Loading full atlas',
    explanation: 'Gathering the first memories in this view.',
  },
  streaming: {
    label: 'Loading full atlas',
    explanation: 'The constellation stays interactive while more memories arrive.',
  },
  restarting: {
    label: 'Memory changed while loading',
    explanation: 'Restarting from one coherent snapshot.',
  },
  complete: {
    label: 'Complete atlas',
    explanation: 'Every memory and connection in this view is now present.',
  },
  'partial-error': {
    label: 'Atlas loading paused',
    explanation: 'Loaded memories remain available. Retry when you are ready.',
  },
};

export function FullAtlasStateNotice({
  phase,
  onRetry,
}: {
  phase: FullAtlasLoadPhase;
  onRetry?: () => void;
}) {
  const state = atlasStates[phase];
  return <div
    className={`resource-state-notice atlas-${phase}`}
    data-resource-notice={phase}
    role={phase === 'partial-error' ? 'alert' : 'status'}
  >
    <span><strong>{state.label}</strong><small>{state.explanation}</small></span>
    {phase === 'partial-error' && onRetry && (
      <button type="button" onClick={onRetry} aria-label="Retry full atlas">Retry</button>
    )}
  </div>;
}

const semanticAtlasStates: Record<SemanticAtlasLoadPhase, { label: string; explanation: string }> = {
  initial: {
    label: 'Mapping the memory universe',
    explanation: 'Preparing a bounded semantic view of every memory in scope.',
  },
  streaming: {
    label: 'Revealing this region',
    explanation: 'This level stays interactive while its remaining members arrive.',
  },
  restarting: {
    label: 'Memory changed while mapping',
    explanation: 'Restarting from one coherent semantic snapshot.',
  },
  complete: {
    label: 'Semantic view ready',
    explanation: 'Every member assigned to this level is represented.',
  },
  recovery: {
    label: 'This constellation moved',
    explanation: 'Returning to its current parent so you can continue exploring.',
  },
  'partial-error': {
    label: 'Semantic mapping paused',
    explanation: 'Available members remain usable. Retry to continue this level.',
  },
};

export function SemanticAtlasStateNotice({
  phase,
  level,
  onRetry,
}: {
  phase: SemanticAtlasLoadPhase;
  level: AtlasLevel;
  onRetry?: () => void;
}) {
  const state = semanticAtlasStates[phase];
  return <div
    className={`resource-state-notice atlas-${phase}`}
    data-resource-notice={phase}
    data-atlas-level={level}
    role={phase === 'partial-error' ? 'alert' : 'status'}
  >
    <span><strong>{state.label}</strong><small>{state.explanation}</small></span>
    {phase === 'partial-error' && onRetry && (
      <button type="button" onClick={onRetry} aria-label={`Retry ${level} atlas`}>Retry</button>
    )}
  </div>;
}
