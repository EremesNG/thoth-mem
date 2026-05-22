import React, { useState, useEffect } from 'react';
import { Link, useRouter } from '../router.js';
import { Home, Search, Key, Network, Shield, Check, Database } from 'lucide-react';
import { api } from '../api/client.js';
import { DASHBOARD_VERSION } from '../version.js';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { path } = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [mcpVersion, setMcpVersion] = useState<string>('unknown');

  const showToast = (message: string) => {
    setToast(message);
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Expose toast to window so other components can trigger it
  useEffect(() => {
    (window as any).__showToast = showToast;
    return () => {
      delete (window as any).__showToast;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    api.getMcpVersion(controller.signal)
      .then(setMcpVersion)
      .catch(() => setMcpVersion('unknown'));

    return () => controller.abort();
  }, []);

  const isLinkActive = (to: string) => {
    if (to === '/') {
      return path === '/';
    }
    return path.startsWith(to);
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <Database size={20} />
            Thoth<span>Mem</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <Link
            to="/"
            className={`sidebar-link ${isLinkActive('/') ? 'active' : ''}`}
          >
            <Home size={18} />
            Overview
          </Link>
          <Link
            to="/search"
            className={`sidebar-link ${isLinkActive('/search') ? 'active' : ''}`}
          >
            <Search size={18} />
            Search Explorer
          </Link>
          <Link
            to="/topic-keys"
            className={`sidebar-link ${isLinkActive('/topic-keys') ? 'active' : ''}`}
          >
            <Key size={18} />
            Topic Keys
          </Link>
          <Link
            to="/graph"
            className={`sidebar-link ${isLinkActive('/graph') ? 'active' : ''}`}
          >
            <Network size={18} />
            Graph-Lite
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="flex-gap" style={{ color: 'var(--text-dark)' }}>
            <Shield size={14} />
            <span>Local-First Privacy</span>
          </div>
          <div className="version-stack">
            <span>Dashboard v{DASHBOARD_VERSION}</span>
            <span>MCP v{mcpVersion}</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Privacy Banner */}
        <div className="privacy-banner">
          <Shield size={18} />
          <div>
            <strong>Local-First Memory Bridge:</strong> Your memory data is stored
            locally in SQLite and served directly by your local HTTP bridge. No external
            servers, telemetry, or CDNs are used.
          </div>
        </div>

        {children}
      </main>

      {/* Toast Notification */}
      {toast && (
        <div className="copy-toast">
          <div className="flex-gap">
            <Check size={16} />
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to trigger toast from any component
export function triggerToast(message: string) {
  if ((window as any).__showToast) {
    (window as any).__showToast(message);
  } else {
    console.log('Toast:', message);
  }
}
