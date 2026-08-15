import { RefreshCw, SlidersHorizontal, X } from 'lucide-react';

import type { AtlasFacetOption, ObservatoryScope, SemanticAtlasPageResponse } from '../../api/client.js';
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
  filters: SemanticAtlasPageResponse['facets'] | null;
  loading: boolean;
  error: string | null;
  onScopeChange: (scope: ObservatoryScope) => void;
  onDensityChange: (density: ObservatoryState['density']) => void;
  onRetry: () => void;
}

function hasFilterChoices(filters: SemanticAtlasPageResponse['facets'] | null): boolean {
  return Boolean(filters && (
    filters.projects.length
    || filters.sessions.length
    || filters.topics.length
    || filters.types.length
    || filters.relations.length
  ));
}

export function normalizeScopeForFilters(
  scope: ObservatoryScope,
  filters: SemanticAtlasPageResponse['facets'],
): ObservatoryScope {
  const next = { ...scope };
  if (next.project_token && !filters.projects.some(({ token }) => token === next.project_token)) {
    next.project_token = undefined;
    next.session_token = undefined;
    next.topic_token = undefined;
    next.type = undefined;
    next.relation = undefined;
    return next;
  }
  if (next.session_token && !filters.sessions.some(({ token }) => token === next.session_token)) next.session_token = undefined;
  if (next.topic_token && !filters.topics.some(({ token }) => token === next.topic_token)) next.topic_token = undefined;
  if (next.type && !filters.types.includes(next.type)) next.type = undefined;
  if (next.relation && !filters.relations.includes(next.relation)) next.relation = undefined;
  return next;
}

function facetOptions(values: AtlasFacetOption[]) {
  return values.map(({ token, label, count }) => ({
    value: token,
    label: `${presentStoredText(label)} · ${count}`,
    searchText: presentStoredText(label),
  }));
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
    projects: facetOptions(filters?.projects ?? []),
    sessions: facetOptions(filters?.sessions ?? []),
    topics: facetOptions(filters?.topics ?? []),
    types: buildHumanOptions(filters?.types ?? [], presentObservationType),
    relations: buildHumanOptions(filters?.relations ?? [], presentRelation),
  };
  const applied: Array<[keyof ObservatoryScope, string]> = [];
  if (scope.project_token) applied.push(['project_token', scope.project_token]);
  if (scope.session_token) applied.push(['session_token', scope.session_token]);
  if (scope.topic_token) applied.push(['topic_token', scope.topic_token]);
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
          value={scope.project_token}
          options={options.projects}
          allLabel="All projects"
          emptyMessage="No projects found"
          loading={selectDisabled}
          disabled={selectDisabled}
          onChange={(project_token) => patch({ project_token, session_token: undefined, topic_token: undefined, type: undefined, relation: undefined })}
        />
        <GuidedSelect
          label="Session"
          value={scope.session_token}
          options={options.sessions}
          allLabel="Any session"
          emptyMessage="No sessions found"
          loading={selectDisabled}
          disabled={selectDisabled}
          onChange={(session_token) => patch({ session_token })}
        />
        <GuidedSelect
          label="Topic"
          value={scope.topic_token}
          options={options.topics}
          allLabel="Any topic"
          emptyMessage="No topics found"
          loading={selectDisabled}
          disabled={selectDisabled}
          onChange={(topic_token) => patch({ topic_token })}
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
              {key === 'type'
                ? presentObservationType(value)
                : key === 'relation'
                  ? presentRelation(value)
                  : options[key === 'project_token' ? 'projects' : key === 'session_token' ? 'sessions' : 'topics']
                      .find((option) => option.value === value)?.label ?? 'Selected'}
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
