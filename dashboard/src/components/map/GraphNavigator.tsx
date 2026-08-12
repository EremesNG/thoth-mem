import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { AtlasLevel, VizEdge, VizNode } from '../../api/client.js';
import { presentNodeKind, presentRelation } from '../dashboard-presentation.js';
import { presentStoredText } from '../safe-presentation.js';

interface GraphNavigatorProps {
  nodes: VizNode[];
  edges: VizEdge[];
  focusNodeId: string | null;
  onFocus: (nodeId: string) => void;
  onExpand: (nodeId: string) => void;
  onIntent?: (nodeId: string) => void;
  level?: AtlasLevel | 'raw';
}

const DENSE_NAVIGATOR_THRESHOLD = 32;
const DENSE_NAVIGATOR_CHUNK_SIZE = 32;

interface GraphNavigatorRowProps {
  node: VizNode;
  relation: string | undefined;
  active: boolean;
  onFocus: (nodeId: string) => void;
  onExpand: (nodeId: string) => void;
  onIntent?: (nodeId: string) => void;
}

function GraphNavigatorRow({ node, relation, active, onFocus, onExpand, onIntent }: GraphNavigatorRowProps) {
  const summary = `${presentNodeKind(node.kind)}: ${presentStoredText(node.label)}${relation ? `, ${presentRelation(relation)}` : ''}`;
  return (
    <li data-node-id={node.id} className={active ? 'active' : ''}>
      <button
        type="button"
        aria-current={active ? 'true' : undefined}
        onClick={() => onFocus(node.id)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          onFocus(node.id);
        }}
        onPointerEnter={() => onIntent?.(node.id)}
        onFocus={() => onIntent?.(node.id)}
      >
        {summary}
      </button>
      <button type="button" className="navigator-expand" onClick={() => onExpand(node.id)} aria-label={`Explore connections from ${presentStoredText(node.label)}`}>+</button>
    </li>
  );
}

interface DenseNavigatorChunkProps {
  rows: Array<{ node: VizNode; relation: string | undefined }>;
  onFocus: (nodeId: string) => void;
  onExpand: (nodeId: string) => void;
  onIntent?: (nodeId: string) => void;
}

const DenseNavigatorChunk = memo(function DenseNavigatorChunk({ rows, onFocus, onExpand, onIntent }: DenseNavigatorChunkProps) {
  return rows.map(({ node, relation }) => (
    <GraphNavigatorRow
      key={node.id}
      node={node}
      relation={relation}
      active={false}
      onFocus={onFocus}
      onExpand={onExpand}
      onIntent={onIntent}
    />
  ));
}, (previous, next) => (
  previous.onFocus === next.onFocus
  && previous.onExpand === next.onExpand
  && previous.onIntent === next.onIntent
  && previous.rows.length === next.rows.length
  && previous.rows.every((row, index) => (
    row.node === next.rows[index]?.node
    && row.relation === next.rows[index]?.relation
  ))
));

