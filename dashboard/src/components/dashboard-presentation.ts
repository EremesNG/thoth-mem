import type { ObservationType, VizNode } from '../api/client.js';
import { presentStoredText } from './safe-presentation.js';

const nodeKinds: Record<VizNode['kind'], string> = {
  observation: 'Memory',
  fact: 'Learned fact',
  session: 'Work session',
  project: 'Project',
  topic: 'Topic',
};

const observationTypes: Record<ObservationType, string> = {
  decision: 'Decision',
  architecture: 'Architecture choice',
  bugfix: 'Fix',
  pattern: 'Reusable pattern',
  config: 'Configuration',
  discovery: 'Discovery',
  learning: 'Learning',
  session_summary: 'Session recap',
  manual: 'Note',
};

const relations: Record<string, string> = {
  HAS_TYPE: 'is categorized as',
  IN_PROJECT: 'belongs to a project',
  HAS_TOPIC_KEY: 'covers a topic',
  HAS_WHAT: 'captures what happened',
  HAS_WHY: 'explains why',
  HAS_WHERE: 'references a location',
  HAS_LEARNED: 'records a learning',
  SIMILAR_TO: 'resembles',
  SUPPORTS: 'supports',
  CONTRADICTS: 'challenges',
  DERIVED_FROM: 'comes from',
  SUPERSEDES: 'replaces',
  RELATES_TO: 'relates to',
};

const surfaces = {
  map: 'Explore',
  recall: 'Find related',
  timeline: 'Follow the story',
  ledger: 'See what changed',
  health: 'Check readiness',
} as const;

const densities = {
  focus: 'Close',
  balanced: 'Balanced',
  wide: 'Wide',
} as const;

const filterKeys: Record<string, string> = {
  project: 'Project',
  session_id: 'Session',
  topic_key: 'Topic',
  type: 'Memory type',
  relation: 'Connection',
  query: 'Search',
  density: 'Field of view',
};

const resourceStates: Record<string, { label: string; explanation: string }> = {
  loading: { label: 'Gathering memories', explanation: 'This view will update as soon as the memories arrive.' },
  empty: { label: 'Nothing here yet', explanation: 'Try widening the view or removing a filter.' },
  sparse: { label: 'A small constellation', explanation: 'Only a few matching memories are connected here.' },
  dense: { label: 'A rich constellation', explanation: 'Focus a memory to reveal its closest connections.' },
  truncated: { label: 'More memories are available', explanation: 'Explore connections to bring the next nearby memories into view.' },
  exhausted: { label: 'You reached the edge', explanation: 'No more connected memories match this view.' },
  degraded: { label: 'Some memories are still preparing', explanation: 'Available results remain usable while background work finishes.' },
  aborted: { label: 'The previous view was replaced', explanation: 'Only the latest selection will be shown.' },
  error: { label: 'This view needs another try', explanation: 'Retry when you are ready; your current scope is preserved.' },
  'failed-inspection': { label: 'Details are temporarily unavailable', explanation: 'The constellation remains available while you retry the details.' },
};

function readableFallback(value: string, fallback: string): string {
  const safe = presentStoredText(value, 72).trim();
  if (!safe) return fallback;
  const words = safe.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toLocaleLowerCase();
  return `${words.charAt(0).toLocaleUpperCase()}${words.slice(1)}`;
}

export function presentNodeKind(value: string): string {
  const safe = presentStoredText(value, 72).trim();
  return nodeKinds[safe as VizNode['kind']] ?? readableFallback(safe, 'Memory');
}

export function presentObservationType(value: string): string {
  const safe = presentStoredText(value, 72).trim();
  return observationTypes[safe as ObservationType] ?? readableFallback(safe, 'Memory');
}

export function presentRelation(value: string): string {
  const safe = presentStoredText(value, 72).trim();
  return relations[safe.toLocaleUpperCase()] ?? readableFallback(safe, 'Related');
}

export function presentSurface(value: string): string {
  return surfaces[value as keyof typeof surfaces] ?? readableFallback(value, 'Explore');
}

export function presentDensity(value: string): string {
  return densities[value as keyof typeof densities] ?? readableFallback(value, 'Balanced');
}

export function presentFilterKey(value: string): string {
  return filterKeys[value] ?? readableFallback(value, 'Filter');
}

export function presentResourceState(value: string): { label: string; explanation: string } {
  return resourceStates[value] ?? {
    label: readableFallback(value, 'View update'),
    explanation: 'The view is keeping your current scope while this state is resolved.',
  };
}

function finishSentence(value: string): string {
  const clean = value.trim().replace(/[,:;\s]+$/, '');
  if (!clean) return '';
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

export function presentMemorySummary(value: unknown, maxLength = 320): string {
  const safe = presentStoredText(value, 1_200).replace(/\b[a-f0-9]{20,}\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const fields = new Map<string, string>();
  const pattern = /\*\*(What|Why|Where|Learned)\*\*\s*:\s*(.*?)(?=\s*\*\*(?:What|Why|Where|Learned)\*\*\s*:|$)/gi;
  for (const match of safe.matchAll(pattern)) fields.set(match[1].toLocaleLowerCase(), match[2].trim());
  const what = finishSentence(fields.get('what') ?? '');
  const learned = finishSentence(fields.get('learned') ?? '');
  const why = finishSentence(fields.get('why') ?? '');
  const structured = [what, learned ? `Learned: ${learned}` : '', !what && !learned ? why : ''].filter(Boolean).join(' ');
  const fallback = safe.replace(/\*\*|__|`|^#+\s*/g, '').replace(/\s+/g, ' ').trim();
  return presentStoredText(structured || fallback, maxLength);
}

export function buildHumanOptions(values: string[], labeler: (value: string) => string): Array<{ value: string; label: string; searchText: string }> {
  const provisional = values.map((value) => ({ value, label: presentStoredText(labeler(value), 72), searchText: presentStoredText(value, 72) }));
  const counts = new Map<string, number>();
  for (const option of provisional) {
    const key = option.label.toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return provisional.map((option) => ({
    ...option,
    label: counts.get(option.label.toLocaleLowerCase()) === 1
      ? option.label
      : presentStoredText(`${option.label} · ${option.searchText}`, 96),
  }));
}
