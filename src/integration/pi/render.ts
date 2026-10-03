import type { Theme, ToolRenderResultOptions } from '@earendil-works/pi-coding-agent';
import type { Component } from '@earendil-works/pi-tui';

import type { MemoryToolName } from '../../tools/index.js';
import { truncateToWidth, visibleWidth } from './width.js';

// Framed tool rendering aligned with the Thoth Pi theme: a titled top border, a
// call summary, an optional result divider, and a status footer.
const HORIZONTAL = '─';
const COLLAPSED_LINES = 8;
const MAX_SUMMARY_CODE_POINTS = 240;
const ICON = '◆';

interface RenderState { startedAt?: number; finishedAt?: number; hasResult?: boolean; callComponent?: Component }
interface RenderContext { state?: RenderState; executionStarted?: boolean; isError?: boolean }
interface RenderResult { content?: Array<{ type: string; text?: string }>; details?: unknown }

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Display C0/C1 controls as visible text so recalled data cannot drive the terminal. */
export function escapeControls(value: string): string {
  let escaped = '';
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code === 0x09) escaped += ' ';
    else if (code < 0x20) escaped += String.fromCodePoint(0x2400 + code);
    else if (code === 0x7f) escaped += '\u2421';
    else if (code >= 0x80 && code <= 0x9f) escaped += `\\x${code.toString(16)}`;
    else escaped += character;
  }
  return escaped;
}

function clip(value: string, maxCodePoints = MAX_SUMMARY_CODE_POINTS): string {
  const points = Array.from(value.replace(/\s+/gu, ' ').trim());
  return points.length > maxCodePoints ? `${points.slice(0, maxCodePoints - 1).join('')}…` : points.join('');
}

function shortId(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value.slice(0, 8) : undefined;
}

