import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client.js';
import type { ProjectGraphFact, ProjectGraphResponse } from '../api/client.js';
import SafeMarkdown from './SafeMarkdown.js';
import { Network, Folder, Key, AlertCircle } from 'lucide-react';
import { useSuggestions } from '../hooks/useSuggestions.js';

const GRAPH_RELATIONS = [
  'HAS_TYPE',
  'IN_PROJECT',
  'HAS_TOPIC_KEY',
  'HAS_WHAT',
  'HAS_WHY',
  'HAS_WHERE',
  'HAS_LEARNED',
];

function countRelations(facts: ProjectGraphFact[]): Array<[string, number]> {
  const counts = new Map<string, number>();

  for (const fact of facts) {
    counts.set(fact.relation, (counts.get(fact.relation) ?? 0) + 1);
  }

  return Array.from(counts.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function groupFactsBySubject(facts: ProjectGraphFact[]): Array<[string, ProjectGraphFact[]]> {
  const groups = new Map<string, ProjectGraphFact[]>();

  for (const fact of facts) {
    groups.set(fact.subject, [...(groups.get(fact.subject) ?? []), fact]);
  }

  return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function truncateText(value: string, maxLength = 180): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

export default function GraphLiteView() {
  // Parse initial query params from window.location.search
  const getQueryParams = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      project: params.get('project') || '',
      topicKey: params.get('topic_key') || '',
      relation: params.get('relation') || '',
      limit: params.get('limit') ? Number(params.get('limit')) : 100,
      maxChars: params.get('max_chars') ? Number(params.get('max_chars')) : 6000,
    };
  };

  const initialParams = getQueryParams();

  const [project, setProject] = useState(initialParams.project);
  const [topicKey, setTopicKey] = useState(initialParams.topicKey);
  const [relation, setRelation] = useState(initialParams.relation);
  const [limit, setLimit] = useState(initialParams.limit);
  const [maxChars, setMaxChars] = useState(initialParams.maxChars);

  const { projects, topicKeys } = useSuggestions(project);

  const handleProjectChange = (newProject: string) => {
    setProject(newProject);
    setTopicKey('');
  };

  const [data, setData] = useState<ProjectGraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const relationCounts = useMemo(() => countRelations(data?.facts ?? []), [data]);
  const groupedFacts = useMemo(() => groupFactsBySubject(data?.facts ?? []), [data]);

  const increaseResponseSize = () => {
    setMaxChars((current) => Math.min(current * 2, 20000));
  };

  const fetchGraph = async () => {
    if (!project.trim()) {
      setData(null);
      return;
    }

    // Update URL query params for shareability/navigation
    const urlParams = new URLSearchParams();
    urlParams.append('project', project);
    if (topicKey) urlParams.append('topic_key', topicKey);
    if (relation) urlParams.append('relation', relation);
    urlParams.append('limit', String(limit));
    urlParams.append('max_chars', String(maxChars));
    window.history.replaceState(null, '', `/graph?${urlParams.toString()}`);

    try {
      setLoading(true);
      setError(null);
      const res = await api.getProjectGraph(project, {
        topic_key: topicKey || undefined,
        relation: relation || undefined,
        limit,
        max_chars: maxChars,
      });
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch graph data');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (project) {
      fetchGraph();
    }
  }, [project, topicKey, relation, limit, maxChars]);

  return (
    <div>
      <header style={{ marginBottom: '32px' }}>
        <h1>Graph-Lite</h1>
        <p className="subtitle">Explore deterministic semantic facts and relationships in textual/tabular format</p>
      </header>

      {/* Configuration Form */}
      <div className="section-card" style={{ marginBottom: '32px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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
                list="graph-project-suggestions"
              />
              <datalist id="graph-project-suggestions">
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

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Topic Key (Optional)</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-control"
                placeholder="All topic keys"
                value={topicKey}
                onChange={(e) => setTopicKey(e.target.value)}
                style={{ paddingLeft: '36px' }}
                list="graph-topickey-suggestions"
              />
              <datalist id="graph-topickey-suggestions">
                {topicKeys.map((tk) => (
                  <option key={tk} value={tk} />
                ))}
              </datalist>
              <Key
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

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Relation</label>
            <select
              className="form-control"
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
            >
              <option value="">All relations</option>
              {GRAPH_RELATIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Limit (Facts)</label>
            <input
              type="number"
              className="form-control"
              min="1"
              max="500"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Max Response Size</label>
            <input
              type="number"
              className="form-control"
              min="200"
              max="20000"
              value={maxChars}
              onChange={(e) => setMaxChars(Number(e.target.value))}
            />
          </div>
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
          <Network className="empty-state-icon" size={24} />
          <p>Please enter a project name above to explore semantic facts.</p>
        </div>
      )}

      {/* Results */}
      {!loading && data && (
        <>
          <section className="section-card">
            <div className="flex-between" style={{ alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>
                  Semantic Facts in <strong>{project}</strong>
                </h2>
                <p>
                  Showing {data.summary.shown} of {data.summary.total} fact(s)
                  {data.summary.omitted > 0 ? ` — ${data.summary.omitted} omitted by filters or limit` : ''}.
                </p>
              </div>
              <span className={data.summary.truncated ? 'badge badge-warning' : 'badge badge-success'}>
                {data.summary.truncated ? 'truncated' : 'complete'}
              </span>
            </div>

            <div className="grid-stats" style={{ marginBottom: '20px' }}>
              <div className="card-stat">
                <span className="card-stat-label">Shown</span>
                <span className="card-stat-value">{data.summary.shown}</span>
              </div>
              <div className="card-stat">
                <span className="card-stat-label">Total Matching</span>
                <span className="card-stat-value">{data.summary.total}</span>
              </div>
              <div className="card-stat">
                <span className="card-stat-label">Relations</span>
                <span className="card-stat-value">{relationCounts.length}</span>
              </div>
            </div>

            {data.summary.truncated && (
              <div className="privacy-banner" style={{ borderColor: 'var(--warning)', backgroundColor: 'var(--warning-light)' }}>
                <AlertCircle size={18} />
                <div style={{ flex: 1 }}>
                  Response is truncated. Increase the response size or narrow with relation/topic filters.
                </div>
                <button className="btn btn-secondary btn-sm" type="button" onClick={increaseResponseSize} disabled={maxChars >= 20000}>
                  Increase limit
                </button>
              </div>
            )}

            {relationCounts.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                {relationCounts.map(([name, count]) => (
                  <span key={name} className="badge badge-primary">
                    {name} · {count}
                  </span>
                ))}
              </div>
            )}

            {data.facts.length === 0 ? (
              <div className="empty-state">
                <Network className="empty-state-icon" size={24} />
                <p>No semantic facts found matching your criteria.</p>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Relation</th>
                      <th>Object</th>
                      <th>Topic Key</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.facts.map((fact) => (
                      <tr key={fact.id}>
                        <td title={fact.subject}>{truncateText(fact.subject, 80)}</td>
                        <td><span className="badge badge-neutral">{fact.relation}</span></td>
                        <td title={fact.object}>{truncateText(fact.object)}</td>
                        <td>{fact.topic_key ? <code>{fact.topic_key}</code> : <span style={{ color: 'var(--text-dark)' }}>—</span>}</td>
                        <td>{fact.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {groupedFacts.length > 0 && (
            <section className="section-card">
              <h2 style={{ fontSize: '1.25rem' }}>Grouped by Subject</h2>
              <div className="list-items">
                {groupedFacts.map(([subject, facts]) => (
                  <div key={subject} className="list-item" style={{ display: 'block' }}>
                    <div className="flex-between" style={{ marginBottom: '12px', gap: '12px' }}>
                      <div className="list-item-title">{subject}</div>
                      <span className="badge badge-neutral">{facts.length} fact(s)</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {facts.map((fact) => (
                        <div key={fact.id} style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                          <span className="badge badge-primary" style={{ marginRight: '8px' }}>{fact.relation}</span>
                          {fact.object}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="section-card">
            <h2 style={{ fontSize: '1.25rem' }}>Raw Markdown Fallback</h2>
            {data.text ? <SafeMarkdown content={data.text} /> : <p>No markdown fallback returned.</p>}
          </section>
        </>
      )}
    </div>
  );
}
