import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import {
  classifyRecord,
  inspectDataset,
  LONGMEMEVAL_SOURCE,
  normalizeSessions,
  streamJsonArray,
  validateRecord,
} from '../../benchmarks/longmemeval/contract.mjs';

const fixture = JSON.parse(readFileSync('benchmarks/fixtures/longmemeval-s-mini.json', 'utf8')) as Array<Record<string, unknown>>;

describe('LongMemEval-S dataset contract', () => {
  it('streams a top-level JSON array across arbitrary chunk and escape boundaries', async () => {
    const input = Readable.from(['[ {"id":"a', '\\\"b","nested":[1,', '2]}, {"id":"c","text":"bra', 'ce } inside"} ]']);
    const records = [];
    for await (const record of streamJsonArray(input)) records.push(record);

    expect(records).toEqual([
      { id: 'a"b', nested: [1, 2] },
      { id: 'c', text: 'brace } inside' },
    ]);
  });

  it('rejects missing, duplicate, or trailing top-level separators', async () => {
    for (const input of ['[{},{}{}]', '[{},,{}]', '[{},]']) {
      const consume = async () => {
        for await (const _record of streamJsonArray(Readable.from([input]))) { /* consume */ }
      };
      await expect(consume(), input).rejects.toThrow(/JSON array/u);
    }
  });

  it('validates session-level golds and normalizes only ordered role-labelled dialogue', () => {
    const record = validateRecord(fixture[0]);

    expect(classifyRecord(record)).toEqual({ eligible: true });
    expect(normalizeSessions(record)).toEqual([
      {
        index: 0,
        sourceId: '0:session-storage',
        sessionId: 'session-storage',
        capturedAt: '2026-01-01T09:00:00Z',
        text: '[user] Which local storage engine should remain authoritative?\n[assistant] SQLite is the only source of truth.',
      },
      {
        index: 1,
        sourceId: '1:session-budget',
        sessionId: 'session-budget',
        capturedAt: '2026-01-02T09:00:00Z',
        text: '[user] Fix the final context budget at one thousand estimated tokens.\n[assistant] The final budget is 1000 estimated tokens.',
      },
      {
        index: 2,
        sourceId: '2:session-noise',
        sessionId: 'session-noise',
        capturedAt: '2026-01-03T09:00:00Z',
        text: '[user] The office plants need watering on Friday.\n[assistant] I added a reminder for the plants.',
      },
      {
        index: 3,
        sourceId: '3:session-noise',
        sessionId: 'session-noise',
        capturedAt: '2026-01-03T10:00:00Z',
        text: '[user] The duplicate source label belongs to a separate ordered occurrence.\n[assistant] Keep both occurrences without collapsing their shared session ID.',
      },
    ]);
    expect(JSON.stringify(normalizeSessions(record))).not.toContain('LEAK_ONLY_ANSWER_MARKER');
    expect(JSON.stringify(normalizeSessions(record))).not.toContain('has_answer');
  });

  it('keeps assistant-evidence records eligible and excludes only abstention records', () => {
    expect(classifyRecord(validateRecord(fixture[1]))).toEqual({ eligible: true });
    expect(classifyRecord(validateRecord(fixture[3]))).toEqual({ eligible: false, reason: 'abstention' });
  });

  it('preserves string-typed empty turn content as an ordered corpus position', () => {
    const emptyTurn = structuredClone(fixture[1]);
    ((emptyTurn.haystack_sessions as Array<Array<{ content: string }>>)[0][1]).content = '';
    const sessions = normalizeSessions(validateRecord(emptyTurn));
    expect(sessions[0].text).toBe('[user] We should choose a deployment canary phrase.\n[assistant] ');
  });

  it('preserves repeated haystack IDs but rejects unresolved or duplicate golds and misaligned arrays', () => {
    expect(() => validateRecord(fixture[4])).toThrow(/answer_session_ids/u);
    const repeated = validateRecord(fixture[0]);
    expect(normalizeSessions(repeated).map((session) => session.sourceId)).toEqual([
      '0:session-storage',
      '1:session-budget',
      '2:session-noise',
      '3:session-noise',
    ]);
    expect(() => validateRecord({ ...fixture[0], answer_session_ids: ['session-storage', 'session-storage'] })).toThrow(/unique/u);
    expect(() => validateRecord({ ...fixture[0], haystack_dates: ['2026-01-01T09:00:00Z'] })).toThrow(/aligned/u);
  });

  it('pins the cleaned-S source and inspects a valid file with observed denominators', async () => {
    expect(LONGMEMEVAL_SOURCE).toMatchObject({
      filename: 'longmemeval_s_cleaned.json',
      revision: '98d7416c24c778c2fee6e6f3006e7a073259d48f',
      sha256: 'd6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442',
      bytes: 277_383_467,
      license: 'MIT',
    });
    const root = mkdtempSync(join(tmpdir(), 'thoth-longmem-contract-'));
    try {
      const path = join(root, 'valid.json');
      const content = JSON.stringify(fixture.slice(0, 4));
      const sha256 = createHash('sha256').update(content).digest('hex');
      writeFileSync(path, content);

      const inspection = await inspectDataset(path, { expectedSha256: sha256 });
      expect(inspection).toMatchObject({
        sha256,
        recordCount: 4,
        eligibleCount: 3,
        queryOrder: ['q_multi_session', 'q_assistant_evidence', 'q_irrelevant_query'],
        exclusions: [{ question_id: 'q_abstention_abs', reason: 'abstention' }],
        corpusHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        queryHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      await expect(inspectDataset(path, { expectedSha256: '0'.repeat(64) })).rejects.toThrow(/SHA-256/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
