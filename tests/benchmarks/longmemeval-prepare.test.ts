import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { prepareLongMemEval } from '../../benchmarks/longmemeval/prepare.mjs';

const fixture = JSON.parse(readFileSync('benchmarks/fixtures/longmemeval-s-mini.json', 'utf8')) as Array<Record<string, unknown>>;
const validContent = JSON.stringify(fixture.slice(0, 4));
const validSha256 = createHash('sha256').update(validContent).digest('hex');
const testSource = {
  dataset: 'test/longmemeval-cleaned',
  filename: 'longmemeval_s_cleaned.json',
  revision: 'test-revision',
  sha256: validSha256,
  bytes: Buffer.byteLength(validContent),
  license: 'MIT',
  url: 'https://example.invalid/immutable/longmemeval_s_cleaned.json',
};

describe('LongMemEval-S preparation boundary', () => {
  it('streams, validates, and atomically publishes the pinned dataset and compact receipt', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-longmem-prepare-'));
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, body: Readable.from([validContent]) }));
    try {
      const result = await prepareLongMemEval({ cacheDirectory: root, fetchImpl, source: testSource });

      expect(fetchImpl).toHaveBeenCalledWith(testSource.url, { redirect: 'follow' });
      expect(readFileSync(result.datasetPath, 'utf8')).toBe(validContent);
      expect(result.receipt).toMatchObject({
        schema: 'thoth-mem.longmemeval-preparation.v1',
        source: testSource,
        sha256: validSha256,
        record_count: 4,
        eligible_count: 3,
        excluded_count: 1,
        corpus_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        query_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(JSON.parse(readFileSync(result.receiptPath, 'utf8'))).toEqual(result.receipt);
      expect(JSON.stringify(result.receipt)).not.toContain('LEAK_ONLY_ANSWER_MARKER');
      expect(readdirSync(root).sort()).toEqual(['longmemeval_s_cleaned.json', 'prepared.json']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed and cleans temporary or accepted files after digest and stream failures', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-longmem-prepare-fail-'));
    try {
      await expect(prepareLongMemEval({
        cacheDirectory: root,
        fetchImpl: async () => ({ ok: true, status: 200, body: Readable.from([validContent]) }),
        source: { ...testSource, sha256: '0'.repeat(64) },
      })).rejects.toThrow(/SHA-256/u);
      expect(readdirSync(root)).toEqual([]);

      const brokenBody = Readable.from((async function* () {
        yield validContent.slice(0, 20);
        throw new Error('stream interrupted');
      })());
      await expect(prepareLongMemEval({
        cacheDirectory: root,
        fetchImpl: async () => ({ ok: true, status: 200, body: brokenBody }),
        source: testSource,
      })).rejects.toThrow(/stream interrupted/u);
      expect(readdirSync(root)).toEqual([]);
      expect(existsSync(join(root, 'prepared.json'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects unavailable or bodyless immutable downloads', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-longmem-prepare-http-'));
    try {
      await expect(prepareLongMemEval({
        cacheDirectory: root,
        fetchImpl: async () => ({ ok: false, status: 503, body: null }),
        source: testSource,
      })).rejects.toThrow(/HTTP 503/u);
      expect(readdirSync(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
