import { Filter, RefreshCw, RotateCcw, Search } from 'lucide-react';

import type { VizFiltersResponse } from '../../api/client.js';
import GuidedSelect from '../GuidedSelect.js';
import { presentObservationType, presentRelation } from '../dashboard-presentation.js';
import type { MapFilters } from './map-types.js';
import { DEFAULT_MAP_FILTERS } from './map-state.js';

interface MapFiltersPanelProps {
  filters: MapFilters;
  availableFilters: VizFiltersResponse | null;
  loading: boolean;
  hasContinuation: boolean;
  onChange: (filters: MapFilters) => void;
  onReload: () => void;
  onLoadMore: () => void;
}

const fallbackRelations = [
  'HAS_TYPE',
  'IN_PROJECT',
  'HAS_TOPIC_KEY',
  'HAS_WHAT',
  'HAS_WHY',
  'HAS_WHERE',
  'HAS_LEARNED',
  'SIMILAR_TO',
];

export default function MapFiltersPanel({
  filters,
  availableFilters,
  loading,
  hasContinuation,
  onChange,
  onReload,
  onLoadMore,
}: MapFiltersPanelProps) {
  const patch = (next: Partial<MapFilters>) => onChange({ ...filters, ...next, continuation: null });
  const typeOptions = (availableFilters?.types ?? []).map((value) => ({ value, label: presentObservationType(value) }));
  const relationOptions = (availableFilters?.relations.length ? availableFilters.relations : fallbackRelations)
    .map((value) => ({ value, label: presentRelation(value) }));

  return (
    <aside className="map-filter-rail" aria-label="Map filters">
      <div className="map-panel-heading">
        <Filter size={16} />
        <span>Filters</span>
      </div>

      <label className="map-field">
        <span>Project</span>
        <input
          value={filters.project}
          onChange={(event) => patch({ project: event.target.value, topicKey: '' })}
          list="map-projects"
          placeholder="All projects"
        />
        <datalist id="map-projects">
          {availableFilters?.projects.map((project) => <option key={project} value={project} />)}
        </datalist>
      </label>

      <label className="map-field">
        <span>Session</span>
        <input
          value={filters.sessionId}
          onChange={(event) => patch({ sessionId: event.target.value })}
          list="map-sessions"
          placeholder="Any session"
        />
        <datalist id="map-sessions">
          {availableFilters?.sessions.map((session) => <option key={session} value={session} />)}
        </datalist>
      </label>

      <label className="map-field">
        <span>Topic</span>
        <input
          value={filters.topicKey}
          onChange={(event) => patch({ topicKey: event.target.value })}
          list="map-topics"
          placeholder="Any topic key"
        />
        <datalist id="map-topics">
          {availableFilters?.topic_keys.map((topic) => <option key={topic} value={topic} />)}
        </datalist>
      </label>

      <div className="map-field-grid">
        <GuidedSelect
          label="Type"
          value={filters.type || undefined}
          options={typeOptions}
          allLabel="All types"
          emptyMessage="No memory types found"
          onChange={(value) => patch({ type: (value ?? '') as MapFilters['type'] })}
        />

        <GuidedSelect
          label="Relation"
          value={filters.relation || undefined}
          options={relationOptions}
          allLabel="All connections"
          onChange={(value) => patch({ relation: value ?? '' })}
        />
      </div>

      <label className="map-field">
        <span>Query</span>
        <div className="map-input-icon">
          <Search size={14} />
          <input value={filters.query} onChange={(event) => patch({ query: event.target.value })} placeholder="Search map text" />
        </div>
      </label>

      <div className="map-field-grid">
        <label className="map-field">
          <span>Depth</span>
          <input type="number" min={0} max={4} value={filters.depth} onChange={(event) => patch({ depth: Number(event.target.value) })} />
        </label>
        <label className="map-field">
          <span>Nodes</span>
          <input type="number" min={20} max={500} value={filters.maxNodes} onChange={(event) => patch({ maxNodes: Number(event.target.value) })} />
        </label>
        <label className="map-field">
          <span>Edges</span>
          <input type="number" min={20} max={2000} value={filters.maxEdges} onChange={(event) => patch({ maxEdges: Number(event.target.value) })} />
        </label>
      </div>

      <div className="map-filter-actions">
        <button type="button" className="map-icon-button" onClick={onReload} title="Reload map" disabled={loading}>
          <RefreshCw size={16} />
        </button>
        <button type="button" className="map-icon-button" onClick={() => onChange(DEFAULT_MAP_FILTERS)} title="Reset filters">
          <RotateCcw size={16} />
        </button>
        <button type="button" className="map-load-button" onClick={onLoadMore} disabled={!hasContinuation || loading}>
          Load more
        </button>
      </div>
    </aside>
  );
}
