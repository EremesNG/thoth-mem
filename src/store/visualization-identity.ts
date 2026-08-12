import { createHash } from 'node:crypto';

const VISUALIZATION_IDENTITY_VERSION = 'thoth-visualization-v2';
const FACET_IDENTITY_VERSION = 'semantic-atlas-facet-v1';

export type VisualizationIdentityKind =
  | 'session'
  | 'project'
  | 'topic'
  | 'fact'
  | 'ref'
  | 'edge'
  | 'community';

export type VisualizationFacetKind = 'project' | 'session' | 'topic';

function normalizeCanonicalValue(value: string): string {
  return value.normalize('NFC');
}

function digestTuple(version: string, kind: string, canonicalValue: string): string {
  return createHash('sha256')
    .update(version)
    .update('\0')
    .update(kind)
    .update('\0')
    .update(normalizeCanonicalValue(canonicalValue))
    .digest('hex');
}

export function deriveVisualizationId(kind: VisualizationIdentityKind, canonicalValue: string): string {
  return `${kind}:${digestTuple(VISUALIZATION_IDENTITY_VERSION, kind, canonicalValue)}`;
}

export function deriveVisualizationEdgeId(
  sourceId: string,
  relation: string,
  targetId: string,
  discriminator = '',
): string {
  return deriveVisualizationId('edge', `${sourceId}\0${relation}\0${targetId}\0${discriminator}`);
}

export function deriveVisualizationFacetToken(kind: VisualizationFacetKind, canonicalValue: string): string {
  return `facet:${kind}:${digestTuple(FACET_IDENTITY_VERSION, kind, canonicalValue)}`;
}

export class VisualizationIdentityRegistry {
  readonly #tuplesById = new Map<string, string>();

  register(kind: VisualizationIdentityKind, canonicalValue: string): string {
    const normalized = normalizeCanonicalValue(canonicalValue);
    const tuple = `${kind}\0${normalized}`;
    const id = deriveVisualizationId(kind, normalized);
    const existing = this.#tuplesById.get(id);
    if (existing !== undefined && existing !== tuple) {
      throw new Error(`Visualization identity collision for ${kind}.`);
    }
    this.#tuplesById.set(id, tuple);
    return id;
  }
}
