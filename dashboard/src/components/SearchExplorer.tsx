import { useState, useEffect } from 'react';
import { api, SearchResultItem, ObservationType, ObservationScope } from '../api/client.js';
import { Link } from '../router.js';
import { Search, AlertCircle, BookOpen } from 'lucide-react';
import { useSuggestions } from '../hooks/useSuggestions.js';

const OBSERVATION_TYPES: ObservationType[] = [
  'decision',
  'architecture',
  'bugfix',
  'pattern',
  'config',
  'discovery',
  'learning',
  'session_summary',
  'manual',
];

export default function SearchExplorer() {
  // Parse initial query params from window.location.search
  const getQueryParams = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      query: params.get('query') || '',
      project: params.get('project') || '',
      type: (params.get('type') as ObservationType) || '',
      scope: (params.get('scope') as ObservationScope) || '',
      topic_key_exact: params.get('topic_key_exact') || '',
      mode: (params.get('mode') as 'compact' | 'preview') || 'preview',
      limit: params.get('limit') ? Number(params.get('limit')) : 50,
    };
  };

  const initialParams = getQueryParams();

  const [query, setQuery] = useState(initialParams.query);
  const [project, setProject] = useState(initialParams.project);
  const [type, setType] = useState<ObservationType | ''>(initialParams.type);
  const [scope, setScope] = useState<ObservationScope | ''>(initialParams.scope);
  const [topicKeyExact, setTopicKeyExact] = useState(initialParams.topic_key_exact);
  const [mode, setMode] = useState<'compact' | 'preview'>(initialParams.mode);
  const [limit, setLimit] = useState(initialParams.limit);

  const { projects, topicKeys } = useSuggestions(project);

  const handleProjectChange = (newProject: string) => {
    setProject(newProject);
    setTopicKeyExact('');
  };

  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Run search when form is submitted or on initial load if query is present
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    // Update URL query params for shareability/navigation
    const urlParams = new URLSearchParams();
    urlParams.append('query', query);
    if (project) urlParams.append('project', project);
    if (type) urlParams.append('type', type);
    if (scope) urlParams.append('scope', scope);
    if (topicKeyExact) urlParams.append('topic_key_exact', topicKeyExact);
    urlParams.append('mode', mode);
    urlParams.append('limit', String(limit));
    window.history.replaceState(null, '', `/search?${urlParams.toString()}`);

    try {
      setLoading(true);
      setError(null);
      const res = await api.searchObservations({
        query,
        project: project || undefined,
        type: type || undefined,
        scope: scope || undefined,
        topic_key_exact: topicKeyExact || undefined,
        mode,
        limit,
      });
      setResults(res.results);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'Search failed');
      setResults([]);
      setTotal(null);
    } finally {
      setLoading(false);
    }
  };

  // Trigger search on mount if query is pre-filled
  useEffect(() => {
    if (initialParams.query) {
      handleSearch();
    }
  }, []);

  return (
    <div>
      <header style={{ marginBottom: '32px' }}>
        <h1>Search Explorer</h1>
        <p className="subtitle">Search and filter observations using full-text search</p>
      </header>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="section-card" style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Search memories (e.g., JWT auth, SQLite, bugfix)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ paddingLeft: '40px' }}
            />
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-dark)',
              }}
            />
          </div>
          <button type="submit" className="btn" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Filters Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            borderTop: '1px solid var(--border-color)',
            paddingTop: '20px',
          }}
        >
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Project</label>
            <input
              type="text"
              className="form-control"
              placeholder="All projects"
              value={project}
              onChange={(e) => handleProjectChange(e.target.value)}
              list="search-project-suggestions"
            />
            <datalist id="search-project-suggestions">
              {projects.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Type</label>
            <select
              className="form-control"
              value={type}
              onChange={(e) => setType(e.target.value as ObservationType | '')}
            >
              <option value="">All types</option>
              {OBSERVATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Scope</label>
            <select
              className="form-control"
              value={scope}
              onChange={(e) => setScope(e.target.value as ObservationScope | '')}
            >
              <option value="">All scopes</option>
              <option value="project">Project</option>
              <option value="personal">Personal</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Topic Key (Exact)</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g., architecture/auth"
              value={topicKeyExact}
              onChange={(e) => setTopicKeyExact(e.target.value)}
              list="search-topickey-suggestions"
            />
            <datalist id="search-topickey-suggestions">
              {topicKeys.map((tk) => (
                <option key={tk} value={tk} />
              ))}
            </datalist>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Display Mode</label>
            <select
              className="form-control"
              value={mode}
              onChange={(e) => setMode(e.target.value as 'compact' | 'preview')}
            >
              <option value="preview">Preview (with snippets)</option>
              <option value="compact">Compact (list only)</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Limit</label>
            <input
              type="number"
              className="form-control"
              min="1"
              max="200"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </div>
        </div>
      </form>

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

      {/* Results */}
      {!loading && total !== null && (
        <div>
          <div style={{ marginBottom: '16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Found <strong>{total}</strong> results
          </div>

          {results.length === 0 ? (
            <div className="empty-state">
              <BookOpen className="empty-state-icon" size={24} />
              <p>No observations matched your search criteria.</p>
            </div>
          ) : (
            <div className="list-items">
              {results.map((result) => (
                <Link key={result.id} to={`/memory/${result.id}`} className="list-item" style={{ display: 'block' }}>
                  <div className="flex-between" style={{ marginBottom: '8px' }}>
                    <div className="list-item-title" style={{ margin: 0 }}>{result.title}</div>
                    <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>{result.type}</span>
                  </div>

                  {mode === 'preview' && result.preview && (
                    <p
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--text-muted)',
                        backgroundColor: 'rgba(0,0,0,0.15)',
                        padding: '8px 12px',
                        borderRadius: '4px',
                        marginBottom: '12px',
                        fontFamily: 'var(--font-mono)',
                        borderLeft: '2px solid var(--primary)',
                      }}
                    >
                      {result.preview}
                    </p>
                  )}

                  <div className="list-item-meta">
                    {result.project && (
                      <span>
                        Project: <strong>{result.project}</strong>
                      </span>
                    )}
                    {result.scope && (
                      <span>
                        Scope: <strong>{result.scope}</strong>
                      </span>
                    )}
                    {result.topic_key && (
                      <span>
                        Topic Key: <code>{result.topic_key}</code>
                      </span>
                    )}
                    <span>Created: {new Date(result.created_at).toLocaleString()}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
