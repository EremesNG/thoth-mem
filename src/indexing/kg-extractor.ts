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
  'FOLLOWS', 'AUTHENTICATES_WITH', 'HAS_WHAT', 'HAS_WHY', 'HAS_WHERE', 'HAS_LEARNED',
] as const;

type EntityType = typeof KG_ENTITY_TYPES[number];
type RelationType = typeof KG_RELATION_TYPES[number];
const KG_RELATION_TYPE_SET = new Set<string>(KG_RELATION_TYPES);

export interface ExtractedTriple {
  subject: string;
  subjectType: EntityType;
  relation: RelationType;
  object: string;
  objectType: EntityType;
  provenance: string;
  confidence: number;
  tripleHash: string;
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with',
  'via', 'when', 'where', 'while', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'should', 'must',
]);

const RELATION_PATTERNS: Array<{
  tokens: string[];
  relation: RelationType;
  confidence: number;
  reverseDirection?: boolean;
  skipIfNextTokenIs?: string;
}> = [
  { tokens: ['authenticates', 'with'], relation: 'AUTHENTICATES_WITH', confidence: 0.82 },
  { tokens: ['authenticate', 'with'], relation: 'AUTHENTICATES_WITH', confidence: 0.82 },
  { tokens: ['authenticated', 'with'], relation: 'AUTHENTICATES_WITH', confidence: 0.82 },
  { tokens: ['depends', 'on'], relation: 'DEPENDS_ON', confidence: 0.8 },
  { tokens: ['depend', 'on'], relation: 'DEPENDS_ON', confidence: 0.8 },
  { tokens: ['requires'], relation: 'DEPENDS_ON', confidence: 0.78 },
  { tokens: ['require'], relation: 'DEPENDS_ON', confidence: 0.78 },
  { tokens: ['backed', 'by'], relation: 'DEPENDS_ON', confidence: 0.78 },
  { tokens: ['powered', 'by'], relation: 'DEPENDS_ON', confidence: 0.76 },
  { tokens: ['belongs', 'to'], relation: 'BELONGS_TO', confidence: 0.8 },
  { tokens: ['part', 'of'], relation: 'PART_OF', confidence: 0.78 },
  { tokens: ['runs', 'in'], relation: 'RUNS_IN', confidence: 0.78 },
  { tokens: ['run', 'in'], relation: 'RUNS_IN', confidence: 0.78 },
  { tokens: ['deploys', 'to'], relation: 'DEPLOYS_TO', confidence: 0.8 },
  { tokens: ['deployed', 'to'], relation: 'DEPLOYS_TO', confidence: 0.8 },
  { tokens: ['owned', 'by'], relation: 'OWNS', confidence: 0.72, reverseDirection: true },
  { tokens: ['blocked', 'by'], relation: 'BLOCKS', confidence: 0.74, reverseDirection: true },
  { tokens: ['fixed', 'by'], relation: 'FIXES', confidence: 0.74, reverseDirection: true },
  { tokens: ['caused', 'by'], relation: 'CAUSES', confidence: 0.72, reverseDirection: true },
  { tokens: ['configured', 'by'], relation: 'CONFIGURES', confidence: 0.74, reverseDirection: true },
  { tokens: ['implemented', 'by'], relation: 'IMPLEMENTS', confidence: 0.74, reverseDirection: true },
  { tokens: ['belongs-to'], relation: 'BELONGS_TO', confidence: 0.82 },
  { tokens: ['depends-on'], relation: 'DEPENDS_ON', confidence: 0.82 },
  { tokens: ['part-of'], relation: 'PART_OF', confidence: 0.8 },
  { tokens: ['runs-in'], relation: 'RUNS_IN', confidence: 0.8 },
  { tokens: ['deploys-to'], relation: 'DEPLOYS_TO', confidence: 0.82 },
  { tokens: ['authenticates-with'], relation: 'AUTHENTICATES_WITH', confidence: 0.84 },
  { tokens: ['uses'], relation: 'USES', confidence: 0.76 },
  { tokens: ['using'], relation: 'USES', confidence: 0.74 },
  { tokens: ['configures'], relation: 'CONFIGURES', confidence: 0.78 },
  { tokens: ['configured'], relation: 'CONFIGURES', confidence: 0.74, skipIfNextTokenIs: 'by' },
  { tokens: ['implements'], relation: 'IMPLEMENTS', confidence: 0.78 },
  { tokens: ['implemented'], relation: 'IMPLEMENTS', confidence: 0.74, skipIfNextTokenIs: 'by' },
  { tokens: ['fixes'], relation: 'FIXES', confidence: 0.76 },
  { tokens: ['fixed'], relation: 'FIXES', confidence: 0.74, skipIfNextTokenIs: 'by' },
  { tokens: ['blocks'], relation: 'BLOCKS', confidence: 0.76 },
  { tokens: ['unblocks'], relation: 'UNBLOCKS', confidence: 0.76 },
  { tokens: ['causes'], relation: 'CAUSES', confidence: 0.74 },
  { tokens: ['affects'], relation: 'AFFECTS', confidence: 0.72 },
  { tokens: ['references'], relation: 'REFERENCES', confidence: 0.7 },
  { tokens: ['mentions'], relation: 'MENTIONS', confidence: 0.65 },
];

