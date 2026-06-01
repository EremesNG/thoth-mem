import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Cpu,
  Database,
  Eye,
  Gauge,
  GitBranch,
  Layers,
  Network,
  Play,
  RefreshCw,
  Route,
  Save,
  Search,
  Server,
  ShieldCheck,
  Terminal,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from './router.js';
import {
  api,
  type IndexStatusResponse,
  type ObservationType,
  type OperationCatalogEntry,
  type OperationTrace,
  type OperationTraceOrigin,
  type OperationTraceStatus,
  type ObservatoryLane,
  type ObservatoryRecallResponse,
  type SearchResponse,
  type Stats,
  type VersionResponse,
  type VizSliceResponse,
} from './api/client.js';

type Workspace = 'retrieval' | 'operations' | 'traces' | 'indexing' | 'graph';
type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'live';

interface CommandResult {
  title: string;
  payload: unknown;
}

interface CreateObservationResult {
  id: number;
  action: string;
  revision: number;
}

const WORKSPACES: Array<{ id: Workspace; path: string; label: string; icon: LucideIcon }> = [
  { id: 'retrieval', path: '/', label: 'Retrieval', icon: Brain },
  { id: 'operations', path: '/console/operations', label: 'Operations', icon: Terminal },
  { id: 'traces', path: '/console/traces', label: 'Traces', icon: Activity },
  { id: 'indexing', path: '/console/indexing', label: 'Indexing', icon: Gauge },
  { id: 'graph', path: '/console/graph', label: 'Graph', icon: Network },
];

const LANES: Array<{ id: ObservatoryLane; label: string; icon: LucideIcon }> = [
  { id: 'lexical', label: 'Lexical FTS', icon: Search },
  { id: 'sentence-vector', label: 'Sentence Vector', icon: Zap },
  { id: 'chunk-vector', label: 'Chunk Vector', icon: Layers },
  { id: 'fact-kg', label: 'Knowledge Graph', icon: GitBranch },
];

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

function workspaceFromPath(path: string): Workspace {
  if (path === '/console/operations') return 'operations';
  if (path === '/console/traces') return 'traces';
  if (path === '/console/indexing') return 'indexing';
  if (path === '/console/graph') return 'graph';
  return 'retrieval';
}

function pathForWorkspace(workspace: Workspace): string {
  return WORKSPACES.find((item) => item.id === workspace)?.path ?? '/';
}

function formatNumber(value: number | undefined): string {
  return typeof value === 'number' ? value.toLocaleString() : '0';
}

function formatPayload(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function healthTone(status: string | undefined): Tone {
  if (status === 'ready') return 'good';
  if (status === 'degraded') return 'bad';
  if (status === 'pending' || status === 'rebuilding') return 'warn';
  return 'neutral';
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as unknown : null;

  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'error' in body
      ? String((body as { error: unknown }).error)
      : response.statusText;
    throw new Error(message || `HTTP ${response.status}`);
  }

  return body as T;
}

function StatusPill({ tone, children }: { tone: Tone; children: string }) {
  const Icon = tone === 'good' ? CheckCircle2 : tone === 'bad' ? XCircle : tone === 'warn' ? AlertTriangle : ShieldCheck;
  return (
    <span className={`status-pill ${tone}`}>
      <Icon size={14} />
      {children}
    </span>
  );
}

function IconButton({
  children,
  disabled,
  icon: Icon,
  onClick,
}: {
  children: string;
  disabled?: boolean;
  icon: LucideIcon;
  onClick?: () => void;
}) {
  return (
    <motion.button
      className="command-button"
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      whileHover={disabled ? undefined : { y: -1 }}
      transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
      type="button"
    >
      <Icon size={16} />
      {children}
    </motion.button>
  );
}

