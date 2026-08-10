import type { ReactNode } from 'react';
import { Activity, BookOpen, HeartPulse, Orbit, PanelRightOpen, Route, X } from 'lucide-react';

import type { ObservatorySurface } from './context-store.js';

const tabs: Array<{ id: ObservatorySurface; label: string; icon: typeof Orbit }> = [
  { id: 'map', label: 'Overview', icon: Orbit },
  { id: 'recall', label: 'Related', icon: Route },
  { id: 'timeline', label: 'Story', icon: Activity },
  { id: 'ledger', label: 'Changes', icon: BookOpen },
  { id: 'health', label: 'Health', icon: HeartPulse },
];

interface AtlasDockProps {
  active: ObservatorySurface;
  open: boolean;
  overview: ReactNode;
  instrument: ReactNode;
  onActiveChange: (surface: ObservatorySurface) => void;
  onOpen: () => void;
  onClose: () => void;
}

export default function AtlasDock({
  active,
  open,
  overview,
  instrument,
  onActiveChange,
  onOpen,
  onClose,
}: AtlasDockProps) {
  return (
    <aside className="atlas-dock" data-open={String(open)} aria-label="Memory exploration dock">
      <header className="atlas-dock-header">
        <div>
          <span>Neural Atlas</span>
          <strong>{tabs.find((tab) => tab.id === active)?.label ?? 'Overview'}</strong>
        </div>
        <button
          type="button"
          className="atlas-dock-close"
          onClick={open ? onClose : onOpen}
          aria-label={open ? 'Close memory dock' : 'Open memory dock'}
          aria-expanded={open}
        >
          {open ? <X /> : <PanelRightOpen />}
        </button>
      </header>

      <nav className="observatory-tabs atlas-dock-tabs" aria-label="Ways to explore this memory">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={active === id ? 'active' : ''}
            aria-current={active === id ? 'page' : undefined}
            title={label}
            onClick={() => onActiveChange(id)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {open && (
        <div className="atlas-dock-body" aria-live="polite">
          {active === 'map' ? overview : instrument}
        </div>
      )}
    </aside>
  );
}
