import { createHash } from 'node:crypto';

import { parse, type TomlTable } from 'smol-toml';

import {
  createManagedConfigConflictPlan,
  INVALID_ROOT_REASON,
  type ManagedConfigConflict,
  type ManagedConfigPlan,
} from '../managed-config.js';

export const CODEX_MANAGED_BLOCK_START = '# >>> thoth-mem managed >>>';
export const CODEX_MANAGED_BLOCK_END = '# <<< thoth-mem managed <<<';

const OWNED_LOCATION = 'plugins."thoth-mem".mcp_servers."thoth-mem"';
const MAX_MANAGED_FRAGMENT_BYTES = 4 * 1024;

export interface CodexManagedConfigOptions {
  before: string | null;
  force: boolean;
}

export interface CodexManagedFragment {
  kind: 'insert' | 'replace';
  ownedLocation: string;
  leadingSeparator: string;
  beforeText: string | null;
  beforeHash: string | null;
  afterText: string;
  afterHash: string;
}

export interface CodexManagedFragmentPlan extends ManagedConfigPlan {
  fragment: CodexManagedFragment | null;
}

export function planCodexManagedConfig(
  options: CodexManagedConfigOptions,
): ManagedConfigPlan {
  return planCodexManagedFragment(options);
}

export function planCodexManagedFragment(
  options: CodexManagedConfigOptions,
): CodexManagedFragmentPlan {
  const source = options.before ?? '';
  const startMarkers = markerRanges(source, CODEX_MANAGED_BLOCK_START);
  const endMarkers = markerRanges(source, CODEX_MANAGED_BLOCK_END);

  if (
    startMarkers.length > 1
    || endMarkers.length > 1
    || startMarkers.length !== endMarkers.length
    || (startMarkers.length === 1 && startMarkers[0]!.start >= endMarkers[0]!.start)
  ) {
    return conflictPlan(
      options.before,
      [OWNED_LOCATION],
      {
        location: 'managed marker block',
        reason: 'The managed marker structure is incomplete or duplicated.',
        forceable: false,
      },
      false,
    );
  }

  const parsedSource = parseSafely(source);
  if (parsedSource === null) {
    return conflictPlan(
      options.before,
      [OWNED_LOCATION],
      { location: 'root', reason: INVALID_ROOT_REASON, forceable: false },
      false,
    );
  }

  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const desiredBlock = managedBlock(eol);

  if (startMarkers.length === 0) {
    if (hasOwnedTable(parsedSource)) {
      return ownedTableConflict(options.before, true, false);
    }
    const separator = source.length === 0
      ? ''
      : source.endsWith('\n')
        ? eol
        : `${eol}${eol}`;
    const fragment: CodexManagedFragment = {
      kind: 'insert',
      ownedLocation: OWNED_LOCATION,
      leadingSeparator: separator,
      beforeText: null,
      beforeHash: null,
      afterText: desiredBlock,
      afterHash: fragmentHash(desiredBlock),
    };
    return successfulPlan(options.before, `${source}${separator}${desiredBlock}`, false, fragment);
  }

  const start = startMarkers[0]!;
  const end = endMarkers[0]!;
  const prefix = source.slice(0, start.start);
  const suffix = source.slice(end.end);
  const parsedOutside = parseSafely(`${prefix}${suffix}`);
  if (parsedOutside === null) {
    return conflictPlan(
      options.before,
      [OWNED_LOCATION],
      { location: 'root', reason: INVALID_ROOT_REASON, forceable: false },
      false,
    );
  }
  if (hasOwnedTable(parsedOutside)) {
    return ownedTableConflict(options.before, true, false);
  }

  const existingBlock = source.slice(start.start, end.end);
  if (Buffer.byteLength(existingBlock, 'utf8') > MAX_MANAGED_FRAGMENT_BYTES) {
    return conflictPlan(
      options.before,
      [OWNED_LOCATION],
      {
        location: 'managed marker block',
        reason: 'The managed marker fragment exceeds the supported evidence bound.',
        forceable: false,
      },
      true,
    );
  }
  if (existingBlock === desiredBlock && hasEnabledOwnedTable(parsedSource)) {
    return successfulPlan(options.before, source, false, null);
  }
  if (!isReplaceableOwnedBlock(existingBlock, eol)) {
    return conflictPlan(
      options.before,
      [OWNED_LOCATION],
      {
        location: 'managed marker block',
        reason: 'The managed marker fragment contains unrecognized or additional configuration.',
        forceable: false,
      },
      true,
    );
  }
  if (!options.force) {
    return ownedTableConflict(options.before, true, true);
  }

  const fragment: CodexManagedFragment = {
    kind: 'replace',
    ownedLocation: OWNED_LOCATION,
    leadingSeparator: '',
    beforeText: existingBlock,
    beforeHash: fragmentHash(existingBlock),
    afterText: desiredBlock,
    afterHash: fragmentHash(desiredBlock),
  };
  return successfulPlan(
    options.before,
    `${prefix}${desiredBlock}${suffix}`,
    true,
    fragment,
  );
}

