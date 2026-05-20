import { describe, expect, it } from 'vitest';

import { normalizeProjectGraphResponse } from '../../dashboard/src/api/client.js';
import type { ProjectGraphFact, ProjectGraphResponse } from '../../dashboard/src/api/client.js';

describe('normalizeProjectGraphResponse', () => {
  it('normalizes legacy text-only graph responses to a safe structured shape', () => {
    const result = normalizeProjectGraphResponse({
      project: 'thoth-mem',
      text: 'legacy graph output\n... truncated',
    });

    expect(result).toEqual({
      project: 'thoth-mem',
      text: 'legacy graph output\n... truncated',
      facts: [],
      summary: {
        shown: 0,
        total: 0,
        omitted: 0,
        truncated: true,
        text_truncated: true,
        limit: 0,
        max_chars: 0,
        filters: {},
      },
    });
  });

  it('preserves structured graph responses', () => {
    const fact: ProjectGraphFact = {
      id: 1,
      observation_id: 2,
      subject: 'Subject',
      relation: 'HAS_WHAT',
      object: 'Object',
      project: 'thoth-mem',
      topic_key: 'topic/key',
      type: 'discovery',
      created_at: '2026-05-19T00:00:00.000Z',
    };
    const response: ProjectGraphResponse = {
      project: 'thoth-mem',
      text: 'structured graph output',
      facts: [fact],
      summary: {
        shown: 1,
        total: 3,
        omitted: 2,
        truncated: false,
        text_truncated: false,
        limit: 100,
        max_chars: 6000,
        filters: { topic_key: 'topic/key', relation: 'HAS_WHAT' },
      },
    };

    expect(normalizeProjectGraphResponse(response)).toEqual(response);
  });
});
