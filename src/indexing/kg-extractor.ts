import { createHash } from 'node:crypto';

export const KG_TAXONOMY_VERSION = 'v1';

export const KG_ENTITY_TYPES = [
  'person', 'organization', 'team', 'project', 'service', 'system', 'component', 'module', 'api', 'endpoint', 'credential',
  'secret', 'dataset', 'document', 'file', 'path', 'environment', 'region', 'model', 'provider', 'issue', 'task', 'decision',
  'event', 'tool', 'policy',
] as const;

export const KG_RELATION_TYPES = [
  'USES', 'DEPENDS_ON', 'BELONGS_TO', 'PART_OF', 'OWNS', 'CONFIGURES', 'IMPLEMENTS', 'RUNS_IN', 'DEPLOYS_TO', 'CAUSES',
  'FIXES', 'BLOCKS', 'UNBLOCKS', 'AFFECTS', 'REFERENCES', 'MENTIONS', 'EXTRACTED_FROM', 'HAS_TOPIC', 'HAS_SCOPE', 'PRECEDES',
  'FOLLOWS', 'AUTHENTICATES_WITH',
] as const;

export interface ExtractedTriple {
  subject: string;
  subjectType: string;
  relation: string;
  object: string;
  objectType: string;
  provenance: string;
  confidence: number;
  tripleHash: string;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function hashTriple(subject: string, relation: string, object: string): string {
  return createHash('sha256').update(`${subject}|${relation}|${object}`).digest('hex');
}

export function extractKnowledgeTriples(input: { content: string; provenance: string }): {
  taxonomy: { entityTypes: string[]; relationTypes: string[]; version: string };
  triples: ExtractedTriple[];
  dedupeKey: string;
} {
  const normalizedContent = normalize(input.content);
  const tokens = normalizedContent.split(/[^a-z0-9_./:-]+/).filter((t) => t.length >= 3);
  const triples: ExtractedTriple[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < tokens.length - 2; i += 1) {
    const subject = tokens[i];
    const relationCandidate = tokens[i + 1];
    const object = tokens[i + 2];
    let relation = 'MENTIONS';

    if (relationCandidate === 'uses' || relationCandidate === 'using') relation = 'USES';
    if (relationCandidate === 'in' || relationCandidate === 'within') relation = 'RUNS_IN';
    if (relationCandidate === 'belongs') relation = 'BELONGS_TO';
    if (relationCandidate === 'depends') relation = 'DEPENDS_ON';
    if (relationCandidate === 'blocks') relation = 'BLOCKS';
    if (relationCandidate === 'fixes' || relationCandidate === 'fixed') relation = 'FIXES';

    const tripleHash = hashTriple(subject, relation, object);
    if (seen.has(tripleHash)) {
      continue;
    }

    seen.add(tripleHash);
    triples.push({
      subject,
      subjectType: 'entity',
      relation,
      object,
      objectType: 'entity',
      provenance: input.provenance,
      confidence: 0.5,
      tripleHash,
    });
  }

  return {
    taxonomy: {
      entityTypes: [...KG_ENTITY_TYPES],
      relationTypes: [...KG_RELATION_TYPES],
      version: KG_TAXONOMY_VERSION,
    },
    triples,
    dedupeKey: `kg:${createHash('sha256').update(normalizedContent).digest('hex').slice(0, 24)}`,
  };
}
