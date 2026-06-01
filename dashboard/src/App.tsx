import { useEffect, useMemo, useRef, useState, useId, type ReactNode } from 'react';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
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
  type VizEdge,
  type VizFiltersResponse,
  type VizNode,
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

interface ScopeState {
  project: string;
  sessionId: string;
  topicKey: string;
  type: ObservationType | '';
  relation: string;
  cue: string;
}

interface UniverseNodeDatum extends SimulationNodeDatum {
  data: VizNode;
  degree: number;
  id: string;
  radius: number;
}

interface UniverseEdgeDatum extends SimulationLinkDatum<UniverseNodeDatum> {
  data: VizEdge;
  source: string | UniverseNodeDatum;
  target: string | UniverseNodeDatum;
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

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(
    values
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
  )).sort((a, b) => a.localeCompare(b));
}

function operationTarget(operation: OperationCatalogEntry): string {
  return operation.path ?? operation.target ?? operation.id;
}

function formatScopeLine(scope: ScopeState): string {
  const parts = [
    scope.project || 'all projects',
    scope.sessionId || 'all sessions',
    scope.topicKey || 'all topics',
    scope.type || 'all types',
    scope.relation || 'all relations',
  ];
  return parts.join(' / ');
}

function mergeGraphSlices(base: VizSliceResponse, incoming: VizSliceResponse): VizSliceResponse {
  const nodes = new Map<string, VizNode>();
  const edges = new Map<string, VizEdge>();

  for (const node of base.nodes) nodes.set(node.id, node);
  for (const node of incoming.nodes) nodes.set(node.id, node);
  for (const edge of base.edges) edges.set(edge.id, edge);
  for (const edge of incoming.edges) edges.set(edge.id, edge);

  return {
    ...incoming,
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
    truncated: base.truncated || incoming.truncated,
  };
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

function GuidedCombo({
  icon: Icon,
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  icon: LucideIcon;
  label: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  value: string;
}) {
  const listId = useId();
  return (
    <label className="guided-field">
      <span>{label}</span>
      <div>
        <Icon size={15} />
        <input
          list={listId}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      </div>
      <datalist id={listId}>
        {options.map((option) => <option key={option} value={option} />)}
      </datalist>
    </label>
  );
}

function GuidedSelect({
  disabled,
  icon: Icon,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="guided-field">
      <span>{label}</span>
      <div>
        <Icon size={15} />
        <select disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
          {options.map((option) => <option key={`${label}-${option.value}`} value={option.value}>{option.label}</option>)}
        </select>
      </div>
    </label>
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
  const [sessionScope, setSessionScope] = useState('');
  const [topicScope, setTopicScope] = useState('');
  const [typeScope, setTypeScope] = useState<ObservationType | ''>('');
  const [relationScope, setRelationScope] = useState('');
  const [version, setVersion] = useState<VersionResponse | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [vizFilters, setVizFilters] = useState<VizFiltersResponse | null>(null);
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
  const scope: ScopeState = {
    project,
    sessionId: sessionScope,
    topicKey: topicScope,
    type: typeScope,
    relation: relationScope,
    cue: recallQuery,
  };

  const filteredOperations = useMemo(() => {
    const order: Record<string, number> = { indexing: 0, write: 1, read: 2, sync: 3, admin: 4 };
    return [...operations].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
  }, [operations]);

  const operationTargets = useMemo(
    () => uniqueSorted(operations.flatMap((operation) => [operationTarget(operation), operation.label, operation.id])),
    [operations]
  );

  const projectOptions = useMemo(
    () => uniqueSorted([...(stats?.projects ?? []), ...(vizFilters?.projects ?? [])]),
    [stats?.projects, vizFilters?.projects]
  );

  const sessionOptions = useMemo(() => vizFilters?.sessions ?? [], [vizFilters?.sessions]);
  const topicOptions = useMemo(() => vizFilters?.topic_keys ?? [], [vizFilters?.topic_keys]);
  const relationOptions = useMemo(() => vizFilters?.relations ?? [], [vizFilters?.relations]);
  const cueOptions = useMemo(
    () => uniqueSorted([
      ...topicOptions,
      ...relationOptions,
      ...operationTargets,
      ...traces.map((trace) => trace.target),
    ]).slice(0, 120),
    [operationTargets, relationOptions, topicOptions, traces]
  );

  async function refreshTraces(): Promise<void> {
    const result = await api.getOperationTraces({
      origin: traceOrigin || undefined,
      status: traceStatus || undefined,
      target: traceTarget || undefined,
      project: project || undefined,
      session_id: sessionScope || undefined,
      limit: 40,
    });
    setTraces(result.traces);
    if (result.traces.length > 0 && !selectedTrace) {
      setSelectedTrace(result.traces[0]);
    }
  }

  async function refreshDashboard(): Promise<void> {
    setError(null);
    const [versionPayload, statsPayload, operationsPayload, indexPayload, tracesPayload, filtersPayload] = await Promise.all([
      api.getVersion(),
      api.getStats(),
      api.getOperations(),
      api.getIndexStatus({ project: project || undefined }),
      api.getOperationTraces({ project: project || undefined, session_id: sessionScope || undefined, limit: 40 }),
      api.getVizFilters({ project: project || undefined }),
    ]);
    setVersion(versionPayload);
    setStats(statsPayload);
    setOperations(operationsPayload.operations);
    setIndexStatus(indexPayload);
    setTraces(tracesPayload.traces);
    setVizFilters(filtersPayload);
    setSelectedTrace((current) => current ?? tracesPayload.traces[0] ?? null);
  }

  useEffect(() => {
    void refreshDashboard().catch((loadError) => setError(getErrorMessage(loadError)));
  }, [project, sessionScope]);

  useEffect(() => {
    if (sessionScope && sessionOptions.length > 0 && !sessionOptions.includes(sessionScope)) {
      setSessionScope('');
    }
    if (topicScope && topicOptions.length > 0 && !topicOptions.includes(topicScope)) {
      setTopicScope('');
    }
    if (relationScope && relationOptions.length > 0 && !relationOptions.includes(relationScope)) {
      setRelationScope('');
    }
  }, [relationOptions, relationScope, sessionOptions, sessionScope, topicOptions, topicScope]);

  async function runRecall(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const context = await api.getObservatoryContext({
        project: project || undefined,
        session_id: sessionScope || undefined,
        topic_key: topicScope || undefined,
        type: typeScope || undefined,
        relation: relationScope || undefined,
        query: recallQuery || undefined,
      });
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
        session_id: sessionScope || undefined,
        topic_key: topicScope || undefined,
        type: typeScope || undefined,
        relation: relationScope || undefined,
        depth: 2,
        max_nodes: 220,
        max_edges: 520,
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
        type: typeScope || undefined,
        project: project || undefined,
        session_id: sessionScope || undefined,
        topic_key_exact: topicScope || undefined,
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
        session_id: sessionScope || undefined,
        topic_key: topicScope || undefined,
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

  async function expandGraphNode(nodeId: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await api.expandVizNode({
        node_id: nodeId,
        project: project || undefined,
        session_id: sessionScope || undefined,
        topic_key: topicScope || undefined,
        type: typeScope || undefined,
        relation: relationScope || undefined,
        depth: 1,
        max_nodes: 160,
        max_edges: 320,
      });
      setGraph((current) => current ? mergeGraphSlices(current, result) : result);
      setCommandResult({ title: 'Expand memory node', payload: result });
    } catch (runError) {
      setError(getErrorMessage(runError));
    } finally {
      setBusy(false);
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
          <div className="scope-bar mission-scope-grid">
            <GuidedCombo
              icon={Server}
              label="Project"
              onChange={setProject}
              options={projectOptions}
              placeholder="all projects"
              value={project}
            />
            <GuidedSelect
              disabled={sessionOptions.length === 0}
              icon={Database}
              label="Session"
              onChange={setSessionScope}
              options={[
                { label: 'all sessions', value: '' },
                ...sessionOptions.map((session) => ({ label: session, value: session })),
              ]}
              value={sessionScope}
            />
            <GuidedCombo
              icon={Route}
              label="Topic"
              onChange={setTopicScope}
              options={topicOptions}
              placeholder="all topics"
              value={topicScope}
            />
            <GuidedSelect
              icon={Layers}
              label="Type"
              onChange={(value) => setTypeScope(value as ObservationType | '')}
              options={[
                { label: 'all types', value: '' },
                ...OBSERVATION_TYPES.map((item) => ({ label: item, value: item })),
              ]}
              value={typeScope}
            />
            <GuidedSelect
              disabled={relationOptions.length === 0}
              icon={GitBranch}
              label="Relation"
              onChange={setRelationScope}
              options={[
                { label: 'all relations', value: '' },
                ...relationOptions.map((relation) => ({ label: relation, value: relation })),
              ]}
              value={relationScope}
            />
            <GuidedCombo
              icon={Search}
              label="Memory cue"
              onChange={setRecallQuery}
              options={cueOptions}
              placeholder="choose or type a cue"
              value={recallQuery}
            />
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
                scope={scope}
                searchResults={searchResults}
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
                targetOptions={operationTargets}
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
                filters={vizFilters}
                graph={graph}
                onExpand={(nodeId) => void expandGraphNode(nodeId)}
                onLoad={() => void runGraph()}
                scope={scope}
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
  scope,
  searchResults,
}: {
  busy: boolean;
  onGraph: () => void;
  onRecall: () => void;
  onSearch: () => void;
  query: string;
  recall: ObservatoryRecallResponse | null;
  scope: ScopeState;
  searchResults: SearchResponse | null;
}) {
  return (
    <div className="workspace-grid retrieval-grid">
      <Panel icon={Brain} title="Retrieval lanes" actions={<IconButton disabled={busy} icon={Play} onClick={onRecall}>Recall</IconButton>}>
        <div className="mission-dock">
          <Search size={18} />
          <div>
            <strong>{query || 'No memory cue selected'}</strong>
            <span>{formatScopeLine(scope)}</span>
          </div>
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
  targetOptions,
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
  targetOptions: string[];
  traceOrigin: OperationTraceOrigin | '';
  traces: OperationTrace[];
}) {
  const targetListId = useId();
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
          <input list={targetListId} value={target} onChange={(event) => setTarget(event.target.value)} placeholder="target" />
          <datalist id={targetListId}>
            {targetOptions.map((option) => <option key={option} value={option} />)}
          </datalist>
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
  filters,
  graph,
  onExpand,
  onLoad,
  scope,
}: {
  busy: boolean;
  filters: VizFiltersResponse | null;
  graph: VizSliceResponse | null;
  onExpand: (nodeId: string) => void;
  onLoad: () => void;
  scope: ScopeState;
}) {
  const [selectedNode, setSelectedNode] = useState<VizNode | null>(null);
  const [minDegree, setMinDegree] = useState(0);
  const selectedEdges = useMemo(() => {
    if (!selectedNode || !graph) return [];
    return graph.edges.filter((edge) => edge.source_id === selectedNode.id || edge.target_id === selectedNode.id);
  }, [graph, selectedNode]);

  return (
    <div className="workspace-grid graph-grid mission-grid">
      <Panel
        icon={Network}
        title="Memory universe"
        actions={<IconButton disabled={busy} icon={Play} onClick={onLoad}>Load universe</IconButton>}
      >
        <div className="universe-command-row">
          <div className="scope-summary">
            <strong>{scope.cue || 'Explore all memories'}</strong>
            <span>{formatScopeLine(scope)}</span>
          </div>
          <label className="density-control">
            <span>Min degree {minDegree}</span>
            <input max={8} min={0} onChange={(event) => setMinDegree(Number(event.target.value))} type="range" value={minDegree} />
          </label>
        </div>
        <div className="filter-pill-row">
          {(filters?.types ?? []).map((type) => (
            <span className={scope.type === type ? 'active filter-pill' : 'filter-pill'} key={type}>{type}</span>
          ))}
          {(filters?.relations ?? []).slice(0, 8).map((relation) => (
            <span className={scope.relation === relation ? 'active filter-pill relation' : 'filter-pill relation'} key={relation}>{relation}</span>
          ))}
        </div>
        <MemoryUniverse
          graph={graph}
          minDegree={minDegree}
          onSelectNode={setSelectedNode}
          selectedNodeId={selectedNode?.id ?? null}
        />
      </Panel>
      <Panel icon={Route} title="Node inspector">
        {selectedNode ? (
          <div className="inspector-stack">
            <div className="node-inspector-card">
              <span>{selectedNode.kind}</span>
              <strong>{selectedNode.label}</strong>
              <p>{selectedNode.snippet || 'No snippet available'}</p>
              <div className="inspector-meta-grid">
                <span>project</span><strong>{selectedNode.project ?? 'global'}</strong>
                <span>topic</span><strong>{selectedNode.topic_key ?? 'none'}</strong>
                <span>type</span><strong>{selectedNode.type ?? 'none'}</strong>
                <span>edges</span><strong>{selectedEdges.length}</strong>
              </div>
              <IconButton disabled={busy} icon={Network} onClick={() => onExpand(selectedNode.id)}>Expand node</IconButton>
            </div>
            <div className="result-list">
              {selectedEdges.slice(0, 24).map((edge) => (
                <article className="result-row" key={edge.id}>
                  <strong>{edge.label}</strong>
                  <span>{edge.source_id}{' -> '}{edge.target_id} · {edge.relation}</span>
                  <p>{edge.summary}</p>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="inspector-empty">
            <Network size={26} />
            <strong>No node selected</strong>
            <p>Inspector idle.</p>
          </div>
        )}
      </Panel>
    </div>
  );
}

function MemoryUniverse({
  graph,
  minDegree,
  onSelectNode,
  selectedNodeId,
}: {
  graph: VizSliceResponse | null;
  minDegree: number;
  onSelectNode: (node: VizNode | null) => void;
  selectedNodeId: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simulationRef = useRef<Simulation<UniverseNodeDatum, UniverseEdgeDatum> | null>(null);
  const zoomRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const redrawRef = useRef<(() => void) | null>(null);
  const selectedRef = useRef<string | null>(selectedNodeId);
  const hoveredRef = useRef<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<VizNode | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    selectedRef.current = selectedNodeId;
    redrawRef.current?.();
  }, [selectedNodeId]);

  useEffect(() => {
    if (isPaused) {
      simulationRef.current?.stop();
    } else {
      simulationRef.current?.alphaTarget(0.02).restart();
    }
  }, [isPaused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graph) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const canvasElement = canvas;
    const canvasContext = context;
    const canvasWidth = Math.max(canvasElement.clientWidth, 320);
    const canvasHeight = Math.max(canvasElement.clientHeight, 420);
    const spreadFactor = Math.max(1, Math.sqrt(Math.max(graph.nodes.length, 1) / 45));
    const layoutWidth = Math.max(canvasWidth * 2.4, 1100 * spreadFactor);
    const layoutHeight = Math.max(canvasHeight * 2.2, 760 * spreadFactor);
    const layoutCenterX = layoutWidth / 2;
    const layoutCenterY = layoutHeight / 2;

    function normalizeSeed(value: number): number {
      if (!Number.isFinite(value)) return 0;
      if (value >= -1 && value <= 1) return value;
      return (Math.abs(value) % 2000) / 1000 - 1;
    }

    const degree = new Map<string, number>();
    for (const node of graph.nodes) degree.set(node.id, 0);
    for (const edge of graph.edges) {
      degree.set(edge.source_id, (degree.get(edge.source_id) ?? 0) + 1);
      degree.set(edge.target_id, (degree.get(edge.target_id) ?? 0) + 1);
    }

    const nodes: UniverseNodeDatum[] = graph.nodes
      .map((node) => {
        const nodeDegree = degree.get(node.id) ?? 0;
        return {
          data: node,
          degree: nodeDegree,
          id: node.id,
          radius: Math.max(9, Math.min(30, 9 + nodeDegree * 3)),
          x: layoutCenterX + normalizeSeed(node.seed_x) * layoutWidth * 0.42,
          y: layoutCenterY + normalizeSeed(node.seed_y) * layoutHeight * 0.42,
        };
      })
      .filter((node) => node.degree >= minDegree || node.data.kind === 'project');
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges: UniverseEdgeDatum[] = graph.edges
      .filter((edge) => nodeIds.has(edge.source_id) && nodeIds.has(edge.target_id))
      .map((edge) => ({ data: edge, source: edge.source_id, target: edge.target_id }));

    simulationRef.current?.stop();
    const simulation = forceSimulation<UniverseNodeDatum, UniverseEdgeDatum>(nodes)
      .force('link', forceLink<UniverseNodeDatum, UniverseEdgeDatum>(edges).id((node) => node.id).distance((edge) => 128 + Math.min(edge.data.relation.length * 3, 90)).strength(0.08))
      .force('charge', forceManyBody<UniverseNodeDatum>().strength((node) => -320 - Math.min(node.degree, 12) * 24))
      .force('collide', forceCollide<UniverseNodeDatum>().radius((node) => node.radius + 24).strength(0.95))
      .force('center', forceCenter(layoutCenterX, layoutCenterY))
      .force('x', forceX<UniverseNodeDatum>(layoutCenterX).strength(0.018))
      .force('y', forceY<UniverseNodeDatum>(layoutCenterY).strength(0.018))
      .alpha(0.9)
      .alphaDecay(0.045);
    simulationRef.current = simulation;

    function resizeCanvas(): void {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(canvasElement.clientWidth, 320);
      const height = Math.max(canvasElement.clientHeight, 420);
      const nextWidth = Math.floor(width * ratio);
      const nextHeight = Math.floor(height * ratio);
      if (canvasElement.width !== nextWidth || canvasElement.height !== nextHeight) {
        canvasElement.width = nextWidth;
        canvasElement.height = nextHeight;
      }
      canvasContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function nodeColor(node: VizNode): string {
      if (node.kind === 'fact') return '#5be7c4';
      if (node.kind === 'topic') return '#f1bc5d';
      if (node.kind === 'session') return '#9aa4ff';
      if (node.kind === 'project') return '#64d8ff';
      return '#d7fff4';
    }

    function linkedToSelected(edge: UniverseEdgeDatum, selected: string): boolean {
      const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
      const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
      return sourceId === selected || targetId === selected;
    }

    function draw(): void {
      resizeCanvas();
      const width = canvasElement.clientWidth;
      const height = canvasElement.clientHeight;
      const selected = selectedRef.current;
      const hovered = hoveredRef.current;

      canvasContext.save();
      canvasContext.clearRect(0, 0, width, height);
      canvasContext.translate(transformRef.current.x, transformRef.current.y);
      canvasContext.scale(transformRef.current.k, transformRef.current.k);

      for (const edge of edges) {
        const source = edge.source;
        const target = edge.target;
        if (typeof source === 'string' || typeof target === 'string') continue;
        const inFocus = selected ? linkedToSelected(edge, selected) : true;
        const hot = hovered && linkedToSelected(edge, hovered);
        canvasContext.globalAlpha = hot ? 0.9 : inFocus ? 0.42 : 0.08;
        canvasContext.strokeStyle = edge.data.kind === 'fact' ? '#5be7c4' : '#64d8ff';
        canvasContext.lineWidth = hot || inFocus ? 1.8 : 0.8;
        canvasContext.beginPath();
        canvasContext.moveTo(source.x ?? 0, source.y ?? 0);
        canvasContext.lineTo(target.x ?? 0, target.y ?? 0);
        canvasContext.stroke();
      }

      for (const node of nodes) {
        const focused = node.id === selected || node.id === hovered;
        const neighborFocus = selected
          ? edges.some((edge) => linkedToSelected(edge, selected) && linkedToSelected(edge, node.id))
          : true;
        canvasContext.globalAlpha = focused ? 1 : neighborFocus ? 0.88 : 0.16;
        canvasContext.beginPath();
        canvasContext.arc(node.x ?? 0, node.y ?? 0, focused ? node.radius + 3 : node.radius, 0, Math.PI * 2);
        canvasContext.fillStyle = nodeColor(node.data);
        canvasContext.shadowBlur = focused ? 18 : 0;
        canvasContext.shadowColor = nodeColor(node.data);
        canvasContext.fill();
        canvasContext.shadowBlur = 0;

        if (focused || node.degree >= 3 || node.data.kind === 'project') {
          const label = node.data.label.length > 28 ? `${node.data.label.slice(0, 26)}...` : node.data.label;
          canvasContext.font = focused ? '700 12px Bahnschrift, Segoe UI, sans-serif' : '600 10px Bahnschrift, Segoe UI, sans-serif';
          canvasContext.textAlign = 'center';
          canvasContext.textBaseline = 'top';
          canvasContext.fillStyle = '#eef7f4';
          canvasContext.globalAlpha = focused ? 0.98 : 0.72;
          canvasContext.fillText(label, node.x ?? 0, (node.y ?? 0) + node.radius + 7);
        }
      }

      canvasContext.restore();
      canvasContext.globalAlpha = 1;
    }

    redrawRef.current = draw;
    simulation.on('tick', draw);

    const zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.04, 5])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        draw();
      });
    zoomRef.current = zoomBehavior;
    select<HTMLCanvasElement, unknown>(canvasElement).call(zoomBehavior);

    function fitVisibleNodes(maxScale = 1.15): void {
      if (nodes.length === 0) return;
      const bounds = nodes.reduce(
        (acc, node) => ({
          maxX: Math.max(acc.maxX, node.x ?? layoutCenterX),
          maxY: Math.max(acc.maxY, node.y ?? layoutCenterY),
          minX: Math.min(acc.minX, node.x ?? layoutCenterX),
          minY: Math.min(acc.minY, node.y ?? layoutCenterY),
        }),
        { maxX: -Infinity, maxY: -Infinity, minX: Infinity, minY: Infinity }
      );
      const width = Math.max(canvasElement.clientWidth, 320);
      const height = Math.max(canvasElement.clientHeight, 420);
      const padding = Math.min(220, Math.max(120, Math.min(width, height) * 0.24));
      const scale = Math.max(0.06, Math.min(maxScale, Math.min(
        Math.max(width - padding, 1) / Math.max(bounds.maxX - bounds.minX, 1),
        Math.max(height - padding, 1) / Math.max(bounds.maxY - bounds.minY, 1)
      )));
      const x = width / 2 - scale * ((bounds.minX + bounds.maxX) / 2);
      const y = height / 2 - scale * ((bounds.minY + bounds.maxY) / 2);
      select<HTMLCanvasElement, unknown>(canvasElement)
        .call(zoomBehavior.transform, zoomIdentity.translate(x, y).scale(scale));
    }

    function findNode(clientX: number, clientY: number): UniverseNodeDatum | null {
      const rect = canvasElement.getBoundingClientRect();
      const [x, y] = transformRef.current.invert([clientX - rect.left, clientY - rect.top]);
      for (let index = nodes.length - 1; index >= 0; index -= 1) {
        const node = nodes[index];
        const dx = x - (node.x ?? 0);
        const dy = y - (node.y ?? 0);
        if (Math.hypot(dx, dy) <= node.radius + 8) return node;
      }
      return null;
    }

    function handlePointerMove(event: PointerEvent): void {
      const node = findNode(event.clientX, event.clientY);
      hoveredRef.current = node?.id ?? null;
      canvasElement.style.cursor = node ? 'pointer' : 'grab';
      setHoveredNode(node?.data ?? null);
      draw();
    }

    function handlePointerLeave(): void {
      hoveredRef.current = null;
      setHoveredNode(null);
      draw();
    }

    function handleClick(event: MouseEvent): void {
      const node = findNode(event.clientX, event.clientY);
      selectedRef.current = node?.id ?? null;
      onSelectNode(node?.data ?? null);
      draw();
    }

    canvasElement.addEventListener('pointermove', handlePointerMove);
    canvasElement.addEventListener('pointerleave', handlePointerLeave);
    canvasElement.addEventListener('click', handleClick);
    draw();
    const fitTimer = window.setTimeout(() => fitVisibleNodes(), 320);

    return () => {
      simulation.stop();
      window.clearTimeout(fitTimer);
      canvasElement.removeEventListener('pointermove', handlePointerMove);
      canvasElement.removeEventListener('pointerleave', handlePointerLeave);
      canvasElement.removeEventListener('click', handleClick);
      select<HTMLCanvasElement, unknown>(canvasElement).on('.zoom', null);
      redrawRef.current = null;
    };
  }, [graph, minDegree, onSelectNode]);

  function fitUniverse(): void {
    const canvas = canvasRef.current;
    const simulation = simulationRef.current;
    const zoomBehavior = zoomRef.current;
    if (!canvas || !simulation || !zoomBehavior) return;
    const nodes = simulation.nodes();
    if (nodes.length === 0) return;
    const bounds = nodes.reduce(
      (acc, node) => ({
        maxX: Math.max(acc.maxX, node.x ?? 0),
        maxY: Math.max(acc.maxY, node.y ?? 0),
        minX: Math.min(acc.minX, node.x ?? 0),
        minY: Math.min(acc.minY, node.y ?? 0),
      }),
      { maxX: -Infinity, maxY: -Infinity, minX: Infinity, minY: Infinity }
    );
    const padding = Math.min(220, Math.max(120, Math.min(canvas.clientWidth, canvas.clientHeight) * 0.24));
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const scale = Math.max(0.06, Math.min(1.15, Math.min(
      Math.max(width - padding, 1) / Math.max(bounds.maxX - bounds.minX, 1),
      Math.max(height - padding, 1) / Math.max(bounds.maxY - bounds.minY, 1)
    )));
    const x = width / 2 - scale * ((bounds.minX + bounds.maxX) / 2);
    const y = height / 2 - scale * ((bounds.minY + bounds.maxY) / 2);
    select<HTMLCanvasElement, unknown>(canvas)
      .call(zoomBehavior.transform, zoomIdentity.translate(x, y).scale(scale));
  }

  if (!graph) {
    return (
      <div className="graph-stage universe-stage empty">
        <div className="inspector-empty">
          <Network size={28} />
          <strong>No universe loaded</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-stage universe-stage">
      <canvas aria-label="Interactive memory universe" ref={canvasRef} />
      <div className="universe-controls">
        <button onClick={fitUniverse} title="Fit universe" type="button">Fit</button>
        <button className={isPaused ? 'active' : ''} onClick={() => setIsPaused((value) => !value)} title={isPaused ? 'Resume' : 'Pause'} type="button">
          {isPaused ? 'Play' : 'Pause'}
        </button>
      </div>
      {hoveredNode ? (
        <div className="universe-hover-card">
          <span>{hoveredNode.kind}</span>
          <strong>{hoveredNode.label}</strong>
        </div>
      ) : null}
      <div className="universe-counter">
        {graph.nodes.length} nodes / {graph.edges.length} edges
      </div>
    </div>
  );
}

export default App;
