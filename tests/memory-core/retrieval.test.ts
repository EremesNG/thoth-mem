import { describe, expect, it } from 'vitest';

import { MemoryService } from '../../src/memory-core/service.js';

function save(service: MemoryService, title: string, content: string, topicKey?: string) {
  return service.save({ project: { key: 'repo:retrieval', name: 'retrieval' }, evidence: { kind: 'explicit_save', content }, memory: { kind: 'decision', title, content, topicKey } }).memory!;
}

describe('lexical-first retrieval', () => {
  it('supports exact ID/topic, phrases, code tokens, and bounded prefixes immediately after save', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const memory = save(service, 'Deployment parser', 'The deployment parser keeps foo_bar tokens and exact alpha beta phrases.', 'deploy/parser');
      expect(service.recall({ projectKey: 'repo:retrieval', query: memory.id }).items[0]?.lane).toBe('structured');
      expect(service.recall({ projectKey: 'repo:retrieval', query: 'deploy/parser' }).items[0]?.id).toBe(memory.id);
      expect(service.recall({ projectKey: 'repo:retrieval', query: 'alpha beta' }).items[0]?.id).toBe(memory.id);
      expect(service.recall({ projectKey: 'repo:retrieval', query: 'deploy' }).items[0]?.id).toBe(memory.id);
      expect(service.recall({ projectKey: 'repo:retrieval', query: 'foo_bar' }).items[0]?.id).toBe(memory.id);
    } finally { service.close(); }
  });

  it('treats punctuation/operators safely and uses deterministic tie breaks', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      expect(service.recall({ projectKey: 'repo:retrieval', query: '!!! OR "" (((' }).items).toEqual([]);
      const one = save(service, 'Equal one', 'shared deterministic token'); const two = save(service, 'Equal two', 'shared deterministic token');
      const first = service.recall({ projectKey: 'repo:retrieval', query: 'shared deterministic', limit: 10 }).items.map((item) => item.id);
      const second = service.recall({ projectKey: 'repo:retrieval', query: 'shared deterministic', limit: 10 }).items.map((item) => item.id);
      expect(first).toEqual(second); expect(new Set(first)).toEqual(new Set([one.id, two.id]));
    } finally { service.close(); }
  });

  it('supports a quoted phrase without turning phrase terms into independent prefixes', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const exactPhrase = save(service, 'Exact phrase', 'alpha beta appears together');
      save(service, 'Separated phrase', 'alpha intervening words beta');
      const items = service.recall({ projectKey: 'repo:retrieval', query: '"alpha beta"', limit: 10 }).items;
      expect(items.map((item) => item.id)).toEqual([exactPhrase.id]);
      expect(service.recall({ projectKey: 'repo:retrieval', query: 'alph' }).items.map((item) => item.id)).toContain(exactPhrase.id);
    } finally { service.close(); }
  });
});
