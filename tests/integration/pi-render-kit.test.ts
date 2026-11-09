import type { Theme } from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createToolRenderers } from '../../src/integration/pi/render.js';
import type { MemoryToolName } from '../../src/tools/index.js';

const key = Symbol.for('thoth-agents.pi-core.render-kit.v1');
const registry = globalThis as typeof globalThis & { [key]?: unknown };
const original = Object.getOwnPropertyDescriptor(registry, key);
const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as unknown as Theme;
interface CardOptions {
  surface?: string;
  expanded?: boolean;
  part?: string;
  status?: string;
  context?: unknown;
  title?: string;
  body?: string[];
  footer?: string;
  isError?: boolean;
  isSuccess?: boolean;
  row?: { title?: string; summary?: string; tail?: string[]; body?: string[] };
}
function register(card: (_theme: Theme, options: CardOptions, width: number) => string[]) {
  registry[key] = { kit: { version: 1, card }, owner: {}, token: Symbol() };
}
beforeEach(() => { delete registry[key]; });
afterEach(() => {
  delete registry[key];
  if (original) Object.defineProperty(registry, key, original);
});

const examples: Array<{ tool: MemoryToolName; args: Record<string, unknown>; summary: string; data: unknown; tail: string[]; body: string }> = [
  { tool: 'mem_save', args: { memory: { kind: 'decision', title: 'Use hooks', topic_key: 'pi/hooks' } }, summary: 'decision · Use hooks  topic=pi/hooks', data: { memory: { id: 'abcdefgh-long', kind: 'decision', title: 'Use hooks' } }, tail: ['abcdefgh'], body: 'decision · Use hooks  abcdefgh' },
  { tool: 'mem_recall', args: { query: 'pi hooks', mode: 'compact' }, summary: '“pi hooks”  compact', data: { items: [{ id: 'abcdefgh-long', kind: 'decision', title: 'Use hooks' }], hasMore: true }, tail: ['1 item', '+more'], body: 'decision · Use hooks  abcdefgh' },
  { tool: 'mem_context', args: { budget_chars: 4000 }, summary: '4000 chars', data: { outcome: 'recovered', recovery: { selectedRecordIds: ['abcdefgh-long'] } }, tail: ['1 recovered'], body: 'recovered · 1 recovered' },
  { tool: 'mem_get', args: { id: 'abcdefgh-long', history: true }, summary: 'abcdefgh  history', data: { record: { id: 'abcdefgh-long', kind: 'decision', title: 'Use hooks', content: 'Full content' }, lineage: [] }, tail: ['abcdefgh'], body: 'decision · Use hooks  abcdefgh' },
  { tool: 'mem_project', args: { action: 'list' }, summary: 'list', data: { projects: [{ id: 'abcdefgh-long', name: 'Render kit' }] }, tail: ['1 item'], body: 'Render kit  abcdefgh' },
];

