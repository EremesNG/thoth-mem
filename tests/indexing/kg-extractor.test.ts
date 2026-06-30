import { describe, expect, it } from 'vitest';
import { extractKnowledgeTriples } from '../../src/indexing/kg-extractor.js';

interface TripleShape {
  subject: string;
  relation: string;
  object: string;
}

function triplesFrom(content: string): TripleShape[] {
  return extractKnowledgeTriples({
    content,
    provenance: 'test://kg-extractor',
  }).triples.map((triple) => ({
    subject: triple.subject,
    relation: triple.relation,
    object: triple.object,
  }));
}

function hasTriple(triples: TripleShape[], subject: string, relation: string, object: string): boolean {
  return triples.some((triple) => (
    triple.subject === subject && triple.relation === relation && triple.object === object
  ));
}

describe('kg-extractor relation quality', () => {
  it('reverses direction for passive by-relations', () => {
    const triples = triplesFrom(
      [
        'Payments service is owned by Platform team.',
        'Checkout deploy is blocked by failing smoke tests.',
        'Login regression was fixed by token refresh patch.',
        'Outage was caused by expired oauth token.',
        'Session cache was configured by infra automation.',
        'Auth gateway was implemented by platform sdk.',
      ].join(' ')
    );

    expect(hasTriple(triples, 'platform team', 'OWNS', 'payments service')).toBe(true);
    expect(hasTriple(triples, 'payments service', 'OWNS', 'platform team')).toBe(false);

    expect(hasTriple(triples, 'failing smoke tests', 'BLOCKS', 'checkout deploy')).toBe(true);
    expect(hasTriple(triples, 'checkout deploy', 'BLOCKS', 'failing smoke tests')).toBe(false);

    expect(hasTriple(triples, 'token refresh patch', 'FIXES', 'login regression')).toBe(true);
    expect(hasTriple(triples, 'login regression', 'FIXES', 'token refresh patch')).toBe(false);

    expect(hasTriple(triples, 'expired oauth token', 'CAUSES', 'outage')).toBe(true);
    expect(hasTriple(triples, 'infra automation', 'CONFIGURES', 'session cache')).toBe(true);
    expect(hasTriple(triples, 'platform sdk', 'IMPLEMENTS', 'auth gateway')).toBe(true);
  });

  it('parses explicit graph notation only for known KG relations', () => {
    const triples = triplesFrom(
      [
        'Auth service --DEPENDS_ON--> Redis cache',
        'Worker queue -[RUNS_IN]-> us-east-1',
        'Cache layer --INVALID_EDGE--> Redis',
      ].join('\n')
    );

    expect(hasTriple(triples, 'auth service', 'DEPENDS_ON', 'redis cache')).toBe(true);
    expect(hasTriple(triples, 'worker queue', 'RUNS_IN', 'us-east-1')).toBe(true);
    expect(triples.some((triple) => triple.relation === 'INVALID_EDGE')).toBe(false);
    expect(hasTriple(triples, 'cache layer', 'INVALID_EDGE', 'redis')).toBe(false);
  });

  it('parses structured subject-relation-object blocks', () => {
    const triples = triplesFrom(
      [
        'Subject: ArcRift retrieval engine',
        'Relation: DEPENDS_ON',
        'Object: sentence vector index',
        '',
        '- subject: Memory sync pipeline',
        '- relation: IMPLEMENTS',
        '- object: portable backup chunks',
      ].join('\n')
    );

    expect(hasTriple(triples, 'arcrift retrieval engine', 'DEPENDS_ON', 'sentence vector index')).toBe(true);
    expect(hasTriple(triples, 'memory sync pipeline', 'IMPLEMENTS', 'portable backup chunks')).toBe(true);
  });

  it('extracts dependency language used in architecture notes', () => {
    const triples = triplesFrom(
      [
        'Search API requires vector index readiness.',
        'Cache layer is backed by Redis cluster.',
      ].join(' ')
    );

    expect(hasTriple(triples, 'search api', 'DEPENDS_ON', 'vector index readiness')).toBe(true);
    expect(hasTriple(triples, 'cache layer', 'DEPENDS_ON', 'redis cluster')).toBe(true);
  });

  it('exposes deterministic-first extraction strategy and flags long conversations for optional LLM enrichment', () => {
    const short = extractKnowledgeTriples({
      content: 'Auth service depends on Redis cache.',
      provenance: 'test://kg-extractor',
    });
    const longConversation = extractKnowledgeTriples({
      content: Array.from({ length: 120 }, (_, index) => (
        `Turn ${index}: User discussed deployment risk, auth service, Redis cache, and rollout sequencing.`
      )).join('\n'),
      provenance: 'test://kg-extractor',
      llmFallback: { enabled: true, minContentChars: 1000 },
    });

    expect(short.strategy).toEqual({
      primary: 'deterministic',
      llmFallback: 'disabled',
      reason: 'not_configured',
    });
    expect(longConversation.strategy).toEqual({
      primary: 'deterministic',
      llmFallback: 'recommended',
      reason: 'long_conversation',
    });
  });

  it('merges validated LLM triples while preserving deterministic extraction as primary', () => {
    const extraction = extractKnowledgeTriples({
      content: 'Auth service depends on Redis cache.',
      provenance: 'test://kg-extractor',
      llmFallback: { enabled: true, minContentChars: 10 },
      llmTriples: [
        {
          subject: 'Memory Router',
          relation: 'DEPENDS_ON',
          object: 'Context Budget',
          confidence: 0.93,
        },
        {
          subject: 'Ignored',
          relation: 'IMAGINES',
          object: 'Invalid relation',
          confidence: 0.99,
        },
      ],
    });

    expect(extraction.strategy).toEqual({
      primary: 'deterministic',
      llmFallback: 'used',
      reason: 'long_conversation',
    });
    expect(hasTriple(extraction.triples, 'memory router', 'DEPENDS_ON', 'context budget')).toBe(true);
    expect(extraction.triples.some((triple) => triple.relation === 'IMAGINES')).toBe(false);
  });

  it('preserves structured section content beyond 500 characters', () => {
    const longSection = `prefix-${'x'.repeat(520)}-suffix`;
    const triples = extractKnowledgeTriples({
      content: `What: ${longSection}`,
      provenance: 'test://kg-extractor',
      subjectHint: 'long-section-source',
    }).triples.map((triple) => ({
      subject: triple.subject,
      relation: triple.relation,
      object: triple.object,
    }));

    expect(hasTriple(triples, 'long-section-source', 'HAS_WHAT', longSection)).toBe(true);
  });
});