export function applyCodexManagedFragment(
  current: string | null,
  fragment: CodexManagedFragment,
): string {
  validateFragment(fragment);
  const source = current ?? '';
  if (fragment.kind === 'insert') {
    const currentPlan = planCodexManagedFragment({ before: source, force: false });
    if (currentPlan.conflicts.length > 0 || currentPlan.fragment?.kind !== 'insert') {
      throw new Error('codex-managed-fragment-prestate-diverged');
    }
    const after = `${source}${fragment.leadingSeparator}${fragment.afterText}`;
    if (parseSafely(after) === null) {
      throw new Error('codex-managed-fragment-result-invalid');
    }
    return after;
  }

  const range = exactCurrentRange(source, fragment.beforeText, fragment.beforeHash);
  const after = `${source.slice(0, range.start)}${fragment.afterText}${source.slice(range.end)}`;
  if (parseSafely(after) === null) {
    throw new Error('codex-managed-fragment-result-invalid');
  }
  return after;
}

export function restoreCodexManagedFragment(
  current: string,
  fragment: CodexManagedFragment,
): string {
  validateFragment(fragment);
  const range = exactCurrentRange(current, fragment.afterText, fragment.afterHash);
  if (fragment.kind === 'replace') {
    const restored = `${current.slice(0, range.start)}${fragment.beforeText ?? ''}${current.slice(range.end)}`;
    if (parseSafely(restored) === null) {
      throw new Error('codex-managed-fragment-restore-invalid');
    }
    return restored;
  }

  let start = range.start;
  if (
    fragment.leadingSeparator.length > 0
    && current.slice(start - fragment.leadingSeparator.length, start) === fragment.leadingSeparator
  ) {
    start -= fragment.leadingSeparator.length;
  }
  const restored = `${current.slice(0, start)}${current.slice(range.end)}`;
  if (parseSafely(restored) === null) {
    throw new Error('codex-managed-fragment-restore-invalid');
  }
  return restored;
}

export function captureCodexManagedFragment(current: string): CodexManagedFragment {
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  const expected = managedBlock(eol);
  const range = exactCurrentRange(current, expected, fragmentHash(expected));
  const outside = `${current.slice(0, range.start)}${current.slice(range.end)}`;
  const parsedOutside = parseSafely(outside);
  if (parsedOutside === null || hasOwnedTable(parsedOutside)) {
    throw new Error('codex-managed-fragment-ownership-ambiguous');
  }
  const prefix = current.slice(0, range.start);
  const leadingSeparator = prefix.endsWith(`${eol}${eol}`) ? eol : '';
  return {
    kind: 'insert',
    ownedLocation: OWNED_LOCATION,
    leadingSeparator,
    beforeText: null,
    beforeHash: null,
    afterText: expected,
    afterHash: fragmentHash(expected),
  };
}

