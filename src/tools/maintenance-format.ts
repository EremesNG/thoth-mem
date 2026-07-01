import type { MaintenanceEvidence } from '../retrieval/ranking.js';
import type { ObservationMaintenanceEvidence } from '../store/index.js';

export function formatMaintenanceEvidence(evidence: MaintenanceEvidence | undefined): string | null {
  if (!evidence) {
    return null;
  }

  const parts: string[] = [];
  if (evidence.consolidation) {
    parts.push([
      'consolidation',
      `cluster=${evidence.consolidation.clusterKey}`,
      `canonical=obs:${evidence.consolidation.canonicalId}`,
      `sources=${evidence.consolidation.memberIds.map((id) => `obs:${id}`).join(',')}`,
      evidence.consolidation.suppressedSourceIds.length > 0
        ? `suppressed=${evidence.consolidation.suppressedSourceIds.map((id) => `obs:${id}`).join(',')}`
        : null,
      `reason=${evidence.consolidation.reasonClass}`,
    ].filter((part): part is string => part !== null).join(' '));
  }
  if (evidence.reflection) {
    parts.push([
      'reflection',
      `sources=${evidence.reflection.sourceIds.map((id) => `obs:${id}`).join(',')}`,
      `reason=${evidence.reflection.reasonClass}`,
    ].join(' '));
  }
  if (evidence.decay) {
    parts.push([
      'decay',
      `state=${evidence.decay.state}`,
      `score=${evidence.decay.scoreMultiplier}`,
      `reason=${evidence.decay.reasonClass}`,
    ].join(' '));
  }

  return parts.length > 0 ? `maintenance: ${parts.join('; ')}` : null;
}

export function formatObservationMaintenanceEvidence(evidence: ObservationMaintenanceEvidence | undefined): string | null {
  if (!evidence) {
    return null;
  }

  const parts: string[] = [];
  if (evidence.consolidation) {
    parts.push([
      'consolidation',
      `cluster=${evidence.consolidation.clusterKey}`,
      `canonical=obs:${evidence.consolidation.canonicalId}`,
      `sources=${evidence.consolidation.memberIds.map((id) => `obs:${id}`).join(',')}`,
      `reason=${evidence.consolidation.reasonClass}`,
    ].join(' '));
  }
  if (evidence.reflection) {
    parts.push([
      'reflection',
      `sources=${evidence.reflection.sourceIds.map((id) => `obs:${id}`).join(',')}`,
      `reason=${evidence.reflection.reasonClass}`,
    ].join(' '));
  }
  if (evidence.decay) {
    parts.push([
      'decay',
      `state=${evidence.decay.state}`,
      `score=${evidence.decay.scoreMultiplier}`,
      `reason=${evidence.decay.reasonClass}`,
    ].join(' '));
  }

  return parts.length > 0 ? parts.join('; ') : null;
}
