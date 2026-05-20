import { useState, useEffect } from 'react';
import { api, ProjectSummaryResponse } from '../api/client.js';
import { Link } from '../router.js';
import SafeMarkdown from './SafeMarkdown.js';
import { Folder, Search, Key, Network, ArrowLeft, AlertCircle } from 'lucide-react';

interface ProjectDetailProps {
  params: {
    project: string;
  };
}

export default function ProjectDetail({ params }: ProjectDetailProps) {
  const { project } = params;
  const [data, setData] = useState<ProjectSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchSummary() {
      try {
        setLoading(true);
        setError(null);
        const res = await api.getProjectSummary(project, {}, controller.signal);
        setData(res);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to load project summary');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchSummary();
    return () => controller.abort();
  }, [project]);

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

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <Link to="/" className="btn btn-secondary btn-sm">
          <ArrowLeft size={14} />
          Back to Overview
        </Link>
      </div>

      <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div className="flex-gap" style={{ marginBottom: '8px' }}>
            <Folder size={28} style={{ color: 'var(--primary)' }} />
            <h1 style={{ margin: 0 }}>{project}</h1>
          </div>
          <p className="subtitle" style={{ margin: 0 }}>Project-specific memory summary and views</p>
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link to={`/search?project=${encodeURIComponent(project)}`} className="btn btn-secondary btn-sm">
            <Search size={14} />
            Search Project
          </Link>
          <Link to={`/topic-keys?project=${encodeURIComponent(project)}`} className="btn btn-secondary btn-sm">
            <Key size={14} />
            Topic Keys
          </Link>
          <Link to={`/graph?project=${encodeURIComponent(project)}`} className="btn btn-secondary btn-sm">
            <Network size={14} />
            Graph-Lite
          </Link>
        </div>
      </header>

      {/* Project Summary Content */}
      <section className="section-card">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '20px' }}>Project Summary</h2>
        {data && data.text ? (
          <SafeMarkdown content={data.text} />
        ) : (
          <div className="empty-state">
            <Folder className="empty-state-icon" size={24} />
            <p>No summary text available for this project.</p>
          </div>
        )}
      </section>
    </div>
  );
}