export function buildGraphNavigationIndex(nodes: VizNode[], edges: VizEdge[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const relationByNodeId = new Map<string, string>();
  const adjacencySets = new Map(nodes.map((node) => [node.id, new Set<string>()]));

  for (const edge of edges) {
    if (!nodeById.has(edge.source_id) || !nodeById.has(edge.target_id)) continue;
    if (!relationByNodeId.has(edge.source_id)) relationByNodeId.set(edge.source_id, edge.relation);
    if (!relationByNodeId.has(edge.target_id)) relationByNodeId.set(edge.target_id, edge.relation);
    if (edge.source_id === edge.target_id) continue;
    adjacencySets.get(edge.source_id)?.add(edge.target_id);
    adjacencySets.get(edge.target_id)?.add(edge.source_id);
  }
  const adjacency = new Map(
    [...adjacencySets].map(([nodeId, neighbors]) => [nodeId, [...neighbors].sort()]),
  );

  return {
    nodeById,
    relationByNodeId,
    adjacency,
    nodeIds: nodes.map((node) => node.id),
  };
}

function GraphNavigator({ nodes, edges, focusNodeId, onFocus, onExpand, onIntent, level = 'raw' }: GraphNavigatorProps) {
  const navigatorRef = useRef<HTMLElement>(null);
  const datasetKey = `${level}:${nodes.length}:${nodes[0]?.id ?? ''}:${nodes[nodes.length - 1]?.id ?? ''}`;
  const [denseRenderState, setDenseRenderState] = useState({
    datasetKey,
    limit: DENSE_NAVIGATOR_THRESHOLD,
  });
  const denseRenderLimit = denseRenderState.datasetKey === datasetKey
    ? denseRenderState.limit
    : DENSE_NAVIGATOR_THRESHOLD;
  const index = useMemo(() => buildGraphNavigationIndex(nodes, edges), [edges, nodes]);
  const retainsCompleteList = level !== 'neighborhood'
    && index.nodeIds.length >= DENSE_NAVIGATOR_THRESHOLD;
  const denseIds = useMemo(() => {
    if (!retainsCompleteList) return [];
    const ids = index.nodeIds.slice(0, denseRenderLimit);
    if (focusNodeId && !ids.includes(focusNodeId) && index.nodeById.has(focusNodeId)) ids.push(focusNodeId);
    return ids;
  }, [denseRenderLimit, focusNodeId, index, retainsCompleteList]);
  const visibleIds = retainsCompleteList
    ? denseIds
    : level === 'neighborhood'
      ? index.nodeIds
      : focusNodeId
      ? [focusNodeId, ...(index.adjacency.get(focusNodeId) ?? [])]
      : index.nodeIds;
  const denseListComplete = !retainsCompleteList || denseRenderLimit >= index.nodeIds.length;
  const heading = level === 'universe'
    ? 'Constellations'
    : level === 'community'
      ? 'Memories in this constellation'
      : level === 'neighborhood'
        ? 'Neighborhood evidence'
        : retainsCompleteList
          ? 'All graph entities'
          : 'Nearby graph entities';

  useEffect(() => {
    if (denseRenderState.datasetKey !== datasetKey) {
      setDenseRenderState({ datasetKey, limit: DENSE_NAVIGATOR_THRESHOLD });
      return;
    }
    if (!retainsCompleteList) {
      if (denseRenderLimit !== DENSE_NAVIGATOR_THRESHOLD) {
        setDenseRenderState({ datasetKey, limit: DENSE_NAVIGATOR_THRESHOLD });
      }
      return;
    }
    if (index.nodeIds.length < denseRenderLimit) {
      setDenseRenderState({ datasetKey, limit: index.nodeIds.length });
      return;
    }
    if (denseRenderLimit >= index.nodeIds.length) return;
    const frame = requestAnimationFrame(() => {
      setDenseRenderState((current) => ({
        datasetKey,
        limit: Math.min(
          index.nodeIds.length,
          current.datasetKey === datasetKey ? current.limit + DENSE_NAVIGATOR_CHUNK_SIZE : DENSE_NAVIGATOR_THRESHOLD,
        ),
      }));
    });
    return () => cancelAnimationFrame(frame);
  }, [datasetKey, denseRenderLimit, denseRenderState.datasetKey, index.nodeIds.length, retainsCompleteList]);

  const completeRows = useMemo(() => {
    if (!retainsCompleteList) return null;
    const chunks = [];
    for (let start = 0; start < denseIds.length; start += DENSE_NAVIGATOR_CHUNK_SIZE) {
      const rows = denseIds
        .slice(start, start + DENSE_NAVIGATOR_CHUNK_SIZE)
        .flatMap((id) => {
          const node = index.nodeById.get(id);
          return node ? [{ node, relation: index.relationByNodeId.get(id) }] : [];
        });
      if (rows.length) {
        chunks.push(
          <DenseNavigatorChunk
            key={rows[0].node.id}
            rows={rows}
            onFocus={onFocus}
                onExpand={onExpand}
                onIntent={onIntent}
          />,
        );
      }
    }
    return chunks;
  }, [denseIds, index, onExpand, onFocus, onIntent, retainsCompleteList]);

  useLayoutEffect(() => {
    if (!retainsCompleteList) return;
    const navigator = navigatorRef.current;
    if (!navigator) return;
    const current = navigator.querySelector('li.active');
    current?.classList.remove('active');
    current?.querySelector('button')?.removeAttribute('aria-current');
    if (!focusNodeId) return;
    const next = navigator.querySelector<HTMLElement>(`li[data-node-id="${CSS.escape(focusNodeId)}"]`);
    next?.classList.add('active');
    next?.querySelector('button')?.setAttribute('aria-current', 'true');
  }, [completeRows, focusNodeId, retainsCompleteList]);

  return (
    <section
      ref={navigatorRef}
      className="graph-navigator"
      aria-labelledby="graph-navigator-heading"
      data-semantic-graph="true"
      data-list-mode={retainsCompleteList ? denseListComplete ? 'complete' : 'streaming' : 'neighborhood'}
      data-total-count={index.nodeIds.length}
      data-visible-count={visibleIds.length}
      data-focus-id={focusNodeId ?? ''}
      data-atlas-level={level}
    >
      <header>
        <h3 id="graph-navigator-heading">{heading}</h3>
        <span>{retainsCompleteList && !denseListComplete ? `${visibleIds.length} of ${index.nodeIds.length}` : `${visibleIds.length} in this trail`}</span>
      </header>
      <p className="sr-only">Choose an item in the active atlas level. Each row lets you open it or reveal its connections.</p>
      <ul>
        {completeRows ?? visibleIds.map((id) => {
          const node = index.nodeById.get(id);
          if (!node) return null;
          return (
            <GraphNavigatorRow
              key={id}
              node={node}
              relation={index.relationByNodeId.get(id)}
              active={id === focusNodeId}
              onFocus={onFocus}
              onExpand={onExpand}
              onIntent={onIntent}
            />
          );
        })}
      </ul>
    </section>
  );
}

export default memo(GraphNavigator);
