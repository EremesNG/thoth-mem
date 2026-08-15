import { useEffect, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

import type { ObservatoryScope, SemanticAtlasPageResponse } from '../../api/client.js';
import type { ObservatoryState } from './context-store.js';
import ObservatoryScopeBar from './ObservatoryScopeBar.js';

interface AtlasScopePanelProps {
  scope: ObservatoryScope;
  density: ObservatoryState['density'];
  filters: SemanticAtlasPageResponse['facets'] | null;
  loading: boolean;
  error: string | null;
  onScopeChange: (scope: ObservatoryScope) => void;
  onDensityChange: (density: ObservatoryState['density']) => void;
  onRetry: () => void;
}

function activeScopeCount(scope: ObservatoryScope, density: ObservatoryState['density']): number {
  return [scope.project_token, scope.session_token, scope.topic_token, scope.relation, scope.type].filter(Boolean).length
    + (density === 'balanced' ? 0 : 1);
}

export default function AtlasScopePanel(props: AtlasScopePanelProps) {
  const [open, setOpen] = useState(false);
  const activeCount = activeScopeCount(props.scope, props.density);
  const resourceState = props.error ? 'error' : props.loading ? 'loading' : props.filters ? 'ready' : 'empty';

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <div className="atlas-scope-control" data-open={String(open)} data-resource-state={resourceState}>
      <button
        type="button"
        className="map-icon-button atlas-scope-trigger"
        aria-controls="atlas-scope-panel"
        aria-expanded={open}
        aria-label={activeCount ? `Filters, ${activeCount} active` : 'Filters'}
        title="Shape atlas view"
        onClick={() => setOpen((current) => !current)}
      >
        <SlidersHorizontal size={15} aria-hidden="true" />
        <span>Filters</span>
        {activeCount > 0 && <strong aria-hidden="true">{activeCount}</strong>}
      </button>

      <div id="atlas-scope-panel" className="atlas-scope-popover" data-open={String(open)}>
        {open && (
          <>
            <button type="button" className="atlas-scope-close" aria-label="Close filters" onClick={() => setOpen(false)}>
              <X size={15} aria-hidden="true" />
            </button>
            <ObservatoryScopeBar {...props} />
          </>
        )}
      </div>
    </div>
  );
}
