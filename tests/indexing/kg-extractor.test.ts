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
});
