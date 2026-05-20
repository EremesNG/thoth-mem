import { useState, useEffect } from 'react';
import { api, ObservationDetailResponse, TimelineResponse } from '../api/client.js';
import { Link } from '../router.js';
import SafeMarkdown from './SafeMarkdown.js';
import { triggerToast } from './Layout.js';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Copy,
  Folder,
  Key,
  Layers,
  Shield,
  AlertCircle,
} from 'lucide-react';

interface ObservationDetailProps {
  params: {
    id: string;
  };
}

export default function ObservationDetail({ params }: ObservationDetailProps) {
  const id = Number(params.id);
  const [observation, setObservation] = useState<ObservationDetailResponse | null>(null);
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination state for large content
  const [offset, setOffset] = useState(0);
  const [maxLength] = useState(50000);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchDetails() {
      try {
        setLoading(true);
        setError(null);

        // Fetch observation details
        const obsRes = await api.getObservation(id, { offset, max_length: maxLength }, controller.signal);
        setObservation(obsRes);

        // Fetch timeline context
        const timelineRes = await api.getTimeline({ observation_id: id, before: 5, after: 5 }, controller.signal);
        setTimeline(timelineRes);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to load observation details');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchDetails();
    return () => controller.abort();
  }, [id, offset, maxLength]);

  const handleCopyContext = () => {
    if (!observation) return;

    const formattedContext = [
      `Memory Title: ${observation.title}`,
      `Type: ${observation.type}`,
      observation.project ? `Project: ${observation.project}` : null,
      observation.topic_key ? `Topic Key: ${observation.topic_key}` : null,
      `Content:`,
      `---`,
      observation.content,
      `---`,
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(formattedContext);
    triggerToast('Copied memory context to clipboard!');
  };

  const handleLoadMore = () => {
    if (observation?.pagination?.next_offset !== undefined) {
      setOffset(observation.pagination.next_offset);
    }
  };

  const handleResetOffset = () => {
    setOffset(0);
  };

  if (loading && !observation) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="flex-gap">
          <AlertCircle size={20} />
          <div>
            <strong>Error:</strong> {error}
          </div>
        </div>
      </div>
    );
  }

  if (!observation) return null;

  const isPaginated = observation.pagination !== undefined;

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <Link to="/search" className="btn btn-secondary btn-sm">
          <ArrowLeft size={14} />
          Back to Search
        </Link>
      </div>

      <div className="grid-sections">
        {/* Left Column: Observation Content & Metadata */}
        <div>
          <article className="section-card">
            {/* Header */}
            <header style={{ marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '20px' }}>
              <div className="flex-between" style={{ marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <span className="badge badge-primary">{observation.type}</span>
                <div className="flex-gap">
                  {observation.scope === 'personal' ? (
                    <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Shield size={12} /> Personal Scope
                    </span>
                  ) : (
                    <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Shield size={12} /> Project Scope
                    </span>
                  )}
                  {observation.revision_count > 1 && (
                    <span className="badge badge-neutral" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Layers size={12} /> Rev {observation.revision_count}
                    </span>
                  )}
                </div>
              </div>

              <h1 style={{ fontSize: '1.75rem', marginBottom: '16px' }}>{observation.title}</h1>

              {/* Metadata Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                }}
              >
                {observation.project && (
                  <div className="flex-gap">
                    <Folder size={14} style={{ color: 'var(--text-dark)' }} />
                    <span>
                      Project: <Link to={`/projects/${encodeURIComponent(observation.project)}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>{observation.project}</Link>
                    </span>
                  </div>
                )}
                {observation.topic_key && (
                  <div className="flex-gap">
                    <Key size={14} style={{ color: 'var(--text-dark)' }} />
                    <span>
                      Topic Key: <code>{observation.topic_key}</code>
                    </span>
                  </div>
                )}
                <div className="flex-gap">
                  <Calendar size={14} style={{ color: 'var(--text-dark)' }} />
                  <span>Created: {new Date(observation.created_at).toLocaleString()}</span>
                </div>
                <div className="flex-gap">
                  <Clock size={14} style={{ color: 'var(--text-dark)' }} />
                  <span>Updated: {new Date(observation.updated_at).toLocaleString()}</span>
                </div>
              </div>
            </header>

            {/* Content Body */}
            <div style={{ marginBottom: '24px' }}>
              <SafeMarkdown content={observation.content} />
            </div>

            {/* Pagination Controls */}
            {isPaginated && observation.pagination && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  marginBottom: '24px',
                  fontSize: '0.85rem',
                }}
              >
                <span>
                  Showing characters {observation.pagination.returned_from} -{' '}
                  {observation.pagination.returned_to} of {observation.pagination.total_length}
                </span>
                <div className="flex-gap">
                  {offset > 0 && (
                    <button onClick={handleResetOffset} className="btn btn-secondary btn-sm">
                      Reset to Start
                    </button>
                  )}
                  {observation.pagination.has_more && (
                    <button onClick={handleLoadMore} className="btn btn-sm">
                      Load Next {maxLength} Chars
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', display: 'flex', gap: '12px' }}>
              <button onClick={handleCopyContext} className="btn btn-secondary">
                <Copy size={16} />
                Copy Agent Context
              </button>
            </div>
          </article>
        </div>

        {/* Right Column: Chronological Timeline */}
        <div>
          <section className="section-card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Chronological Timeline</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Adjacent observations recorded in the same session
            </p>

            {!timeline || (!timeline.before.length && !timeline.after.length) ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <Clock className="empty-state-icon" size={20} />
                <p style={{ fontSize: '0.85rem' }}>No adjacent timeline events found</p>
              </div>
            ) : (
              <div className="timeline-container">
                {/* Before nodes */}
                {timeline.before.map((node) => (
                  <div key={node.id} className="timeline-node">
                    <div className="timeline-dot"></div>
                    <Link to={`/memory/${node.id}`} className="timeline-card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                      <div className="flex-between" style={{ marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{node.title}</span>
                        <span className="badge badge-neutral" style={{ fontSize: '0.6rem', padding: '2px 4px' }}>{node.type}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dark)' }}>
                        {new Date(node.created_at).toLocaleTimeString()}
                      </div>
                    </Link>
                  </div>
                ))}

                {/* Focus node */}
                <div className="timeline-node focus">
                  <div className="timeline-dot"></div>
                  <div className="timeline-card">
                    <div className="flex-between" style={{ marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary)' }}>
                        {observation.title} (Current)
                      </span>
                      <span className="badge badge-primary" style={{ fontSize: '0.6rem', padding: '2px 4px' }}>{observation.type}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dark)' }}>
                      {new Date(observation.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                {/* After nodes */}
                {timeline.after.map((node) => (
                  <div key={node.id} className="timeline-node">
                    <div className="timeline-dot"></div>
                    <Link to={`/memory/${node.id}`} className="timeline-card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                      <div className="flex-between" style={{ marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{node.title}</span>
                        <span className="badge badge-neutral" style={{ fontSize: '0.6rem', padding: '2px 4px' }}>{node.type}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dark)' }}>
                        {new Date(node.created_at).toLocaleTimeString()}
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
