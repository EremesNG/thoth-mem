import { useState, useEffect } from 'react';
import { api, ContextResponse } from '../api/client.js';
import { Link } from '../router.js';
import { Folder, Clock, BookOpen, MessageSquare, AlertCircle } from 'lucide-react';

export default function Overview() {
  const [data, setData] = useState<ContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const res = await api.getContext({}, controller.signal);
        setData(res);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to load overview data');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    return () => controller.abort();
  }, []);

  if (loading) {
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

  if (!data) return null;

  const { stats, sessions, observations, prompts } = data;

  return (
    <div>
      <header style={{ marginBottom: '32px' }}>
        <h1>Memory Dashboard</h1>
        <p className="subtitle">Explore and audit your AI agent's persistent memory</p>
      </header>

      {/* Stats Grid */}
      <div className="grid-stats">
        <div className="card-stat">
          <div className="card-stat-label">Total Projects</div>
          <div className="card-stat-value">{stats.projects.length}</div>
        </div>
        <div className="card-stat">
          <div className="card-stat-label">Total Sessions</div>
          <div className="card-stat-value">{stats.sessions}</div>
        </div>
        <div className="card-stat">
          <div className="card-stat-label">Total Observations</div>
          <div className="card-stat-value">{stats.observations}</div>
        </div>
        <div className="card-stat">
          <div className="card-stat-label">Total Prompts</div>
          <div className="card-stat-value">{stats.prompts}</div>
        </div>
      </div>

      <div className="grid-sections">
        {/* Left Column: Recent Activity */}
        <div>
          {/* Recent Sessions */}
          <section className="section-card">
            <div className="flex-between" style={{ marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Recent Sessions</h2>
              <span className="badge badge-neutral">{sessions.length} active</span>
            </div>

            {sessions.length === 0 ? (
              <div className="empty-state">
                <Clock className="empty-state-icon" size={24} />
                <p>No recent sessions found</p>
              </div>
            ) : (
              <div className="list-items">
                {sessions.map((session) => (
                  <div key={session.id} className="list-item" style={{ cursor: 'default' }}>
                    <div>
                      <div className="list-item-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--primary)' }}>
                          {session.id.slice(0, 12)}...
                        </span>
                        {session.ended_at ? (
                          <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>Completed</span>
                        ) : (
                          <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Active</span>
                        )}
                      </div>
                      <div className="list-item-meta">
                        <span>Project: <strong>{session.project}</strong></span>
                        <span>Started: {new Date(session.started_at).toLocaleString()}</span>
                      </div>
                      {session.summary && (
                        <p style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {session.summary}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent Observations */}
          <section className="section-card">
            <div className="flex-between" style={{ marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Recent Observations</h2>
              <span className="badge badge-neutral">{observations.length} total</span>
            </div>

            {observations.length === 0 ? (
              <div className="empty-state">
                <BookOpen className="empty-state-icon" size={24} />
                <p>No observations recorded yet</p>
              </div>
            ) : (
              <div className="list-items">
                {observations.map((obs) => (
                  <Link key={obs.id} to={`/memory/${obs.id}`} className="list-item">
                    <div>
                      <div className="list-item-title">{obs.title}</div>
                      <div className="list-item-meta">
                        <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>{obs.type}</span>
                        {obs.project && <span>Project: <strong>{obs.project}</strong></span>}
                        <span>Created: {new Date(obs.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span style={{ color: 'var(--primary)', fontSize: '0.85rem', fontWeight: 500 }}>View &rarr;</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Recent Prompts */}
          <section className="section-card">
            <div className="flex-between" style={{ marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Recent User Prompts</h2>
              <span className="badge badge-neutral">{prompts.length} total</span>
            </div>

            {prompts.length === 0 ? (
              <div className="empty-state">
                <MessageSquare className="empty-state-icon" size={24} />
                <p>No user prompts recorded yet</p>
              </div>
            ) : (
              <div className="list-items">
                {prompts.map((prompt) => (
                  <div key={prompt.id} className="list-item" style={{ cursor: 'default', display: 'block' }}>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap', marginBottom: '8px' }}>
                      {prompt.content.length > 300 ? `${prompt.content.slice(0, 300)}...` : prompt.content}
                    </p>
                    <div className="list-item-meta">
                      {prompt.project && <span>Project: <strong>{prompt.project}</strong></span>}
                      <span>Recorded: {new Date(prompt.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Projects List */}
        <div>
          <section className="section-card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Projects</h2>
            {stats.projects.length === 0 ? (
              <div className="empty-state">
                <Folder className="empty-state-icon" size={24} />
                <p>No projects found</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {stats.projects.map((project) => (
                  <Link
                    key={project}
                    to={`/projects/${encodeURIComponent(project)}`}
                    className="list-item"
                    style={{ padding: '12px 16px' }}
                  >
                    <div className="flex-gap">
                      <Folder size={16} style={{ color: 'var(--primary)' }} />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{project}</span>
                    </div>
                    <span style={{ color: 'var(--text-dark)', fontSize: '0.85rem' }}>&rarr;</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