function elapsed(state: RenderState | undefined): string | undefined {
  if (!state?.startedAt) return undefined;
  const ms = Math.max(0, (state.finishedAt ?? Date.now()) - state.startedAt);
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function border(theme: Theme, isError: boolean, value: string): string {
  return theme.fg(isError ? 'error' : 'borderMuted', value);
}

function rule(theme: Theme, left: string, right: string, label: string | undefined, width: number, isError: boolean, labelColor?: 'dim'): string {
  if (width <= 4) return truncateToWidth(label ?? '', width);
  const inner = width - 2;
  const fit = label ? ` ${truncateToWidth(label, Math.max(1, inner - 6))} ` : '';
  const dashes = Math.max(1, inner - 2 - visibleWidth(fit));
  const head = label ? `${HORIZONTAL}${HORIZONTAL}` : '';
  const styled = labelColor ? theme.fg(labelColor, fit) : fit;
  return truncateToWidth(`${border(theme, isError, `${left}${head}`)}${styled}${border(theme, isError, `${HORIZONTAL.repeat(label ? dashes : inner)}${right}`)}`, width);
}

function row(theme: Theme, line: string, width: number, isError: boolean): string {
  if (width <= 4) return truncateToWidth(line, width);
  const contentWidth = Math.max(1, width - 4);
  const truncated = truncateToWidth(line, contentWidth);
  const pad = ' '.repeat(Math.max(0, contentWidth - visibleWidth(truncated)));
  return truncateToWidth(`${border(theme, isError, '│ ')}${truncated}${pad}${border(theme, isError, ' │')}`, width);
}

function component(render: (width: number) => string[]): Component {
  const cache = new Map<number, string[]>();
  return {
    render(width) {
      const safe = Math.max(0, Math.floor(width));
      if (safe === 0) return [];
      let lines = cache.get(safe);
      if (!lines) { lines = render(safe).map((line) => truncateToWidth(line, safe)); cache.set(safe, lines); }
      return lines;
    },
    invalidate() { cache.clear(); },
  };
}

/** One-line, tool-aware summary of the call arguments. */
export function summarizeCall(tool: MemoryToolName, args: Record<string, unknown> | undefined): string {
  const input = args ?? {};
  const parts: string[] = [];
  const add = (value: string | undefined) => { if (value?.trim()) parts.push(clip(value)); };
  if (tool === 'mem_save') {
    const memory = asRecord(input.memory);
    const observation = asRecord(input.observation);
    if (memory) add(`${String(memory.kind ?? 'memory')} · ${text(memory.title) ?? ''}`);
    else if (observation) add(`observation ${String(observation.kind ?? '')} · ${text(observation.title) ?? ''}`);
    else if (asRecord(input.observation_review)) add(`review ${String(asRecord(input.observation_review)!.verdict ?? '')} · ${shortId(asRecord(input.observation_review)!.observation_id) ?? ''}`);
    else if (asRecord(input.observation_promotion)) add(`promote · ${shortId(asRecord(input.observation_promotion)!.observation_id) ?? ''}`);
    else add(`evidence ${String(asRecord(input.evidence)?.kind ?? '')}`);
    const topic = text(memory?.topic_key);
    if (topic) add(`topic=${topic}`);
    if (text(memory?.supersedes_id)) add(`supersedes=${shortId(memory!.supersedes_id)}`);
  } else if (tool === 'mem_recall') {
    add(text(input.query) ? `“${text(input.query)}”` : undefined);
    add(text(input.mode));
    if (input.temporal === 'history') add('history');
  } else if (tool === 'mem_context') {
    add(text(input.project_name) ?? text(input.project_key));
    if (typeof input.budget_chars === 'number') add(`${input.budget_chars} chars`);
  } else if (tool === 'mem_get') {
    add(shortId(input.id));
    if (input.history === true) add('history');
  } else if (tool === 'mem_project') {
    add(text(input.action));
    add(shortId(input.id));
    add(text(input.state));
  } else if (tool === 'mem_session') {
    add(text(input.operation));
    add(text(input.harness));
  }
  return escapeControls(Array.from(parts.join('  ')).slice(0, MAX_SUMMARY_CODE_POINTS).join(''));
}

function itemLine(item: Record<string, unknown>): string | undefined {
  const label = text(item.title) ?? text(item.snippet) ?? text(item.name);
  const kind = text(item.kind) ?? text(item.recordType);
  if (!label && !kind) return undefined;
  const status = text(item.status) && item.status !== 'current' ? ` [${String(item.status)}]` : '';
  const id = shortId(item.id);
  return `${kind ? `${kind} · ` : ''}${clip(label ?? '', 120)}${status}${id ? `  ${id}` : ''}`;
}

/** Human-readable body and a count label derived from a structured tool payload. */
export function summarizeResult(details: unknown, fallback: string): { lines: string[]; count?: string } {
  const payload = asRecord(details);
  const error = asRecord(payload?.error);
  if (error) return { lines: [text(error.message) ?? 'memory tool failed'] };
  const data = asRecord(payload?.data);
  if (!data) return { lines: fallback.trim() ? fallback.split('\n') : [] };
  const lists = [data.items, data.projects, data.lineage, data.summaries, data.observations].find(Array.isArray) as unknown[] | undefined;
  if (lists) {
    const lines = lists.flatMap((entry) => { const line = asRecord(entry) && itemLine(asRecord(entry)!); return line ? [line] : []; });
    return { lines, count: `${lists.length} ${lists.length === 1 ? 'item' : 'items'}${data.hasMore === true ? '+' : ''}` };
  }
  const memory = asRecord(data.memory);
  const observation = asRecord(data.observation);
  const record = asRecord(data.record) ?? memory ?? observation ?? asRecord(data.summary);
  if (record) {
    const lines = [itemLine(record) ?? ''];
    if (text(record.supersedesId)) lines.push(`supersedes ${shortId(record.supersedesId)}`);
    const content = text(record.content);
    if (content && !memory && !observation) lines.push(...content.split('\n'));
    return { lines: lines.filter(Boolean) };
  }
  if (text(data.outcome)) {
    const recovery = asRecord(data.recovery);
    const selected = Array.isArray(recovery?.selectedRecordIds) ? recovery.selectedRecordIds.length : 0;
    return { lines: [`${String(data.outcome)}${data.duplicate === true ? ' (duplicate)' : ''}${recovery ? ` · ${selected} recovered` : ''}`] };
  }
  const evidence = asRecord(data.evidence);
  if (evidence) return { lines: [`evidence ${String(evidence.kind ?? '')} · ${shortId(evidence.id) ?? ''}`] };
  return { lines: JSON.stringify(data, null, 2).split('\n') };
}

export function createToolRenderers(tool: MemoryToolName) {
  return {
    renderShell: 'self' as const,
    renderCall(args: Record<string, unknown>, theme: Theme, context: RenderContext): Component {
      const state = context?.state;
      if (state && context.executionStarted && !state.startedAt) state.startedAt = Date.now();
      const isError = Boolean(context?.isError);
      const summary = summarizeCall(tool, args);
      // Read the shared state at render time: the result invalidates this component.
      const callComponent = component((width) => {
        const done = Boolean(state?.hasResult);
        const time = elapsed(state);
        const running = context?.executionStarted && !done ? [theme.fg('dim', 'running…'), time ? theme.fg('dim', time) : ''].filter(Boolean).join(theme.fg('dim', ' · ')) : undefined;
        const title = `${theme.fg('accent', ICON)} ${theme.bold(theme.fg('toolTitle', tool))}`;
        const lines = [rule(theme, '╭', '╮', title, width, isError), ...(summary ? [row(theme, theme.fg('dim', summary), width, isError)] : [])];
        return done ? [...lines, rule(theme, '├', '┤', 'Result', width, isError, 'dim')] : [...lines, rule(theme, '╰', '╯', running, width, isError)];
      });
      if (state) state.callComponent = callComponent;
      return callComponent;
    },
    renderResult(result: RenderResult, options: ToolRenderResultOptions, theme: Theme, context: RenderContext): Component {
      const state = context?.state;
      if (state && !options.isPartial) {
        state.hasResult = true;
        state.finishedAt ??= Date.now();
        state.callComponent?.invalidate?.();
      }
      const isError = Boolean(context?.isError);
      const raw = (result?.content ?? []).filter((block) => block?.type === 'text').map((block) => block.text ?? '').join('\n');
      const { lines, count } = summarizeResult(result?.details, raw);
      const time = elapsed(state);
      return component((width) => {
        const visible = options.expanded ? lines : lines.slice(0, COLLAPSED_LINES);
        const body = visible.map((line) => theme.fg(isError ? 'error' : 'toolOutput', escapeControls(line)));
        if (!options.expanded && lines.length > COLLAPSED_LINES) body.push(theme.fg('dim', `… ${lines.length - COLLAPSED_LINES} more lines · ctrl+o to expand`));
        if (body.length === 0) body.push(theme.fg('dim', '(no output)'));
        const status = options.isPartial ? theme.fg('dim', 'running…') : isError ? theme.fg('error', 'Error') : theme.fg('success', 'Done');
        const footer = [status, time ? theme.fg('dim', time) : '', count ? theme.fg('dim', count) : ''].filter(Boolean).join(theme.fg('dim', ' · '));
        return [...body.map((line) => row(theme, line, width, isError)), rule(theme, '╰', '╯', footer, width, isError)];
      });
    },
  };
}
