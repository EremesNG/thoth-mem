import type { VizEdge, VizNode, VizSemanticState } from '../../api/client.js';
import { presentStoredText } from '../safe-presentation.js';

export type GraphViewportCommand = 'fit' | 'zoom-in' | 'zoom-out' | 'reset' | 'toggle-pause' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down';
export type GraphCommand = GraphViewportCommand | 'clear' | 'next' | 'previous' | 'select' | 'expand';

const KEY_COMMANDS: Record<string, GraphCommand> = {
  '0': 'fit', '+': 'zoom-in', '=': 'zoom-in', '-': 'zoom-out', r: 'reset', p: 'toggle-pause',
  Escape: 'clear', ArrowDown: 'next', ArrowRight: 'next', ArrowUp: 'previous', ArrowLeft: 'previous', Enter: 'select', e: 'expand',
  h: 'pan-left', l: 'pan-right', k: 'pan-up', j: 'pan-down',
};

export function graphCommandForKey(key: string): GraphCommand | null {
  return KEY_COMMANDS[key] ?? KEY_COMMANDS[key.toLowerCase()] ?? null;
}

export function buildAdjacency(nodes: VizNode[], edges: VizEdge[]): Map<string, string[]> {
  const visible = new Set(nodes.map((node) => node.id));
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!visible.has(edge.source_id) || !visible.has(edge.target_id)) continue;
    adjacency.get(edge.source_id)?.push(edge.target_id);
    adjacency.get(edge.target_id)?.push(edge.source_id);
  }
  for (const neighbors of adjacency.values()) neighbors.sort();
  return adjacency;
}

export function connectedNodeIds(focusId: string | null, nodes: VizNode[], edges: VizEdge[]): string[] {
  if (!focusId) return nodes.map((node) => node.id);
  return [focusId, ...(buildAdjacency(nodes, edges).get(focusId) ?? [])];
}

export type NodeEmphasis = 'focused' | 'neighbor' | 'unrelated' | 'default' | 'degraded';

export function nodeEmphasis(nodeId: string, focusId: string | null, edges: VizEdge[], health: VizSemanticState): NodeEmphasis {
  if (health === 'degraded') return 'degraded';
  if (!focusId) return 'default';
  if (nodeId === focusId) return 'focused';
  const neighbor = edges.some((edge) => (edge.source_id === focusId && edge.target_id === nodeId) || (edge.target_id === focusId && edge.source_id === nodeId));
  return neighbor ? 'neighbor' : 'unrelated';
}

export function accessibleNodeSummary(node: VizNode, relation?: string): string {
  return [node.kind, presentStoredText(node.label), node.type, relation].filter(Boolean).join(', ');
}
