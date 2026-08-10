import { RefreshCw, SlidersHorizontal, X } from 'lucide-react';

import type { ObservatoryScope, VizFiltersResponse } from '../../api/client.js';
import GuidedSelect from '../GuidedSelect.js';
import { buildHumanOptions, presentDensity, presentFilterKey, presentObservationType, presentRelation } from '../dashboard-presentation.js';
import { presentStoredText } from '../safe-presentation.js';
import type { ObservatoryState } from './context-store.js';

const densityOptions = [
  { value: 'focus', label: 'Close — nearby memories', searchText: 'focus near' },
  { value: 'balanced', label: 'Balanced', searchText: 'default' },
  { value: 'wide', label: 'Wide — more context', searchText: 'far broad' },
];

interface ObservatoryScopeBarProps {
  scope: ObservatoryScope;
  density: ObservatoryState['density'];
  filters: VizFiltersResponse | null;
  loading: boolean;
  error: string | null;
  onScopeChange: (scope: ObservatoryScope) => void;
  onDensityChange: (density: ObservatoryState['density']) => void;
  onRetry: () => void;
}

function hasFilterChoices(filters: VizFiltersResponse | null): boolean {
  return Boolean(filters && (
    filters.projects.length
    || filters.sessions.length
    || filters.topic_keys.length
    || filters.types.length
    || filters.relations.length
  ));
}

export function normalizeScopeForFilters(scope: ObservatoryScope, filters: VizFiltersResponse): ObservatoryScope {
  const next = { ...scope };
  if (next.project && !filters.projects.includes(next.project)) {
    next.project = undefined;
    next.session_id = undefined;
    next.topic_key = undefined;
    next.type = undefined;
    next.relation = undefined;
    return next;
  }
  if (next.session_id && !filters.sessions.includes(next.session_id)) next.session_id = undefined;
  if (next.topic_key && !filters.topic_keys.includes(next.topic_key)) next.topic_key = undefined;
  if (next.type && !filters.types.includes(next.type)) next.type = undefined;
  if (next.relation && !filters.relations.includes(next.relation)) next.relation = undefined;
  return next;
}

export default function ObservatoryScopeBar({
  scope,
  density,
  filters,
  loading,
  error,
  onScopeChange,
  onDensityChange,
  onRetry,
}: ObservatoryScopeBarProps) {
  const resourceState = error ? 'error' : loading ? 'loading' : hasFilterChoices(filters) ? 'ready' : 'empty';
  const patch = (next: ObservatoryScope) => onScopeChange(next);
  const selectDisabled = loading && !filters;
  const options = {
    projects: buildHumanOptions(filters?.projects ?? [], (value) => value),
    sessions: buildHumanOptions(filters?.sessions ?? [], (value) => value),
    topics: buildHumanOptions(filters?.topic_keys ?? [], (value) => value),
    types: buildHumanOptions(filters?.types ?? [], presentObservationType),
    relations: buildHumanOptions(filters?.relations ?? [], presentRelation),
  };
  const applied: Array<[keyof ObservatoryScope, string]> = [];
  if (scope.project) applied.push(['project', scope.project]);
  if (scope.session_id) applied.push(['session_id', scope.session_id]);
  if (scope.topic_key) applied.push(['topic_key', scope.topic_key]);
  if (scope.type) applied.push(['type', scope.type]);
  if (scope.relation) applied.push(['relation', scope.relation]);

  return (
    <section className="guided-scope-bar" aria-label="Shape the memory view" data-resource-state={resourceState}>
      <div className="guided-scope-heading">
        <div>
          <span className="guided-scope-kicker"><SlidersHorizontal size={14} /> Shape this view</span>
          <p>Choose known values to narrow the constellation without typing internal identifiers.</p>
        </div>
        <div className="guided-scope-resource" aria-live="polite">
          <span>
            {error
              ? 'Could not load filter choices.'
              : loading
                ? 'Loading filter choices…'
                : resourceState === 'empty'
                  ? 'No saved filter choices yet.'
                  : 'Choices are up to date.'}
          </span>
          <button type="button" onClick={onRetry} disabled={loading}>
            <RefreshCw size={13} aria-hidden="true" />
            {error ? 'Retry' : 'Refresh choices'}
          </button>
        </div>
      </div>

      <div className="guided-scope-fields">
        <GuidedSelect
          label="Project"
          value={scope.project}
          options={options.projects}
          allLabel="All projects"
          emptyMessage="No projects found"
          loading={selectDisabled}
          disabled={selectDisabled}
          onChange={(project) => patch({ project, session_id: undefined, topic_key: undefined, type: undefined, relation: undefined })}
        />
        <GuidedSelect
          label="Session"
          value={scope.session_id}
          options={options.sessions}
          allLabel="Any session"
          emptyMessage="No sessions found"
          loading={selectDisabled}
          disabled={selectDisabled}
          onChange={(session_id) => patch({ session_id })}
        />
        <GuidedSelect
          label="Topic"
          value={scope.topic_key}
          options={options.topics}
          allLabel="Any topic"
          emptyMessage="No topics found"
          loading={selectDisabled}
          disabled={selectDisabled}
          onChange={(topic_key) => patch({ topic_key })}
        />
        <GuidedSelect
          label="Connection"
          value={scope.relation}
          options={options.relations}
          allLabel="Any connection"
          emptyMessage="No connections found"
          loading={selectDisabled}
          disabled={selectDisabled}
          onChange={(relation) => patch({ relation })}
        />
        <GuidedSelect
          label="Memory type"
          value={scope.type}
          options={options.types}
          allLabel="Every type"
          emptyMessage="No memory types found"
          loading={selectDisabled}
          disabled={selectDisabled}
          onChange={(type) => patch({ type: type as ObservatoryScope['type'] })}
        />
        <GuidedSelect
          label="Field of view"
          value={density}
          options={densityOptions}
          clearable={false}
          onChange={(value) => {
            if (value) onDensityChange(value as ObservatoryState['density']);
          }}
        />
      </div>

      {(applied.length > 0 || density !== 'balanced') && (
        <div className="guided-filter-summary" aria-label="Active filters">
          <span>Showing</span>
          {applied.map(([key, value]) => (
            <button key={key} type="button" onClick={() => patch({ [key]: undefined })} aria-label={`Clear ${presentFilterKey(key)}`}>
              <strong>{presentFilterKey(key)}</strong>
              {key === 'type' ? presentObservationType(value) : key === 'relation' ? presentRelation(value) : presentStoredText(value)}
              <X size={12} aria-hidden="true" />
            </button>
          ))}
          {density !== 'balanced' && (
            <button type="button" onClick={() => onDensityChange('balanced')} aria-label="Reset field of view">
              <strong>View</strong>{presentDensity(density)}<X size={12} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
