import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import {
  api,
  type IndexStatusResponse,
  type ObservationType,
  type OperationCatalogEntry,
  type OperationTrace,
  type OperationTraceOrigin,
  type OperationTraceStatus,
  type VizFiltersResponse,
} from '../../api/client.js';
import GuidedSelect from '../GuidedSelect.js';
import { buildHumanOptions, presentObservationType } from '../dashboard-presentation.js';
import { formatBoundedResult, presentStoredText } from '../safe-presentation.js';
import ConfirmCommandDialog from './ConfirmCommandDialog.js';
import OperationsPanel from './OperationsPanel.js';
import TracesPanel from './TracesPanel.js';
import IndexingPanel from './IndexingPanel.js';
import { buildCreateObservationPayload } from './control-room-state.js';

type Room = 'operations' | 'traces' | 'indexing';
const roomCopy: Record<Room, { kicker: string; title: string; description: string }> = {
  operations: { kicker: 'Capture and organize', title: 'Capture and maintain memories', description: 'Save durable knowledge and review the local capabilities available to agents.' },
  traces: { kicker: 'Understand recent activity', title: 'See how memory was used', description: 'Follow recent saves, searches, and maintenance activity when you need to investigate.' },
  indexing: { kicker: 'Keep connections healthy', title: 'Prepare memories for retrieval', description: 'Check readiness and rebuild derived connections without changing saved memories.' },
};

