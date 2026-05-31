import { Clock, Forward, NotebookTabs } from 'lucide-react';

import type { ObservatoryTimelineResponse } from '../../api/client.js';
import { formatShortDate } from './observatory-utils.js';

interface TimelineSurfaceProps {
  timeline: ObservatoryTimelineResponse | null;
  focusNodeId: string | null;
  loading: boolean;
  onLoadMore: () => void;
  onPivot: (nodeId: string, target: 'map' | 'ledger' | 'recall') => void;
}

export default function TimelineSurface({ timeline, focusNodeId, loading, onLoadMore, onPivot }: TimelineSurfaceProps) {
  return (
    <section className="observatory-panel timeline-surface" aria-labelledby="timeline-heading" data-testid="timeline-surface">
      <div className="observatory-panel-header">
        <div>
          <span className="observatory-kicker"><Clock size={14} /> Timeline</span>
          <h2 id="timeline-heading">Scoped playback</h2>
        </div>
        <button type="button" className="map-icon-button" onClick={onLoadMore} title="Continue timeline" disabled={loading || !timeline?.continuation}>
          <Forward size={15} />
        </button>
      </div>

      <div className="observatory-timeline-list">
        {(timeline?.events ?? []).slice(0, 8).map((event) => {
          const nodeId = `obs:${event.id}`;
          return (
            <button
              key={event.id}
              type="button"
              className={`observatory-timeline-event ${focusNodeId === nodeId ? 'active' : ''}`}
              onClick={() => onPivot(nodeId, 'ledger')}
            >
              <NotebookTabs size={14} />
              <span>
                <strong>{event.title}</strong>
                <small>{formatShortDate(event.created_at)} / {event.type}</small>
              </span>
            </button>
          );
        })}
        {!timeline?.events.length && <p className="observatory-muted">No events in the current scoped window.</p>}
      </div>
    </section>
  );
}
