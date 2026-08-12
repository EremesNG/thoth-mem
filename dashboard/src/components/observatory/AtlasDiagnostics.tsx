import { AlertTriangle, Loader2, Network, X } from 'lucide-react';

interface AtlasDiagnosticsProps {
  mode: 'semantic' | 'loading' | 'raw' | 'refused' | 'error';
  rawEntityCount: number;
  rawRelationshipCount: number;
  rawRichRenderLimit: number;
  error: string | null;
  onOpen: () => void;
  onExit: () => void;
}

export default function AtlasDiagnostics({
  mode,
  rawEntityCount,
  rawRelationshipCount,
  rawRichRenderLimit,
  error,
  onOpen,
  onExit,
}: AtlasDiagnosticsProps) {
  if (mode === 'raw') {
    return (
      <button type="button" className="map-icon-button atlas-diagnostics-trigger active" aria-label="Exit Raw graph diagnostics" onClick={onExit}>
        <X size={15} aria-hidden="true" />
        <span>Exit Raw</span>
      </button>
    );
  }

  return (
    <div className="atlas-diagnostics" data-mode={mode}>
      <button
        type="button"
        className="map-icon-button atlas-diagnostics-trigger"
        aria-label="Open Raw graph diagnostics"
        title="Open the technical heterogeneous graph"
        disabled={mode === 'loading'}
        onClick={onOpen}
      >
        {mode === 'loading' ? <Loader2 className="spin-icon" size={15} /> : <Network size={15} />}
        <span>{mode === 'loading' ? 'Opening Raw…' : 'Raw graph'}</span>
      </button>
      {(mode === 'refused' || mode === 'error') && (
        <div className="atlas-diagnostics-notice" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            <strong>{mode === 'refused' ? 'Raw rich view is too large' : 'Raw diagnostics unavailable'}</strong>
            <small>{mode === 'refused'
              ? `${rawEntityCount.toLocaleString()} graph entities and ${rawRelationshipCount.toLocaleString()} relationships exceed the ${rawRichRenderLimit.toLocaleString()}-entity interactive limit. Use the API or an export for exhaustive inspection.`
              : error ?? 'Retry after the current semantic view is stable.'}</small>
          </span>
          <button type="button" aria-label="Dismiss Raw graph diagnostics" onClick={onExit}><X size={14} /></button>
        </div>
      )}
    </div>
  );
}