export default function ControlRoomWorkspace({ room }: { room: Room }) {
  const [project, setProject] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [operations, setOperations] = useState<OperationCatalogEntry[]>([]);
  const [traces, setTraces] = useState<OperationTrace[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<OperationTrace | null>(null);
  const [index, setIndex] = useState<IndexStatusResponse | null>(null);
  const [traceDetailLoading, setTraceDetailLoading] = useState(false);
  const [traceDetailError, setTraceDetailError] = useState('');
  const [origin, setOrigin] = useState<OperationTraceOrigin | ''>('');
  const [status, setStatus] = useState<OperationTraceStatus | ''>('');
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<ObservationType>('manual');
  const [sessionId, setSessionId] = useState('');
  const [topicKey, setTopicKey] = useState('');
  const [filters, setFilters] = useState<VizFiltersResponse | null>(null);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState('');
  const [filtersReloadKey, setFiltersReloadKey] = useState(0);
  const [validatedFiltersProject, setValidatedFiltersProject] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<null | { kind: 'create' | 'graph' | 'index'; title: string; description: string }>(null);
  const loadRequestRef = useRef(0);
  const traceDetailRequestRef = useRef(0);
  const traceDetailControllerRef = useRef<AbortController | null>(null);
  const filtersRequestRef = useRef(0);
  const load = useCallback(async (signal?: AbortSignal, requestId = ++loadRequestRef.current) => {
    setError('');
    try {
      if (room === 'operations') {
        const value = await api.getOperations(signal);
        if (requestId === loadRequestRef.current) setOperations(value.operations);
      }
      if (room === 'traces') {
        const value = await api.getOperationTraces({
          origin: origin || undefined,
          status: status || undefined,
          target: target || undefined,
          project: project || undefined,
          limit: 50,
        }, signal);
        if (requestId === loadRequestRef.current) setTraces(value.traces);
      }
      if (room === 'indexing') {
        const value = await api.getIndexStatus({ project: project || undefined }, signal);
        if (requestId === loadRequestRef.current) setIndex(value);
      }
    } catch (cause) {
      if ((cause as Error).name !== 'AbortError' && requestId === loadRequestRef.current) {
        setError(presentStoredText((cause as Error).message, 240));
      }
    }
  }, [origin, project, room, status, target]);
  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++loadRequestRef.current;
    void load(controller.signal, requestId);
    return () => {
      controller.abort();
      loadRequestRef.current += 1;
    };
  }, [load]);
  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++filtersRequestRef.current;
    const requestProject = project;
    setFiltersLoading(true); setFiltersError(''); setFilters(null);
    api.getVizFilters({ project: requestProject || undefined }, controller.signal)
      .then((value) => {
        if (requestId !== filtersRequestRef.current) return;
        setFilters(value);
        setValidatedFiltersProject(requestProject);
        if (requestProject && !value.projects.includes(requestProject)) {
          setProject('');
          setSessionId('');
          setTopicKey('');
          return;
        }
        setSessionId((current) => current && value.sessions.includes(current) ? current : '');
        setTopicKey((current) => current && value.topic_keys.includes(current) ? current : '');
      })
      .catch((cause: Error) => {
        if (cause.name !== 'AbortError' && requestId === filtersRequestRef.current) {
          setValidatedFiltersProject(requestProject);
          setFiltersError(presentStoredText(cause.message, 180));
        }
      })
      .finally(() => {
        if (requestId === filtersRequestRef.current) setFiltersLoading(false);
      });
    return () => {
      controller.abort();
      filtersRequestRef.current += 1;
    };
  }, [filtersReloadKey, project]);
  useEffect(() => {
    traceDetailControllerRef.current?.abort();
    traceDetailRequestRef.current += 1;
    setSelectedTrace(null);
    setTraceDetailLoading(false);
    setTraceDetailError('');
    return () => {
      traceDetailControllerRef.current?.abort();
      traceDetailRequestRef.current += 1;
    };
  }, [origin, project, room, status, target]);
  const openTrace = useCallback(async (trace: OperationTrace) => {
    traceDetailControllerRef.current?.abort();
    const controller = new AbortController();
    traceDetailControllerRef.current = controller;
    const requestId = ++traceDetailRequestRef.current;
    setSelectedTrace(null);
    setTraceDetailError('');
    setTraceDetailLoading(true);
    try {
      const value = await api.getOperationTrace(trace.trace_id, controller.signal);
      if (requestId === traceDetailRequestRef.current) setSelectedTrace(value);
    } catch (cause) {
      if ((cause as Error).name !== 'AbortError' && requestId === traceDetailRequestRef.current) setTraceDetailError((cause as Error).message || 'Trace evidence unavailable');
    } finally {
      if (requestId === traceDetailRequestRef.current) setTraceDetailLoading(false);
    }
  }, []);
  const runConfirmed = async () => {
    if (!confirmation || busy) return;
    setBusy(true);
    setError('');
    try {
      let response: unknown;
      if (confirmation.kind === 'create') {
        const fetchResponse = await fetch('/observations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildCreateObservationPayload({ title, content, type, project, sessionId, topicKey })),
        });
        if (!fetchResponse.ok) {
          setError(presentStoredText(await fetchResponse.text(), 240));
          return;
        }
        response = await fetchResponse.json();
        setTitle('');
        setContent('');
      } else if (confirmation.kind === 'graph') {
        response = await api.rebuildGraph({ project: project || undefined });
      } else {
        response = await api.rebuildIndex({ project: project || undefined, reason: 'dashboard', process_limit: 0 });
      }
      setResult(response);
      setConfirmation(null);
      await load();
    } catch (cause) {
      setError(presentStoredText((cause as Error).message, 240));
    } finally {
      setBusy(false);
    }
  };
  const targetOptions = useMemo(() => Array.from(new Set(traces.map((trace) => trace.target))).sort(), [traces]);
  const presentation = roomCopy[room];
  const filtersResolved = !filtersLoading && validatedFiltersProject === project;
  const filterResourceState = filtersError && filtersResolved ? 'error' : !filtersResolved ? 'loading' : filters && (filters.projects.length || filters.sessions.length || filters.topic_keys.length) ? 'ready' : 'empty';
  return (
    <section className="control-room" aria-labelledby="control-room-heading">
      <header className="control-room-header">
        <div>
          <span>{presentation.kicker}</span>
          <h1 id="control-room-heading">{presentation.title}</h1>
          <p>{presentation.description}</p>
        </div>
        <div className="control-room-scope" data-resource-state={filterResourceState}>
          <GuidedSelect
            label="Project"
            value={project || undefined}
            options={buildHumanOptions(filters?.projects ?? [], (value) => value)}
            allLabel="All projects"
            emptyMessage="No projects found"
            loading={!filtersResolved}
            disabled={!filtersResolved}
            onChange={(value) => {
              setProject(value ?? '');
              setSessionId('');
              setTopicKey('');
            }}
          />
          {!filtersResolved && <small>Loading choices…</small>}
          {filtersError && filtersResolved && (
            <small role="alert">
              Choices unavailable.{' '}
              <button type="button" onClick={() => setFiltersReloadKey((key) => key + 1)}>Retry</button>
            </small>
          )}
        </div>
        <button type="button" onClick={() => void load()}><RefreshCw /> Refresh view</button>
      </header>
      {room === 'operations' && (
        <div className="admin-scope-row">
          <GuidedSelect
            label="Session"
            value={sessionId || undefined}
            options={buildHumanOptions(filters?.sessions ?? [], (value) => value)}
            allLabel="No specific session"
            emptyMessage="No sessions found"
            loading={!filtersResolved}
            disabled={!filtersResolved}
            onChange={(value) => setSessionId(value ?? '')}
          />
          <GuidedSelect
            label="Topic"
            value={topicKey || undefined}
            options={buildHumanOptions(filters?.topic_keys ?? [], (value) => value)}
            allLabel="No specific topic"
            emptyMessage="No topics found"
            loading={!filtersResolved}
            disabled={!filtersResolved}
            onChange={(value) => setTopicKey(value ?? '')}
          />
        </div>
      )}
      {error && (
        <div className="command-evidence degraded" role="alert">
          <AlertTriangle />
          <span>This action could not be completed. {error}</span>
        </div>
      )}
      {room === 'operations' && (
        <OperationsPanel
          busy={busy}
          title={title}
          content={content}
          type={type}
          operations={operations}
          onTitle={setTitle}
          onContent={setContent}
          onType={setType}
          onCreate={() => setConfirmation({
            kind: 'create',
            title: 'Save this memory?',
            description: `Saves one ${presentObservationType(type).toLocaleLowerCase()} in ${project || 'all projects'}${sessionId ? ` / ${sessionId}` : ''}${topicKey ? ` / ${topicKey}` : ''}.`,
          })}
        />
      )}
      {room === 'traces' && (
        <TracesPanel
          traces={traces}
          selected={selectedTrace}
          detailLoading={traceDetailLoading}
          detailError={traceDetailError}
          origin={origin}
          status={status}
          target={target}
          targets={targetOptions}
          onOrigin={setOrigin}
          onStatus={setStatus}
          onTarget={setTarget}
          onSelect={(trace) => void openTrace(trace)}
        />
      )}
      {room === 'indexing' && (
        <IndexingPanel
          busy={busy}
          index={index}
          onGraph={() => setConfirmation({
            kind: 'graph',
            title: 'Refresh memory connections?',
            description: `Rebuilds derived connections for ${project || 'all projects'} without changing saved memories.`,
          })}
          onIndex={() => setConfirmation({
            kind: 'index',
            title: 'Refresh meaning-based search?',
            description: `Prepares meaning-based search again for ${project || 'all projects'} without changing saved memories.`,
          })}
        />
      )}
      {result !== null && (
        <section className="command-evidence" aria-live="polite">
          <h2><CheckCircle2 /> Completed</h2>
          <p>The requested change finished successfully.</p>
          <details className="technical-disclosure">
            <summary>Technical evidence</summary>
            <pre>{formatBoundedResult(result)}</pre>
          </details>
        </section>
      )}
      <ConfirmCommandDialog
        open={Boolean(confirmation)}
        title={confirmation?.title ?? ''}
        description={confirmation?.description ?? ''}
        pending={busy}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => void runConfirmed()}
      />
    </section>
  );
}