function Panel({
  actions,
  children,
  icon: Icon,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <motion.section
      className="ops-panel"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
    >
      <div className="panel-heading">
        <div>
          <Icon size={17} />
          <h2>{title}</h2>
        </div>
        {actions}
      </div>
      {children}
    </motion.section>
  );
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className={`metric-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function App() {
  const { path, navigate } = useRouter();
  const activeWorkspace = workspaceFromPath(path);
  const [project, setProject] = useState('');
  const [version, setVersion] = useState<VersionResponse | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatusResponse | null>(null);
  const [operations, setOperations] = useState<OperationCatalogEntry[]>([]);
  const [traces, setTraces] = useState<OperationTrace[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<OperationTrace | null>(null);
  const [traceOrigin, setTraceOrigin] = useState<OperationTraceOrigin | ''>('');
  const [traceStatus, setTraceStatus] = useState<OperationTraceStatus | ''>('');
  const [traceTarget, setTraceTarget] = useState('');
  const [recallQuery, setRecallQuery] = useState('architecture indexing trace');
  const [recall, setRecall] = useState<ObservatoryRecallResponse | null>(null);
  const [graph, setGraph] = useState<VizSliceResponse | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [observationTitle, setObservationTitle] = useState('Operational note');
  const [observationContent, setObservationContent] = useState('**What**: \n**Why**: \n**Where**: \n**Learned**: ');
  const [observationType, setObservationType] = useState<ObservationType>('manual');

  const currentHealth = indexStatus?.health;
  const jobKinds = currentHealth?.semantic?.jobs.by_kind ?? [];
  const coverage = currentHealth?.semantic?.coverage;

  const filteredOperations = useMemo(() => {
    const order: Record<string, number> = { indexing: 0, write: 1, read: 2, sync: 3, admin: 4 };
    return [...operations].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
  }, [operations]);

  async function refreshTraces(): Promise<void> {
    const result = await api.getOperationTraces({
      origin: traceOrigin || undefined,
      status: traceStatus || undefined,
      target: traceTarget || undefined,
      project: project || undefined,
      limit: 40,
    });
    setTraces(result.traces);
    if (result.traces.length > 0 && !selectedTrace) {
      setSelectedTrace(result.traces[0]);
    }
  }

  async function refreshDashboard(): Promise<void> {
    setError(null);
    const [versionPayload, statsPayload, operationsPayload, indexPayload, tracesPayload] = await Promise.all([
      api.getVersion(),
      api.getStats(),
      api.getOperations(),
      api.getIndexStatus({ project: project || undefined }),
      api.getOperationTraces({ project: project || undefined, limit: 40 }),
    ]);
    setVersion(versionPayload);
    setStats(statsPayload);
    setOperations(operationsPayload.operations);
    setIndexStatus(indexPayload);
    setTraces(tracesPayload.traces);
    setSelectedTrace((current) => current ?? tracesPayload.traces[0] ?? null);
  }

  useEffect(() => {
    void refreshDashboard().catch((loadError) => setError(getErrorMessage(loadError)));
  }, [project]);

  async function runRecall(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const context = await api.getObservatoryContext({ project: project || undefined, query: recallQuery });
      const result = await api.getObservatoryRecall({
        context_token: context.context_token,
        lanes: LANES.map((lane) => lane.id),
        limit: 8,
      });
      setRecall(result);
      setCommandResult({ title: 'Hybrid recall', payload: result });
    } catch (runError) {
      setError(getErrorMessage(runError));
    } finally {
      setBusy(false);
    }
  }

  async function runGraph(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await api.getVizSlice({
        project: project || undefined,
        query: recallQuery || undefined,
        max_nodes: 80,
        max_edges: 160,
      });
      setGraph(result);
      setCommandResult({ title: 'Graph slice', payload: result });
    } catch (runError) {
      setError(getErrorMessage(runError));
    } finally {
      setBusy(false);
    }
  }

  async function runSearch(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await api.searchObservations({
        query: recallQuery,
        project: project || undefined,
        mode: 'preview',
        limit: 12,
      });
      setSearchResults(result);
      setCommandResult({ title: 'HTTP search', payload: result });
    } catch (runError) {
      setError(getErrorMessage(runError));
    } finally {
      setBusy(false);
    }
  }

  async function createObservation(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await postJson<CreateObservationResult>('/observations', {
        title: observationTitle,
        content: observationContent,
        project: project || undefined,
        type: observationType,
      });
      setCommandResult({ title: 'Create observation', payload: result });
      await refreshDashboard();
    } catch (runError) {
      setError(getErrorMessage(runError));
    } finally {
      setBusy(false);
    }
  }

  async function rebuildIndex(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await api.rebuildIndex({ project: project || undefined, reason: 'dashboard', process_limit: 0 });
      setIndexStatus(result);
      setCommandResult({ title: 'Index rebuild', payload: result });
      await refreshTraces();
    } catch (runError) {
      setError(getErrorMessage(runError));
    } finally {
      setBusy(false);
    }
  }

  async function rebuildGraph(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await api.rebuildGraph({ project: project || undefined });
      setCommandResult({ title: 'Graph rebuild', payload: result });
      await runGraph();
    } catch (runError) {
      setError(getErrorMessage(runError));
    } finally {
      setBusy(false);
    }
  }

  async function openTrace(trace: OperationTrace): Promise<void> {
    setSelectedTrace(trace);
    try {
      setSelectedTrace(await api.getOperationTrace(trace.trace_id));
    } catch (runError) {
      setError(getErrorMessage(runError));
    }
  }

  return (
    <div className="console-shell">
      <aside className="console-rail">
        <div className="rail-mark">
          <Database size={22} />
          <div>
            <strong>thoth-mem</strong>
            <span>{version?.version ?? 'loading'}</span>
          </div>
        </div>
        <nav className="rail-nav">
          {WORKSPACES.map((workspace) => {
            const Icon = workspace.icon;
            const active = workspace.id === activeWorkspace;
            return (
              <motion.button
                key={workspace.id}
                aria-current={active ? 'page' : undefined}
                className={active ? 'active' : ''}
                onClick={() => navigate(pathForWorkspace(workspace.id))}
                type="button"
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
              >
                <Icon size={17} />
                <span>{workspace.label}</span>
              </motion.button>
            );
          })}
        </nav>
        <div className="rail-footer">
          <StatusPill tone={healthTone(currentHealth?.semantic_state)}>{currentHealth?.semantic_state ?? 'unknown'}</StatusPill>
          <span>{formatNumber(currentHealth?.pending_jobs)} pending jobs</span>
        </div>
      </aside>

      <main className="console-main">
        <header className="console-topbar">
          <div>
            <span className="section-kicker"><Cpu size={14} /> Core Retrieval Engine</span>
            <h1>Memory Operations Console</h1>
          </div>
          <div className="scope-bar">
            <label>
              <Server size={15} />
              <input
                value={project}
                onChange={(event) => setProject(event.target.value)}
                placeholder="project"
              />
            </label>
            <IconButton disabled={busy} icon={RefreshCw} onClick={() => void refreshDashboard().catch((loadError) => setError(getErrorMessage(loadError)))}>
              Refresh
            </IconButton>
          </div>
        </header>

        {error ? (
          <div className="console-error">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        <section className="signal-strip">
          <Metric label="Observations" value={formatNumber(stats?.observations)} tone="live" />
          <Metric label="Sessions" value={formatNumber(stats?.sessions)} />
          <Metric label="Prompts" value={formatNumber(stats?.prompts)} />
          <Metric label="Queue lag" value={`${formatNumber(currentHealth?.semantic?.jobs.queue_lag_ms ?? 0)} ms`} tone={currentHealth?.semantic?.jobs.queue_lag_ms ? 'warn' : 'good'} />
          <Metric label="Chunk coverage" value={`${Math.round((coverage?.chunk_coverage ?? 0) * 100)}%`} />
          <Metric label="Sentence coverage" value={`${Math.round((coverage?.sentence_coverage ?? 0) * 100)}%`} />
        </section>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeWorkspace}
            className="workspace-stage"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
          >
            {activeWorkspace === 'retrieval' ? (
              <RetrievalWorkspace
                busy={busy}
                onGraph={() => void runGraph()}
                onRecall={() => void runRecall()}
                onSearch={() => void runSearch()}
                query={recallQuery}
                recall={recall}
                searchResults={searchResults}
                setQuery={setRecallQuery}
              />
            ) : null}
            {activeWorkspace === 'operations' ? (
              <OperationsWorkspace
                busy={busy}
                commandResult={commandResult}
                content={observationContent}
                operations={filteredOperations}
                onCreate={() => void createObservation()}
                onGraph={() => void rebuildGraph()}
                onIndex={() => void rebuildIndex()}
                onSearch={() => void runSearch()}
                setContent={setObservationContent}
                setTitle={setObservationTitle}
                setType={setObservationType}
                title={observationTitle}
                type={observationType}
              />
            ) : null}
            {activeWorkspace === 'traces' ? (
              <TracesWorkspace
                onOpenTrace={(trace) => void openTrace(trace)}
                onRefresh={() => void refreshTraces().catch((loadError) => setError(getErrorMessage(loadError)))}
                selectedTrace={selectedTrace}
                setStatus={setTraceStatus}
                setTarget={setTraceTarget}
                setTraceOrigin={setTraceOrigin}
                status={traceStatus}
                target={traceTarget}
                traceOrigin={traceOrigin}
                traces={traces}
              />
            ) : null}
            {activeWorkspace === 'indexing' ? (
              <IndexingWorkspace
                busy={busy}
                indexStatus={indexStatus}
                jobKinds={jobKinds}
                onGraph={() => void rebuildGraph()}
                onIndex={() => void rebuildIndex()}
              />
            ) : null}
            {activeWorkspace === 'graph' ? (
              <GraphWorkspace
                busy={busy}
                graph={graph}
                onLoad={() => void runGraph()}
                query={recallQuery}
                setQuery={setRecallQuery}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function RetrievalWorkspace({
  busy,
  onGraph,
  onRecall,
  onSearch,
  query,
  recall,
  searchResults,
  setQuery,
}: {
  busy: boolean;
  onGraph: () => void;
  onRecall: () => void;
  onSearch: () => void;
  query: string;
  recall: ObservatoryRecallResponse | null;
  searchResults: SearchResponse | null;
  setQuery: (value: string) => void;
}) {
  return (
    <div className="workspace-grid retrieval-grid">
      <Panel icon={Brain} title="Retrieval lanes" actions={<IconButton disabled={busy} icon={Play} onClick={onRecall}>Recall</IconButton>}>
        <div className="query-dock">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
          <button onClick={onSearch} type="button">Search</button>
          <button onClick={onGraph} type="button">Graph</button>
        </div>
        <div className="lane-grid">
          {LANES.map((lane, index) => {
            const hits = recall?.lanes[lane.id] ?? [];
            const Icon = lane.icon;
            return (
              <motion.article
                className="lane-card"
                key={lane.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.22 }}
              >
                <header>
                  <Icon size={16} />
                  <strong>{lane.label}</strong>
                  <span>{hits.length}</span>
                </header>
                <div className="lane-hit-list">
                  {hits.length > 0 ? hits.slice(0, 4).map((hit) => (
                    <div className="lane-hit" key={`${lane.id}-${hit.observation_id}`}>
                      <strong>{hit.title}</strong>
                      <p>{hit.preview}</p>
                      <span>obs:{hit.observation_id} · {hit.type}</span>
                    </div>
                  )) : <p className="muted-line">No evidence</p>}
                </div>
              </motion.article>
            );
          })}
        </div>
      </Panel>
      <Panel icon={Search} title="Search results">
        <div className="result-list">
          {searchResults?.results.length ? searchResults.results.map((result) => (
            <article className="result-row" key={result.id}>
              <strong>{result.title}</strong>
              <span>{result.type} · obs:{result.id}</span>
              {result.preview ? <p>{result.preview}</p> : null}
            </article>
          )) : <p className="muted-line">No results loaded</p>}
        </div>
      </Panel>
    </div>
  );
}

function OperationsWorkspace({
  busy,
  commandResult,
  content,
  onCreate,
  onGraph,
  onIndex,
  onSearch,
  operations,
  setContent,
  setTitle,
  setType,
  title,
  type,
}: {
  busy: boolean;
  commandResult: CommandResult | null;
  content: string;
  onCreate: () => void;
  onGraph: () => void;
  onIndex: () => void;
  onSearch: () => void;
  operations: OperationCatalogEntry[];
  setContent: (value: string) => void;
  setTitle: (value: string) => void;
  setType: (value: ObservationType) => void;
  title: string;
  type: ObservationType;
}) {
  return (
    <div className="workspace-grid operations-grid">
      <Panel icon={Terminal} title="Command surface">
        <div className="command-form">
          <label>
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            <span>Type</span>
            <select value={type} onChange={(event) => setType(event.target.value as ObservationType)}>
              {OBSERVATION_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="wide">
            <span>Content</span>
            <textarea value={content} onChange={(event) => setContent(event.target.value)} />
          </label>
        </div>
        <div className="command-row">
          <IconButton disabled={busy} icon={Save} onClick={onCreate}>Save</IconButton>
          <IconButton disabled={busy} icon={Search} onClick={onSearch}>Search</IconButton>
          <IconButton disabled={busy} icon={Gauge} onClick={onIndex}>Reindex</IconButton>
          <IconButton disabled={busy} icon={GitBranch} onClick={onGraph}>Regraph</IconButton>
        </div>
        <pre className="payload-view">{commandResult ? formatPayload(commandResult.payload) : '{ }'}</pre>
      </Panel>
      <Panel icon={Route} title="Operation catalog">
        <div className="operation-list">
          {operations.map((operation) => (
            <article className="operation-row" key={operation.id}>
              <div>
                <strong>{operation.label}</strong>
                <span>{operation.method ?? operation.origin} {operation.path ?? operation.target}</span>
              </div>
              <StatusPill tone={operation.kind === 'indexing' ? 'live' : operation.kind === 'write' ? 'warn' : 'neutral'}>
                {operation.kind}
              </StatusPill>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function TracesWorkspace({
  onOpenTrace,
  onRefresh,
  selectedTrace,
  setStatus,
  setTarget,
  setTraceOrigin,
  status,
  target,
  traceOrigin,
  traces,
}: {
  onOpenTrace: (trace: OperationTrace) => void;
  onRefresh: () => void;
  selectedTrace: OperationTrace | null;
  setStatus: (value: OperationTraceStatus | '') => void;
  setTarget: (value: string) => void;
  setTraceOrigin: (value: OperationTraceOrigin | '') => void;
  status: OperationTraceStatus | '';
  target: string;
  traceOrigin: OperationTraceOrigin | '';
  traces: OperationTrace[];
}) {
  return (
    <div className="workspace-grid traces-grid">
      <Panel icon={Activity} title="Trace tape" actions={<IconButton icon={RefreshCw} onClick={onRefresh}>Refresh</IconButton>}>
        <div className="trace-filters">
          <select value={traceOrigin} onChange={(event) => setTraceOrigin(event.target.value as OperationTraceOrigin | '')}>
            <option value="">all origins</option>
            <option value="mcp">mcp</option>
            <option value="http">http</option>
            <option value="cli">cli</option>
            <option value="system">system</option>
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value as OperationTraceStatus | '')}>
            <option value="">all status</option>
            <option value="ok">ok</option>
            <option value="error">error</option>
          </select>
          <input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="target" />
        </div>
        <div className="trace-list">
          {traces.map((trace) => (
            <button className={selectedTrace?.trace_id === trace.trace_id ? 'active trace-row' : 'trace-row'} key={trace.trace_id} onClick={() => onOpenTrace(trace)} type="button">
              <span>{trace.origin}</span>
              <strong>{trace.target}</strong>
              <small>{trace.duration_ms}ms · {trace.project ?? 'global'}</small>
              <StatusPill tone={trace.status === 'ok' ? 'good' : 'bad'}>{trace.status}</StatusPill>
            </button>
          ))}
        </div>
      </Panel>
      <Panel icon={Eye} title="Trace detail">
        {selectedTrace ? (
          <div className="trace-detail">
            <div className="trace-detail-head">
              <StatusPill tone={selectedTrace.status === 'ok' ? 'good' : 'bad'}>{selectedTrace.status}</StatusPill>
              <span>{selectedTrace.trace_id}</span>
            </div>
            <pre className="payload-view">{formatPayload({
              target: selectedTrace.target,
              project: selectedTrace.project,
              session_id: selectedTrace.session_id,
              duration_ms: selectedTrace.duration_ms,
              request: selectedTrace.request_json,
              response: selectedTrace.response_json,
              error: selectedTrace.error,
            })}</pre>
          </div>
        ) : <p className="muted-line">No trace selected</p>}
      </Panel>
    </div>
  );
}

function IndexingWorkspace({
  busy,
  indexStatus,
  jobKinds,
  onGraph,
  onIndex,
}: {
  busy: boolean;
  indexStatus: IndexStatusResponse | null;
  jobKinds: NonNullable<IndexStatusResponse['health']['semantic']>['jobs']['by_kind'];
  onGraph: () => void;
  onIndex: () => void;
}) {
  const health = indexStatus?.health;
  return (
    <div className="workspace-grid indexing-grid">
      <Panel icon={Gauge} title="Background health" actions={<IconButton disabled={busy} icon={RefreshCw} onClick={onIndex}>Queue rebuild</IconButton>}>
        <div className="index-health-map">
          <Metric label="State" value={health?.semantic_state ?? 'unknown'} tone={healthTone(health?.semantic_state)} />
          <Metric label="Pending" value={formatNumber(health?.pending_jobs)} tone={health?.pending_jobs ? 'warn' : 'good'} />
          <Metric label="Queue lag" value={`${formatNumber(health?.semantic?.jobs.queue_lag_ms ?? 0)} ms`} />
          <Metric label="Failed" value={formatNumber(health?.semantic?.jobs.failed)} tone={health?.semantic?.jobs.failed ? 'bad' : 'good'} />
        </div>
        <div className="job-kind-list">
          {jobKinds.map((job) => (
            <article key={job.kind}>
              <strong>{job.kind}</strong>
              <span>{job.pending} pending · {job.running} running · {job.failed} failed</span>
              <meter min={0} max={Math.max(job.total, 1)} value={job.done} />
            </article>
          ))}
        </div>
      </Panel>
      <Panel icon={GitBranch} title="Rebuild controls" actions={<IconButton disabled={busy} icon={GitBranch} onClick={onGraph}>Rebuild graph</IconButton>}>
        <div className="lane-grid compact">
          {(health?.semantic?.lanes ?? []).map((lane) => (
            <article className="lane-card mini" key={lane.lane}>
              <header>
                <Database size={15} />
                <strong>{lane.lane}</strong>
                <StatusPill tone={lane.degraded ? 'bad' : lane.pending || lane.stale ? 'warn' : 'good'}>
                  {lane.degraded ? 'degraded' : lane.pending ? 'pending' : lane.stale ? 'stale' : 'ready'}
                </StatusPill>
              </header>
              <span>{lane.updated_at ?? 'not updated'}</span>
            </article>
          ))}
        </div>
        <pre className="payload-view">{indexStatus ? formatPayload(indexStatus.progress.coverage) : '{ }'}</pre>
      </Panel>
    </div>
  );
}

function GraphWorkspace({
  busy,
  graph,
  onLoad,
  query,
  setQuery,
}: {
  busy: boolean;
  graph: VizSliceResponse | null;
  onLoad: () => void;
  query: string;
  setQuery: (value: string) => void;
}) {
  return (
    <div className="workspace-grid graph-grid">
      <Panel icon={Network} title="Memory graph" actions={<IconButton disabled={busy} icon={Play} onClick={onLoad}>Load</IconButton>}>
        <div className="query-dock">
          <Network size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="graph-stage">
          {(graph?.nodes ?? []).slice(0, 80).map((node, index) => (
            <motion.div
              className={`graph-node ${node.kind}`}
              key={node.id}
              style={{ left: `${Math.abs(node.seed_x) % 86 + 4}%`, top: `${Math.abs(node.seed_y) % 78 + 8}%` }}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(index * 0.008, 0.32), duration: 0.2 }}
            >
              <strong>{node.label}</strong>
              <span>{node.kind}</span>
            </motion.div>
          ))}
        </div>
      </Panel>
      <Panel icon={Route} title="Graph evidence">
        <div className="result-list">
          {(graph?.edges ?? []).slice(0, 30).map((edge) => (
            <article className="result-row" key={edge.id}>
              <strong>{edge.label}</strong>
              <span>{edge.relation}</span>
              <p>{edge.summary}</p>
            </article>
          ))}
          {!graph ? <p className="muted-line">No graph loaded</p> : null}
        </div>
      </Panel>
    </div>
  );
}

export default App;