describe('Pi render-kit cards', () => {
  it.each(examples)('keeps $tool args in running, success and raw terminal error rows', ({ tool, args, summary, data, tail, body }) => {
    const cards: CardOptions[] = [];
    register((_theme, options) => { cards.push(options); return ['kit']; });
    const renderers = createToolRenderers(tool);
    const state = {};
    const callContext = { state, executionStarted: true };
    const call = renderers.renderCall({ ...args, project_key: 'hidden-key', project_name: 'hidden-name', root_session_key: 'hidden-session' }, theme, callContext);
    call.render(80);
    expect(cards.at(-1)).toMatchObject({ surface: 'tool', expanded: false, part: 'full', status: 'running', context: callContext,
      row: { title: tool, summary, tail: [], body: [] } });
    const partialContext = { state, isError: true };
    renderers.renderResult({ details: { data } }, { expanded: false, isPartial: true }, theme, partialContext).render(80);
    expect(cards.at(-1)).toMatchObject({ surface: 'tool', expanded: false, part: 'end', status: 'running', context: partialContext,
      row: { title: tool, summary, tail: [], body: [body] } });
    expect(cards.at(-1)?.footer).toContain('running…');
    call.render(80);
    expect(cards.at(-1)).toMatchObject({ status: 'running', isError: false, isSuccess: false });
    const resultContext = { state };
    renderers.renderResult({ details: { data } }, { expanded: true, isPartial: false }, theme, resultContext).render(80);
    expect(cards.at(-1)).toMatchObject({ surface: 'tool', expanded: true, part: 'end', status: 'completed', context: resultContext,
      row: { title: tool, summary, tail, body: [body] } });
    expect(cards.at(-1)?.footer).toContain('Done');
    call.render(80);
    expect(cards.at(-1)).toMatchObject({ expanded: true, status: 'completed' });
    const errorContext = { state, isError: true };
    renderers.renderResult({ content: [{ type: 'text', text: 'Raw failure\nsecond line' }], details: { error: { message: 'Metadata failure' } } }, { expanded: false, isPartial: false }, theme, errorContext).render(80);
    expect(cards.at(-1)).toMatchObject({ surface: 'tool', expanded: false, part: 'end', status: 'failed', context: errorContext,
      row: { title: tool, summary, tail: [], body: ['Raw failure'] }, body: ['Metadata failure'] });
    expect(cards.at(-1)?.footer).toContain('Error');
    call.render(80);
    expect(cards.at(-1)).toMatchObject({ expanded: false, status: 'failed' });
  });

  it.each(['absent', 'bare', 'version', 'card', 'throws', 'accessor', 'kit accessor', 'version accessor', 'card accessor'])('preserves standalone frames for %s registries', (invalid) => {
    const renderers = createToolRenderers('mem_get');
    const state = {};
    const call = renderers.renderCall({ id: 'abcdefgh-long' }, theme, { state });
    const result = renderers.renderResult({ content: [{ type: 'text', text: 'Original output' }] }, { expanded: false, isPartial: false }, theme, { state });
    const expected = [...call.render(60), ...result.render(60)];
    const card = () => ['unexpected kit'];
    if (invalid === 'bare') registry[key] = { version: 1, card };
    if (invalid === 'version') registry[key] = { kit: { version: 2, card } };
    if (invalid === 'card') registry[key] = { kit: { version: 1 } };
    if (invalid === 'throws') register(() => { throw new Error('kit failed'); });
    if (invalid === 'accessor') Object.defineProperty(registry, key, { configurable: true, get() { throw new Error('registry failed'); } });
    if (invalid === 'kit accessor') registry[key] = { get kit() { throw new Error('kit lookup failed'); } };
    if (invalid === 'version accessor') registry[key] = { kit: { get version() { throw new Error('version failed'); }, card } };
    if (invalid === 'card accessor') registry[key] = { kit: { version: 1, get card() { throw new Error('card lookup failed'); } } };
    expect([...call.render(60), ...result.render(60)]).toEqual(expected);
    expect(expected.join('\n')).toContain('abcdefgh');
    expect(expected.join('\n')).toContain('Original output');
    expect(expected.join('\n')).toContain('Done');
  });

  it('uses context expansion when result options omit it, then shares it with the call', () => {
    const cards: CardOptions[] = [];
    register((_theme, options) => { cards.push(options); return []; });
    const renderers = createToolRenderers('mem_get');
    const state = {};
    const call = renderers.renderCall({ id: 'abcdefgh-long' }, theme, { state });
    renderers.renderResult({}, { isPartial: false }, theme, { state, expanded: true }).render(80);
    expect(cards.at(-1)?.expanded).toBe(true);
    call.render(80);
    expect(cards.at(-1)?.expanded).toBe(true);
    renderers.renderResult({}, { isPartial: false }, theme, { state }).render(80);
    expect(cards.at(-1)?.expanded).toBe(false);
    call.render(80);
    expect(cards.at(-1)?.expanded).toBe(false);
    renderers.renderResult({}, { isPartial: false }, theme, {}).render(80);
    expect(cards.at(-1)?.expanded).toBe(false);
  });

  it.each(['line', 'compact', 'frame', 'expanded'])('keeps the running call visible and one row set after partial and terminal results in %s mode', (mode) => {
    const cards: CardOptions[] = [];
    const expanded = mode === 'expanded';
    register((_theme, options) => {
      cards.push(options);
      if (mode !== 'frame' && options.surface === 'tool' && options.expanded === false) {
        if (options.part === 'start') return [];
        const row = [`${options.status} ${options.row?.title} ${options.row?.summary}`];
        return mode === 'compact' ? [...row, ...(options.row?.body ?? [])] : row;
      }
      return [
        ...(options.part === 'end' ? [] : [`top ${options.title}`]),
        ...(options.body ?? []),
        ...(options.part === 'start' ? [] : [`bottom ${options.footer ?? options.status}`]),
      ];
    });
    const renderers = createToolRenderers('mem_get');
    const state = {};
    const context = { state, expanded, executionStarted: true };
    const call = renderers.renderCall({ id: 'abcdefgh-long' }, theme, context);
    const beforeResult = call.render(80);
    expect(beforeResult.join('\n')).toContain('mem_get');
    expect(beforeResult.join('\n')).toContain('abcdefgh');
    expect(beforeResult.join('\n')).toContain('running');
    expect(cards.at(-1)).toMatchObject({ part: 'full', status: 'running' });
    for (const isPartial of [true, false]) {
      const result = renderers.renderResult({ content: [{ type: 'text', text: 'Result text' }] }, { expanded, isPartial }, theme, context);
      const callLines = call.render(80);
      expect(cards.at(-1)).toMatchObject({ part: 'start', status: isPartial ? 'running' : 'completed' });
      const resultLines = result.render(80);
      expect(cards.at(-1)).toMatchObject({ part: 'end', status: isPartial ? 'running' : 'completed' });
      const combined = [...callLines, ...resultLines];
      expect(combined.filter((line) => line.includes('mem_get'))).toHaveLength(1);
      expect(combined.filter((line) => line.includes('abcdefgh'))).toHaveLength(1);
      if (mode === 'line' || mode === 'compact') expect(callLines).toEqual([]);
      if (mode !== 'line') expect(combined.filter((line) => line === 'Result text')).toHaveLength(1);
      if (mode === 'frame' || expanded) {
        expect(combined.filter((line) => line.startsWith('top '))).toHaveLength(1);
        expect(combined.filter((line) => line.startsWith('bottom '))).toHaveLength(1);
        expect(combined.at(-1)).toContain(isPartial ? 'running' : 'Done');
      }
    }
  });

  it('keeps explicit call expansion ahead of shared result expansion', () => {
    const cards: CardOptions[] = [];
    register((_theme, options) => { cards.push(options); return []; });
    const renderers = createToolRenderers('mem_get');
    const state = {};
    const call = renderers.renderCall({}, theme, { state, expanded: false });
    renderers.renderResult({}, { expanded: true, isPartial: false }, theme, { state }).render(80);
    call.render(80);
    expect(cards.at(-1)?.expanded).toBe(false);
  });

  it('discovers replacement kits and withdrawal even at an already-rendered width', () => {
    const call = createToolRenderers('mem_get').renderCall({}, theme, {});
    const standalone = call.render(60);
    register(() => ['first']);
    expect(call.render(60)).toEqual(['first']);
    register(() => ['second']);
    expect(call.render(60)).toEqual(['second']);
    delete registry[key];
    expect(call.render(60)).toEqual(standalone);
  });

  it('escapes collapsed row controls and keeps only the first raw error line', () => {
    const cards: CardOptions[] = [];
    register((_theme, options) => { cards.push(options); return []; });
    const renderers = createToolRenderers('mem_recall');
    const state = {};
    renderers.renderCall({ query: 'a\u001b[31mb' }, theme, { state }).render(80);
    renderers.renderResult({ content: [{ type: 'text', text: 'Oops\u0007\nsecond line' }] }, { expanded: true, isPartial: false }, theme, { state, isError: true }).render(80);
    expect(cards.at(-1)?.row).toEqual({ title: 'mem_recall', summary: '“a␛[31mb”', tail: [], body: ['Oops␇'] });
    expect(cards.at(-1)?.body).toEqual(['Oops␇', 'second line']);
  });

  it('retains full expanded result information while collapsed frames show the existing fold hint', () => {
    const cards: CardOptions[] = [];
    register((_theme, options) => { cards.push(options); return []; });
    const renderers = createToolRenderers('mem_get');
    const result = { content: [{ type: 'text', text: Array.from({ length: 10 }, (_, index) => `line ${index}`).join('\n') }] };
    renderers.renderResult(result, { expanded: false, isPartial: false }, theme, {}).render(80);
    expect(cards.at(-1)?.body).toHaveLength(9);
    expect(cards.at(-1)?.body?.at(-1)).toBe('… 2 more lines · ctrl+o to expand');
    renderers.renderResult(result, { expanded: true, isPartial: false }, theme, {}).render(80);
    expect(cards.at(-1)?.body).toHaveLength(10);
    expect(cards.at(-1)?.row?.body).toEqual(['line 0']);
  });

  it('opts split recall cards into the tool surface with shared args and expansion', () => {
    const cards: CardOptions[] = [];
    register((_theme, options) => { cards.push(options); return ['kit']; });
    const renderers = createToolRenderers('mem_recall');
    const state = {};
    const callContext = { state, executionStarted: true, expanded: true };
    const call = renderers.renderCall({ query: 'pi hooks', mode: 'compact', project_key: 'private' }, theme, callContext);
    expect(call.render(80)).toEqual(['kit']);
    expect(cards[0]).toMatchObject({ surface: 'tool', expanded: true, part: 'full', status: 'running', context: callContext,
      row: { title: 'mem_recall', summary: '“pi hooks”  compact', tail: [], body: [] } });
    const resultContext = { state };
    const result = renderers.renderResult({ details: { data: { items: [{ id: 'abcdefgh-long', kind: 'decision', title: 'Use hooks' }], hasMore: true } } }, { expanded: false, isPartial: false }, theme, resultContext);
    expect(result.render(80)).toEqual(['kit']);
    expect(cards[1]).toMatchObject({ surface: 'tool', expanded: false, part: 'end', status: 'completed', context: resultContext,
      row: { title: 'mem_recall', summary: '“pi hooks”  compact', tail: ['1 item', '+more'], body: ['decision · Use hooks  abcdefgh'] } });
    expect(cards[0]?.body).toEqual(['“pi hooks”  compact']);
    expect(cards[1]?.body).toEqual(['decision · Use hooks  abcdefgh']);
    expect(cards[1]?.footer).toContain('Done');
  });
});