const STRUCTURED_SECTION_RELATIONS: Record<string, RelationType> = {
  what: 'HAS_WHAT',
  why: 'HAS_WHY',
  where: 'HAS_WHERE',
  learned: 'HAS_LEARNED',
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function hashTriple(subject: string, relation: string, object: string): string {
  return createHash('sha256').update(`${subject}|${relation}|${object}`).digest('hex');
}

function tokenize(content: string): string[] {
  return normalize(content).split(/[^a-z0-9_./:-]+/).filter((token) => token.length > 0);
}

function splitRelationSegments(content: string): string[] {
  return content
    .split(/[\r\n]+|(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function cleanEntityTokens(tokens: string[]): string[] {
  const cleaned = tokens
    .map((token) => token.replace(/^[,.;:!?'"`]+|[,.;:!?'"`]+$/g, ''))
    .filter((token) => token.length > 0);
  while (cleaned.length > 0 && STOPWORDS.has(cleaned[0])) {
    cleaned.shift();
  }
  while (cleaned.length > 0 && STOPWORDS.has(cleaned[cleaned.length - 1])) {
    cleaned.pop();
  }
  return cleaned.filter((token) => token.length > 1);
}

function entityFromTokens(tokens: string[], start: number, end: number): string | null {
  const cleaned = cleanEntityTokens(tokens.slice(start, end));
  if (cleaned.length === 0) {
    return null;
  }
  return normalize(cleaned.join(' ')).slice(0, 160);
}

function inferEntityType(value: string): EntityType {
  const text = normalize(value);

  if (/\b(api key|token|credential|service account|oauth|jwt|pat)\b/.test(text)) return 'credential';
  if (/\b(secret|password|private key)\b/.test(text)) return 'secret';
  if (/^https?:\/\//.test(text) || /\b(endpoint|route|url|webhook)\b/.test(text)) return 'endpoint';
  if (/\bapi\b/.test(text)) return 'api';
  if (/[\\/]/.test(text) && /\.[a-z0-9]+$/.test(text)) return 'file';
  if (/[\\/]/.test(text) || /^[a-z]:/.test(text)) return 'path';
  if (/\b(readme|doc|docs|document|markdown|spec)\b/.test(text)) return 'document';
  if (/\b(model|embedding|llm|gpt|nomic)\b/.test(text)) return 'model';
  if (/\b(provider|openai|ollama|azure|anthropic)\b/.test(text)) return 'provider';
  if (/\b(project|repo|repository|workspace)\b/.test(text)) return 'project';
  if (/\b(service|server|worker|daemon|mcp)\b/.test(text)) return 'service';
  if (/\b(system|engine|runtime|pipeline)\b/.test(text)) return 'system';
  if (/\b(component|adapter|connector)\b/.test(text)) return 'component';
  if (/\b(module|package|library|sdk)\b/.test(text)) return 'module';
  if (/\b(database|sqlite|dataset|index|vector store|fts)\b/.test(text)) return 'dataset';
  if (/\b(env|environment|dev|staging|prod|production|local)\b/.test(text)) return 'environment';
  if (/\b(region|eastus|westus|europe|asia)\b/.test(text)) return 'region';
  if (/\b(issue|bug|error|failure|regression|risk)\b/.test(text)) return 'issue';
  if (/\b(task|todo|job|queue)\b/.test(text)) return 'task';
  if (/\b(decision|choice|tradeoff|rationale)\b/.test(text)) return 'decision';
  if (/\b(event|release|migration|deploy)\b/.test(text)) return 'event';
  if (/\b(tool|cli|command|script)\b/.test(text)) return 'tool';
  if (/\b(policy|rule|guardrail|permission)\b/.test(text)) return 'policy';
  if (/\b(team|squad)\b/.test(text)) return 'team';
  if (/\b(org|organization|company)\b/.test(text)) return 'organization';
  if (/\b(user|author|owner|person)\b/.test(text)) return 'person';

  return 'system';
}

function extractStructuredSections(content: string): Array<{ relation: RelationType; object: string }> {
  const sections: Array<{ relation: RelationType; object: string }> = [];
  let currentRelation: RelationType | null = null;
  let currentValue: string[] = [];

  const flush = (): void => {
    if (!currentRelation) return;
    const object = currentValue.join('\n').trim();
    if (object.length > 0) {
      sections.push({ relation: currentRelation, object: object.slice(0, 500) });
    }
  };

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^(?:\*\*(What|Why|Where|Learned)\*\*|(What|Why|Where|Learned)):\s*(.*)$/i);
    if (match) {
      flush();
      currentRelation = STRUCTURED_SECTION_RELATIONS[(match[1] ?? match[2]).toLowerCase()];
      currentValue = [match[3] ?? ''];
      continue;
    }

    if (currentRelation) {
      currentValue.push(line);
    }
  }

  flush();
  return sections;
}

function extractTechnicalReferences(content: string): string[] {
  const references = new Set<string>();
  const patterns = [
    /https?:\/\/[^\s)]+/gi,
    /\b(?:src|tests|dashboard|backend|openspec|docs)\/[a-z0-9_./-]+\b/gi,
    /\b[a-z0-9_-]+\.(?:ts|tsx|js|mjs|json|md|sql|py|yml|yaml)\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      references.add(match[0].replace(/[),.;]+$/, '').toLowerCase());
    }
  }

  return [...references].slice(0, 20);
}

function highSignalMentionTokens(tokens: string[]): string[] {
  return tokens
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token))
    .filter((token) => /[./:_-]/.test(token) || /\d/.test(token) || /^(api|mcp|sqlite|vector|embedding|retrieval|provider|worker|queue|index)$/i.test(token))
    .slice(0, 20);
}

function patternMatches(tokens: string[], start: number, pattern: string[]): boolean {
  if (start + pattern.length > tokens.length) {
    return false;
  }
  return pattern.every((token, offset) => tokens[start + offset] === token);
}

function cleanExplicitEntity(value: string): string | null {
  const cleaned = normalize(
    value
      .replace(/^[\s"'`([{]+/, '')
      .replace(/[\s"'`)\]}.;,!?]+$/g, '')
  );
  if (cleaned.length === 0) {
    return null;
  }
  return cleaned.slice(0, 160);
}

function extractExplicitGraphTriples(content: string): Array<{ subject: string; relation: RelationType; object: string }> {
  const triples: Array<{ subject: string; relation: RelationType; object: string }> = [];
  const notations = [
    /^(.*?)\s*--\s*([A-Za-z_]+)\s*-->\s*(.*?)\s*$/,
    /^(.*?)\s*-\[\s*([A-Za-z_]+)\s*\]->\s*(.*?)\s*$/,
  ];

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    for (const notation of notations) {
      const match = trimmed.match(notation);
      if (!match) {
        continue;
      }

      const relation = match[2].toUpperCase();
      if (!KG_RELATION_TYPE_SET.has(relation)) {
        break;
      }

      const subject = cleanExplicitEntity(match[1]);
      const object = cleanExplicitEntity(match[3]);
      if (subject && object && subject !== object) {
        triples.push({ subject, relation: relation as RelationType, object });
      }
      break;
    }
  }

  return triples;
}

function extractStructuredTripleBlocks(content: string): Array<{ subject: string; relation: RelationType; object: string }> {
  const triples: Array<{ subject: string; relation: RelationType; object: string }> = [];
  let current: { subject?: string; relation?: string; object?: string } = {};

  const flush = (): void => {
    if (!current.subject || !current.relation || !current.object) {
      return;
    }

    const relation = current.relation.trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (!KG_RELATION_TYPE_SET.has(relation)) {
      current = {};
      return;
    }

    const subject = cleanExplicitEntity(current.subject);
    const object = cleanExplicitEntity(current.object);
    if (subject && object && subject !== object) {
      triples.push({ subject, relation: relation as RelationType, object });
    }
    current = {};
  };

  for (const line of content.split(/\r?\n/)) {
    const match = line.trim().match(/^(?:[-*]\s*)?(subject|relation|object)\s*:\s*(.*?)\s*$/i);
    if (!match) {
      continue;
    }

    const field = match[1].toLowerCase() as 'subject' | 'relation' | 'object';
    if (field === 'subject' && current.subject && (current.relation || current.object)) {
      flush();
    }
    current[field] = match[2];
    if (current.subject && current.relation && current.object) {
      flush();
    }
  }

  flush();
  return triples;
}

export function extractKnowledgeTriples(input: {
  content: string;
  provenance: string;
  subjectHint?: string | null;
  project?: string | null;
  topicKey?: string | null;
}): {
  taxonomy: { entityTypes: string[]; relationTypes: string[]; version: string };
  triples: ExtractedTriple[];
  dedupeKey: string;
} {
  const normalizedContent = normalize(input.content);
  const tokens = tokenize(normalizedContent);
  const subjectHint = normalize(input.subjectHint ?? '') || entityFromTokens(tokens, 0, Math.min(tokens.length, 4)) || 'observation';
  const triples: ExtractedTriple[] = [];
  const seen = new Set<string>();

  const pushTriple = (subject: string, relation: RelationType, object: string, confidence: number): void => {
    const tripleHash = hashTriple(subject, relation, object);
    if (seen.has(tripleHash)) {
      return;
    }

    seen.add(tripleHash);
    triples.push({
      subject,
      subjectType: inferEntityType(subject),
      relation,
      object,
      objectType: inferEntityType(object),
      provenance: input.provenance,
      confidence,
      tripleHash,
    });
  };

  for (const explicitTriple of [...extractStructuredTripleBlocks(input.content), ...extractExplicitGraphTriples(input.content)]) {
    pushTriple(explicitTriple.subject, explicitTriple.relation, explicitTriple.object, 0.92);
  }

  for (const segment of splitRelationSegments(input.content)) {
    const segmentTokens = tokenize(segment);
    for (let i = 0; i < segmentTokens.length; i += 1) {
      for (const pattern of RELATION_PATTERNS) {
        if (!patternMatches(segmentTokens, i, pattern.tokens)) {
          continue;
        }
        if (pattern.skipIfNextTokenIs && segmentTokens[i + pattern.tokens.length] === pattern.skipIfNextTokenIs) {
          continue;
        }

        const subject = entityFromTokens(segmentTokens, Math.max(0, i - 3), i);
        const object = entityFromTokens(
          segmentTokens,
          i + pattern.tokens.length,
          Math.min(segmentTokens.length, i + pattern.tokens.length + 3)
        );
        if (!subject || !object || subject === object) {
          continue;
        }

        if (pattern.reverseDirection) {
          pushTriple(object, pattern.relation, subject, pattern.confidence);
        } else {
          pushTriple(subject, pattern.relation, object, pattern.confidence);
        }
      }
    }
  }

  if (input.project) {
    pushTriple(subjectHint, 'BELONGS_TO', input.project, 0.86);
  }
  if (input.topicKey) {
    pushTriple(subjectHint, 'HAS_TOPIC', input.topicKey, 0.84);
  }

  for (const section of extractStructuredSections(input.content)) {
    pushTriple(subjectHint, section.relation, section.object, 0.78);
  }

  for (const reference of extractTechnicalReferences(input.content)) {
    pushTriple(subjectHint, 'REFERENCES', reference, 0.72);
  }

  for (const token of highSignalMentionTokens(tokens)) {
    if (token !== subjectHint) {
      pushTriple(subjectHint, 'MENTIONS', token, 0.52);
    }
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