interface MarkerRange {
  start: number;
  end: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function markerRanges(source: string, marker: string): MarkerRange[] {
  const expression = new RegExp(`^${escapeRegExp(marker)}(?:\\r?\\n|$)`, 'gm');
  return Array.from(source.matchAll(expression), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function managedBlock(eol: string): string {
  return [
    CODEX_MANAGED_BLOCK_START,
    '[plugins."thoth-mem".mcp_servers."thoth-mem"]',
    'enabled = true',
    CODEX_MANAGED_BLOCK_END,
    '',
  ].join(eol);
}

function isReplaceableOwnedBlock(block: string, eol: string): boolean {
  return block === managedBlock(eol).replace('enabled = true', 'enabled = false');
}

function fragmentHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function validateFragment(fragment: CodexManagedFragment): void {
  if (
    fragment.ownedLocation !== OWNED_LOCATION
    || Buffer.byteLength(fragment.afterText, 'utf8') > MAX_MANAGED_FRAGMENT_BYTES
    || fragment.afterHash !== fragmentHash(fragment.afterText)
    || (fragment.beforeText === null) !== (fragment.beforeHash === null)
    || (fragment.beforeText !== null && fragment.beforeHash !== fragmentHash(fragment.beforeText))
  ) {
    throw new Error('codex-managed-fragment-evidence-invalid');
  }
}

function exactCurrentRange(
  source: string,
  expectedText: string | null,
  expectedHash: string | null,
): MarkerRange {
  if (expectedText === null || expectedHash === null) {
    throw new Error('codex-managed-fragment-evidence-invalid');
  }
  const starts = markerRanges(source, CODEX_MANAGED_BLOCK_START);
  const ends = markerRanges(source, CODEX_MANAGED_BLOCK_END);
  if (starts.length !== 1 || ends.length !== 1 || starts[0]!.start >= ends[0]!.start) {
    throw new Error('codex-managed-fragment-prestate-diverged');
  }
  const range = { start: starts[0]!.start, end: ends[0]!.end };
  const actual = source.slice(range.start, range.end);
  if (actual !== expectedText || fragmentHash(actual) !== expectedHash) {
    throw new Error('codex-managed-fragment-prestate-diverged');
  }
  return range;
}

function parseSafely(source: string): TomlTable | null {
  try {
    return parse(source);
  } catch {
    return null;
  }
}

function tableValue(table: TomlTable, path: string[]): unknown {
  let current: unknown = table;
  for (const segment of path) {
    if (!isTomlTable(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function isTomlTable(value: unknown): value is TomlTable {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwnedTable(table: TomlTable): boolean {
  return tableValue(table, ['plugins', 'thoth-mem', 'mcp_servers', 'thoth-mem']) !== undefined;
}

function hasEnabledOwnedTable(table: TomlTable): boolean {
  const owned = tableValue(table, ['plugins', 'thoth-mem', 'mcp_servers', 'thoth-mem']);
  return isTomlTable(owned) && owned.enabled === true;
}

function ownedTableConflict(
  before: string | null,
  beforeValid: boolean,
  forceable: boolean,
): CodexManagedFragmentPlan {
  return conflictPlan(
    before,
    [OWNED_LOCATION],
    {
      location: OWNED_LOCATION,
      reason: forceable
        ? 'The managed policy block differs from the requested policy.'
        : 'The owned policy table exists outside the managed marker block.',
      forceable,
    },
    beforeValid,
  );
}

function successfulPlan(
  before: string | null,
  after: string,
  forced: boolean,
  fragment: CodexManagedFragment | null,
): CodexManagedFragmentPlan {
  const parsedAfter = parseSafely(after);
  return {
    before,
    after,
    changed: after !== before,
    forced,
    ownedLocations: [OWNED_LOCATION],
    conflicts: [],
    verification: {
      beforeValid: true,
      afterValid: parsedAfter !== null,
      ownedValuesMatch: parsedAfter !== null && hasEnabledOwnedTable(parsedAfter),
    },
    fragment,
  };
}

function conflictPlan(
  before: string | null,
  ownedLocations: string[],
  conflict: ManagedConfigConflict,
  beforeValid: boolean,
): CodexManagedFragmentPlan {
  return {
    ...createManagedConfigConflictPlan(before, ownedLocations, conflict, beforeValid),
    fragment: null,
  };
}
