import { parse, type TomlTable } from 'smol-toml';

import {
  createManagedConfigConflictPlan,
  INVALID_ROOT_REASON,
  type ManagedConfigPlan,
} from '../managed-config.js';

export const CODEX_MANAGED_BLOCK_START = '# >>> thoth-mem managed >>>';
export const CODEX_MANAGED_BLOCK_END = '# <<< thoth-mem managed <<<';

const OWNED_LOCATION = 'plugins."thoth-mem".mcp_servers."thoth-mem"';

export interface CodexManagedConfigOptions {
  before: string | null;
  force: boolean;
}

export function planCodexManagedConfig(
  options: CodexManagedConfigOptions,
): ManagedConfigPlan {
  const source = options.before ?? '';
  const startMarkers = markerRanges(source, CODEX_MANAGED_BLOCK_START);
  const endMarkers = markerRanges(source, CODEX_MANAGED_BLOCK_END);

  if (
    startMarkers.length > 1
    || endMarkers.length > 1
    || startMarkers.length !== endMarkers.length
    || (startMarkers.length === 1 && startMarkers[0]!.start >= endMarkers[0]!.start)
  ) {
    return createManagedConfigConflictPlan(
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
    return createManagedConfigConflictPlan(
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
    const after = `${source}${separator}${desiredBlock}`;
    return successfulPlan(options.before, after, false);
  }

  const start = startMarkers[0]!;
  const end = endMarkers[0]!;
  const prefix = source.slice(0, start.start);
  const suffix = source.slice(end.end);
  if (suffix.trim().length > 0) {
    return createManagedConfigConflictPlan(
      options.before,
      [OWNED_LOCATION],
      {
        location: 'managed marker block',
        reason: 'The managed marker block is not the final configuration block.',
        forceable: false,
      },
      false,
    );
  }

  const parsedPrefix = parseSafely(prefix);
  if (parsedPrefix === null) {
    return createManagedConfigConflictPlan(
      options.before,
      [OWNED_LOCATION],
      { location: 'root', reason: INVALID_ROOT_REASON, forceable: false },
      false,
    );
  }
  if (hasOwnedTable(parsedPrefix)) {
    return ownedTableConflict(options.before, true, false);
  }

  const existingBlock = source.slice(start.start, end.end);
  if (existingBlock === desiredBlock && hasEnabledOwnedTable(parsedSource)) {
    return successfulPlan(options.before, source, false);
  }

  if (!options.force) {
    return ownedTableConflict(options.before, true, true);
  }

  const after = `${prefix}${desiredBlock}${suffix}`;
  return successfulPlan(options.before, after, true);
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

function parseSafely(source: string): TomlTable | null {
  try {
    return parse(source);
  } catch {
    return null;
  }
}

function tableValue(
  table: TomlTable,
  path: string[],
): unknown {
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
): ManagedConfigPlan {
  return createManagedConfigConflictPlan(
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
): ManagedConfigPlan {
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
  };
}
