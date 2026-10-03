import { visibleWidth } from '@earendil-works/pi-tui';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';

import { createToolRenderers, escapeControls, summarizeCall, summarizeResult } from '../../src/integration/pi/render.js';
import { truncateToWidth, visibleWidth as cellWidth } from '../../src/integration/pi/width.js';

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as unknown as Theme;

describe('Pi tool rendering', () => {
  it('summarizes calls per tool without leaking terminal controls', () => {
    expect(summarizeCall('mem_save', { memory: { kind: 'handoff', title: 'Close flow', topic_key: 'handoff/flow' } })).toBe('handoff · Close flow  topic=handoff/flow');
    expect(summarizeCall('mem_recall', { query: 'pi hooks', mode: 'compact', temporal: 'history' })).toBe('“pi hooks”  compact  history');
    expect(summarizeCall('mem_project', { action: 'timeline' })).toBe('timeline');
    expect(escapeControls('a\u001b[31mb\u0007')).toBe('a␛[31mb␇');
  });

  it('turns structured payloads into item lines, counts, and errors', () => {
    const listed = summarizeResult({ schema: 'thoth-mem.mcp.mem_recall', data: { items: [{ id: '0881bca2-fe34', kind: 'discovery', title: 'Pi smoke fixed', status: 'superseded' }] } }, '');
    expect(listed).toEqual({ lines: ['discovery · Pi smoke fixed [superseded]  0881bca2'], count: '1 item' });
    expect(summarizeResult({ schema: 'thoth-mem.mcp.error', error: { message: 'timeline rejects temporal' } }, '').lines).toEqual(['timeline rejects temporal']);
    expect(summarizeResult(undefined, 'raw\ntext').lines).toEqual(['raw', 'text']);
  });

  it('measures and truncates cells like the Pi TUI without importing it at runtime', () => {
    for (const sample of ['plain', '\u001b[31mred\u001b[0m', '漢字かな', 'e\u0301', '👍🏽 ok', '◆ mem_save']) expect(cellWidth(sample)).toBe(visibleWidth(sample));
    const cut = truncateToWidth('\u001b[32m漢字かなabc\u001b[0m', 6);
    expect(visibleWidth(cut)).toBeLessThanOrEqual(6);
    expect(cut.endsWith('\u001b[0m…')).toBe(true);
  });

  it('frames the call and result to the exact terminal width', () => {
    const renderers = createToolRenderers('mem_recall');
    const state: Record<string, unknown> = {};
    const call = renderers.renderCall({ query: 'x'.repeat(200) }, theme, { state, executionStarted: true });
    const running = call.render(40);
    expect(running[0]).toContain('mem_recall');
    expect(running.at(-1)).toContain('running…');
    const result = renderers.renderResult({ content: [], details: { data: { items: Array.from({ length: 10 }, (_, index) => ({ id: `id-${index}`, kind: 'decision', title: `Item ${index}` })) } } }, { expanded: false, isPartial: false }, theme, { state });
    const done = [...call.render(40), ...result.render(40)];
    expect(done.find((line) => line.includes('Result'))).toBeDefined();
    expect(done.at(-1)).toMatch(/Done · \d+ms · 10 items/u);
    expect(done.some((line) => line.includes('2 more lines'))).toBe(true);
    for (const line of done) expect(visibleWidth(line)).toBe(40);
  });
});
