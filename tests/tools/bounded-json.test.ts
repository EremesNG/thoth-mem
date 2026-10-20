import { describe, expect, it } from 'vitest';

import { boundedJson } from '../../src/tools/bounded-json.js';

describe('bounded tool JSON', () => {
  it('keeps fitting envelopes byte-identical and clips only the longest string values when oversized', () => {
    const fitting = { schema: 'thoth-mem.mcp.mem_get', data: { id: 'selected-id', content: 'unchanged' }, warnings: [] };
    expect(boundedJson(fitting)).toEqual({ text: JSON.stringify(fitting), structuredContent: fitting });

    const input = { schema: 'thoth-mem.mcp.mem_get', data: { id: 'a'.repeat(64), content: 'x'.repeat(30_000), count: 7, enabled: true, absent: null }, warnings: [] };
    const result = boundedJson(input);
    expect(result.text.length).toBeLessThanOrEqual(20_000);
    expect(JSON.parse(result.text)).toEqual(result.structuredContent);
    expect(result.structuredContent).toEqual({ ...input, data: { ...input.data, content: `${'x'.repeat(14_999)}…` }, warnings: ['payload_truncated'] });
    expect(input.data.content).toHaveLength(30_000);
    expect(boundedJson(input)).toEqual(result);
  });

  it('breaks longest-string ties in traversal order and counts the ellipsis in code-point limits', () => {
    const result = boundedJson({ schema: 'test', data: { first: '😀'.repeat(7_000), second: 'z'.repeat(7_000), short: '😀'.repeat(64) } });
    const data = result.structuredContent.data as { first: string; second: string; short: string };
    expect(Array.from(data.first)).toHaveLength(3_500);
    expect(data.first).toBe(`${'😀'.repeat(3_499)}…`);
    expect(data.second).toBe('z'.repeat(7_000));
    expect(data.short).toBe('😀'.repeat(64));
    expect(result.text.length).toBeLessThanOrEqual(20_000);
    expect(JSON.parse(result.text)).toEqual(result.structuredContent);
  });

  it('clips every long string before dropping trailing elements of the largest array', () => {
    const ids = Array.from({ length: 1_000 }, (_, index) => `id-${String(index).padStart(3, '0')}-${'a'.repeat(32)}`);
    const result = boundedJson({ schema: 'test', data: { content: 'x'.repeat(30_000), ids, smaller: ['keep'] }, warnings: ['existing', 'payload_truncated', 'payload_truncated'] });
    const data = result.structuredContent.data as { content: string; ids: string[]; smaller: string[] };
    expect(data.content).toBe(`${'x'.repeat(63)}…`);
    expect(data.ids.length).toBeGreaterThan(0);
    expect(data.ids.length).toBeLessThan(ids.length);
    expect(data.ids).toEqual(ids.slice(0, data.ids.length));
    expect(data.smaller).toEqual(['keep']);
    expect(result.structuredContent.warnings).toEqual(['payload_truncated', 'existing']);
    expect(result.text.length).toBeLessThanOrEqual(20_000);
    expect(JSON.parse(result.text)).toEqual(result.structuredContent);
  });

  it('keeps object keys and short primitive values, including escaped strings', () => {
    const key = 'long-object-key'.repeat(100);
    const data = { [key]: { id: 'a'.repeat(64), escaped: '\\"\n', count: 10, yes: true, no: false, empty: null, content: 'x'.repeat(50_000) } };
    const result = boundedJson({ schema: 'test', data });
    const bounded = result.structuredContent.data as typeof data;
    expect(Object.keys(bounded)).toEqual([key]);
    expect(bounded[key]).toEqual({ ...data[key], content: `${'x'.repeat(12_499)}…` });
    expect(JSON.parse(result.text)).toEqual(result.structuredContent);
  });

  it('terminates on many 65-code-point strings without splitting surrogate pairs', () => {
    const result = boundedJson({ schema: 'test', data: { items: Array.from({ length: 2_000 }, () => '😀'.repeat(65)) } });
    const items = (result.structuredContent.data as { items: string[] }).items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((value) => value === `${'😀'.repeat(63)}…`)).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(20_000);
    expect(JSON.parse(result.text)).toEqual(result.structuredContent);
  });

  it('handles deep objects iteratively without removing their keys', () => {
    let data: Record<string, unknown> = { content: 'x'.repeat(50_000) };
    for (let index = 0; index < 800; index += 1) data = { nested: data };
    const result = boundedJson({ schema: 'test', data });
    let bounded = result.structuredContent.data as Record<string, unknown>;
    for (let index = 0; index < 800; index += 1) {
      expect(Object.keys(bounded)).toEqual(['nested']);
      bounded = bounded.nested as Record<string, unknown>;
    }
    expect(bounded.content).toBe(`${'x'.repeat(6_249)}…`);
    expect(result.text.length).toBeLessThanOrEqual(20_000);
    expect(JSON.stringify(result.structuredContent)).toBe(result.text);
  });

  it('bounds huge short-string arrays and ignores arrays detached by a trailing drop', () => {
    const result = boundedJson({ schema: 'test', data: { items: Array.from({ length: 100_000 }, () => 'short-id'), nested: [[['keep']], [['tail']]] } });
    expect(result.text.length).toBeLessThanOrEqual(20_000);
    expect(JSON.parse(result.text)).toEqual(result.structuredContent);
    const data = result.structuredContent.data as { items: string[]; nested: string[][][] };
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items.every((value) => value === 'short-id')).toBe(true);
    expect(data.nested).toEqual([[['keep']], [['tail']]]);
    const removed = boundedJson({ data: { nested: [Array.from({ length: 10_000 }, () => ['short-id'])] } });
    expect(removed.structuredContent).toEqual({ data: { nested: [] }, warnings: ['payload_truncated'] });
  });

  it('returns a bounded error if immutable keys and primitives alone exceed the cap', () => {
    const result = boundedJson({ schema: 'test', data: { ['k'.repeat(20_000)]: 1 } });
    expect(result).toMatchObject({ isError: true, structuredContent: { schema: 'thoth-mem.mcp.error', error: { code: 'output_too_large', retryable: false }, warnings: ['payload_truncated'] } });
    expect(result.text.length).toBeLessThanOrEqual(20_000);
    expect(JSON.parse(result.text)).toEqual(result.structuredContent);
  });

  it('keeps the truncation marker once during aggressive warning-array dropping', () => {
    const warnings = Array.from({ length: 5_000 }, (_, index) => `warning-${index}`);
    const result = boundedJson({ schema: 'test', data: { id: 'selected-id' }, warnings: [...warnings, 'payload_truncated', 'payload_truncated'] });
    const bounded = result.structuredContent.warnings as string[];
    expect(bounded[0]).toBe('payload_truncated');
    expect(bounded.filter((value) => value === 'payload_truncated')).toHaveLength(1);
    expect(bounded.length).toBeLessThan(warnings.length);
    expect(bounded.slice(1)).toEqual(warnings.slice(0, bounded.length - 1));
    expect(result.text.length).toBeLessThanOrEqual(20_000);
    expect(JSON.parse(result.text)).toEqual(result.structuredContent);

    const fitting = { schema: 'test', warnings: ['existing', 'payload_truncated', 'payload_truncated'] };
    expect(boundedJson(fitting)).toEqual({ text: JSON.stringify(fitting), structuredContent: fitting });
  });

  it('returns a bounded error for unserializable envelopes rather than looping or throwing', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const input of [cyclic, { toJSON: () => undefined }, { toJSON: () => 'x'.repeat(30_000) }]) {
      const result = boundedJson(input);
      expect(result).toMatchObject({ isError: true, structuredContent: { error: { code: 'output_too_large' } } });
      expect(result.text.length).toBeLessThanOrEqual(20_000);
      expect(JSON.parse(result.text)).toEqual(result.structuredContent);
    }
  });

  it('handles a synthetic envelope far beyond the cap deterministically', () => {
    const input = { schema: 'test', data: { id: 'selected-id', content: '😀\\"\n'.repeat(300_000) }, warnings: [] };
    const result = boundedJson(input);
    expect(result.text.length).toBeLessThanOrEqual(20_000);
    expect(JSON.parse(result.text)).toEqual(result.structuredContent);
    expect(result.structuredContent).toMatchObject({ data: { id: 'selected-id' }, warnings: ['payload_truncated'] });
    expect(boundedJson(input)).toEqual(result);
  });
});
