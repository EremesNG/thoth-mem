import { useState, useEffect } from 'react';
import { api, ProjectTopicKeysResponse } from '../api/client.js';
import SafeMarkdown from './SafeMarkdown.js';
import { triggerToast } from './Layout.js';
import { Key, Folder, Copy, ArrowLeft, AlertCircle, BookOpen } from 'lucide-react';
import { useSuggestions } from '../hooks/useSuggestions.js';

export default function TopicKeyBrowser() {
  // Parse initial query params from window.location.search
  const getQueryParams = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      project: params.get('project') || '',
      topicKey: params.get('topic_key') || '',
      limit: params.get('limit') ? Number(params.get('limit')) : 10,
      maxChars: params.get('max_chars') ? Number(params.get('max_chars')) : 2000,
    };
  };

  const initialParams = getQueryParams();

  const [project, setProject] = useState(initialParams.project);
  const [topicKey, setTopicKey] = useState(initialParams.topicKey);
  const [limit, setLimit] = useState(initialParams.limit);
  const [maxChars, setMaxChars] = useState(initialParams.maxChars);

  const { projects } = useSuggestions();

  const handleProjectChange = (newProject: string) => {
    setProject(newProject);
    setTopicKey('');
  };

  const [data, setData] = useState<ProjectTopicKeysResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch topic keys or exact key context
  const fetchData = async () => {
    if (!project.trim()) {
      setData(null);
      return;
    }

    // Update URL query params for shareability/navigation
    const urlParams = new URLSearchParams();
    urlParams.append('project', project);
    if (topicKey) urlParams.append('topic_key', topicKey);
    urlParams.append('limit', String(limit));
    urlParams.append('max_chars', String(maxChars));
    window.history.replaceState(null, '', `/topic-keys?${urlParams.toString()}`);

    try {
      setLoading(true);
      setError(null);
      const res = await api.getProjectTopicKeys(
        project,
        {
          topic_key: topicKey || undefined,
          limit,
          max_chars: maxChars,
        }
      );
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch topic keys');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // Trigger fetch on mount or when project/topicKey changes
  useEffect(() => {
    if (project) {
      fetchData();
    }
  }, [project, topicKey]);

  const handleCopyContext = () => {
    if (!data || !data.text) return;

    navigator.clipboard.writeText(data.text);
    triggerToast('Copied topic key context to clipboard!');
  };

  const handleSelectTopic = (topic: string) => {
    setTopicKey(topic);
  };

  const handleBackToList = () => {
    setTopicKey('');
  };

  return (
    <div>
      <header style={{ marginBottom: '32px' }}>
        <h1>Topic Key Browser</h1>
        <p className="subtitle">Browse and drill down into stable, evolving topic-key contexts</p>
      </header>

      {/* Configuration Form */}
      <div className="section-card" style={{ marginBottom: '32px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
          }}
        >
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Project Name (Required)</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Enter project name..."
                value={project}
                onChange={(e) => handleProjectChange(e.target.value)}
                style={{ paddingLeft: '36px' }}
                list="project-suggestions"
              />
              <datalist id="project-suggestions">
                {projects.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <Folder
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-dark)',
                }}
              />
            </div>
          </div>

          {topicKey && (
            <>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Limit (Observations)</label>
                <input
                  type="number"
                  className="form-control"
                  min="1"
                  max="100"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Max Characters Per Observation</label>
                <input
                  type="number"
                  className="form-control"
                  min="100"
                  max="50000"
                  value={maxChars}
                  onChange={(e) => setMaxChars(Number(e.target.value))}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="error-container">
          <div className="flex-gap">
            <AlertCircle size={20} />
            <div>
              <strong>Error:</strong> {error}
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
        </div>
      )}

      {/* No Project Selected */}
      {!project && (
        <div className="empty-state">
          <Folder className="empty-state-icon" size={24} />
          <p>Please enter a project name above to browse topic keys.</p>
        </div>
      )}

      {/* Results */}
      {!loading && data && (
        <div>
          {topicKey ? (
            /* Drilldown View */
            <section className="section-card">
              <div
                className="flex-between"
                style={{
                  marginBottom: '20px',
                  borderBottom: '1px solid var(--border-color)',
                  paddingBottom: '16px',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <button onClick={handleBackToList} className="btn btn-secondary btn-sm" style={{ marginBottom: '12px' }}>
                    <ArrowLeft size={14} />
                    Back to Topic List
                  </button>
                  <div className="flex-gap">
                    <Key size={20} style={{ color: 'var(--primary)' }} />
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>
                      Topic Key: <code>{topicKey}</code>
                    </h2>
                  </div>
                </div>

                <button onClick={handleCopyContext} className="btn btn-secondary">
                  <Copy size={16} />
                  Copy Topic Context
                </button>
              </div>

              {data.text ? (
                <SafeMarkdown content={data.text} />
              ) : (
                <div className="empty-state">
                  <BookOpen className="empty-state-icon" size={24} />
                  <p>No content found for this topic key.</p>
                </div>
              )}
            </section>
          ) : (
            /* List View */
            <section className="section-card">
              <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>
                Topic Keys in <strong>{project}</strong>
              </h2>

              {data.topics && data.topics.length === 0 ? (
                <div className="empty-state">
                  <Key className="empty-state-icon" size={24} />
                  <p>No topic keys found for this project.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {data.topics?.map((topic) => (
                    <div
                      key={topic.topic_key}
                      onClick={() => handleSelectTopic(topic.topic_key)}
                      className="list-item"
                      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}
                    >
                      <div className="flex-between" style={{ width: '100%' }}>
                        <div className="flex-gap">
                          <Key size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{topic.topic_key}</span>
                        </div>
                        <span style={{ color: 'var(--primary)', fontSize: '0.85rem', fontWeight: 500 }}>
                          Drill Down &rarr;
                        </span>
                      </div>
                      {topic.title && (
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginLeft: '24px' }}>
                          {topic.title}
                        </div>
                      )}
                      <div className="flex-gap" style={{ fontSize: '0.75rem', color: 'var(--text-dark)', marginLeft: '24px', flexWrap: 'wrap' }}>
                        <span className="badge badge-neutral" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>{topic.type}</span>
                        <span>&bull;</span>
                        <span>{topic.observation_count} {topic.observation_count === 1 ? 'observation' : 'observations'}</span>
                        <span>&bull;</span>
                        <span>Updated {new Date(topic.updated_at).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
