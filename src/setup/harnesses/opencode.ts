import { createHash } from 'node:crypto';

import {
  applyEdits,
  modify,
  parse,
  type ParseError,
} from 'jsonc-parser';

import {
  createManagedConfigConflictPlan,
  INVALID_ROOT_REASON,
  type ManagedConfigPlan,
} from '../managed-config.js';

const OWNED_LOCATION = 'mcp.thoth-mem';
const JSONC_PARSE_OPTIONS = {
  allowTrailingComma: true,
  disallowComments: false,
} as const;

export interface OpenCodeManagedConfigOptions {
  before: string | null;
  force: boolean;
  mcpValue: {
    type: 'local';
    command: string[];
    enabled: boolean;
  };
}

export interface OpenCodeOwnedState {
  valid: boolean;
  configPresent: boolean;
  ownedPresent: boolean;
  hash: string;
  value?: unknown;
}

export type OpenCodeRollbackPlan =
  | { ok: false; reason: 'current_invalid' | 'backup_invalid' | 'owned_diverged' }
  | {
      ok: true;
      after: string | null;
      changed: boolean;
      diverged: boolean;
      postHash: string;
    };

export function planOpenCodeManagedConfig(
  options: OpenCodeManagedConfigOptions,
): ManagedConfigPlan {
  const source = options.before ?? '{\n}\n';
  const parsed = parseJsonc(source);

  if (parsed === null || !isRecord(parsed)) {
    return createManagedConfigConflictPlan(
      options.before,
      [OWNED_LOCATION],
      { location: 'root', reason: INVALID_ROOT_REASON, forceable: false },
      false,
    );
  }

  const currentMcp = parsed.mcp;
  if (currentMcp !== undefined && !isRecord(currentMcp)) {
    return createManagedConfigConflictPlan(
      options.before,
      [OWNED_LOCATION],
      {
        location: 'mcp',
        reason: 'The parent configuration value is not an object.',
        forceable: false,
      },
      true,
    );
  }

  const currentOwned = currentMcp?.['thoth-mem'];
  const hasOwnedValue = currentOwned !== undefined;
  if (hasOwnedValue && valuesEqual(currentOwned, options.mcpValue)) {
    return successfulPlan(options.before, source, false, options.mcpValue);
  }

  if (hasOwnedValue && !options.force) {
    return createManagedConfigConflictPlan(
      options.before,
      [OWNED_LOCATION],
      {
        location: OWNED_LOCATION,
        reason: 'The managed configuration value differs from the requested value.',
        forceable: true,
      },
      true,
    );
  }

  const path = currentMcp === undefined ? ['mcp'] : ['mcp', 'thoth-mem'];
  const value = currentMcp === undefined
    ? { 'thoth-mem': options.mcpValue }
    : options.mcpValue;
  const after = applyEdits(source, modify(source, path, value, currentMcp === undefined
    ? {
        formattingOptions: {
          insertSpaces: true,
          tabSize: 2,
          eol: source.includes('\r\n') ? '\r\n' : '\n',
          insertFinalNewline: source.endsWith('\n'),
        },
      }
    : {}));

  return successfulPlan(
    options.before,
    after,
    hasOwnedValue,
    options.mcpValue,
  );
}

export function inspectOpenCodeOwnedState(text: string | null): OpenCodeOwnedState {
  if (text === null) {
    return {
      valid: true,
      configPresent: false,
      ownedPresent: false,
      hash: hashSemanticValue('owned-missing'),
    };
  }
  const parsed = parseJsonc(text);
  if (!isRecord(parsed)) {
    return {
      valid: false,
      configPresent: true,
      ownedPresent: false,
      hash: hashSemanticValue('config-invalid'),
    };
  }
  if (parsed.mcp !== undefined && !isRecord(parsed.mcp)) {
    return {
      valid: false,
      configPresent: true,
      ownedPresent: false,
      hash: hashSemanticValue('mcp-invalid'),
    };
  }
  const value = isRecord(parsed.mcp) ? parsed.mcp['thoth-mem'] : undefined;
  return value === undefined
    ? {
        valid: true,
        configPresent: true,
        ownedPresent: false,
        hash: hashSemanticValue('owned-missing'),
      }
    : {
        valid: true,
        configPresent: true,
        ownedPresent: true,
        hash: hashSemanticValue({ owned: value }),
        value,
      };
}

export function planOpenCodeManagedRollback(options: {
  current: string | null;
  before: string | null;
  expectedPostHash: string;
  force: boolean;
}): OpenCodeRollbackPlan {
  const currentState = inspectOpenCodeOwnedState(options.current);
  if (!currentState.valid) {
    return { ok: false, reason: 'current_invalid' };
  }
  const beforeState = inspectOpenCodeOwnedState(options.before);
  if (!beforeState.valid) {
    return { ok: false, reason: 'backup_invalid' };
  }
  const diverged = currentState.hash !== options.expectedPostHash;
  if (diverged && !options.force) {
    return { ok: false, reason: 'owned_diverged' };
  }
  if (options.current === null && !beforeState.ownedPresent) {
    return {
      ok: true,
      after: null,
      changed: false,
      diverged,
      postHash: beforeState.hash,
    };
  }

  const source = options.current ?? '{\n}\n';
  let after = applyEdits(
    source,
    modify(
      source,
      ['mcp', 'thoth-mem'],
      beforeState.ownedPresent ? beforeState.value : undefined,
      {
        formattingOptions: {
          insertSpaces: true,
          tabSize: 2,
          eol: source.includes('\r\n') ? '\r\n' : '\n',
          insertFinalNewline: source.endsWith('\n'),
        },
      },
    ),
  );
  const parsedAfterOwnedEdit = parseJsonc(after);
  if (
    !beforeState.ownedPresent
    && isRecord(parsedAfterOwnedEdit)
    && isRecord(parsedAfterOwnedEdit.mcp)
    && Object.keys(parsedAfterOwnedEdit.mcp).length === 0
  ) {
    after = applyEdits(after, modify(after, ['mcp'], undefined, {}));
  }
  const parsedAfter = parseJsonc(after);
  if (!isRecord(parsedAfter)) {
    return { ok: false, reason: 'current_invalid' };
  }
  const removeCreatedConfig = !beforeState.configPresent
    && Object.keys(parsedAfter).length === 0;
  const finalAfter = removeCreatedConfig ? null : after;
  return {
    ok: true,
    after: finalAfter,
    changed: finalAfter !== options.current,
    diverged,
    postHash: beforeState.hash,
  };
}

function parseJsonc(source: string): unknown | null {
  const errors: ParseError[] = [];
  const parsed = parse(source, errors, JSONC_PARSE_OPTIONS) as unknown;
  return errors.length === 0 ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => valuesEqual(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => (
      Object.prototype.hasOwnProperty.call(right, key)
      && valuesEqual(left[key], right[key])
    ));
}

function hashSemanticValue(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) {
    throw new Error('opencode-canonicalization-failed');
  }
  return encoded;
}

function successfulPlan(
  before: string | null,
  after: string,
  forced: boolean,
  desired: OpenCodeManagedConfigOptions['mcpValue'],
): ManagedConfigPlan {
  const parsed = parseJsonc(after);
  const owned = isRecord(parsed) && isRecord(parsed.mcp)
    ? parsed.mcp['thoth-mem']
    : undefined;

  return {
    before,
    after,
    changed: after !== before,
    forced,
    ownedLocations: [OWNED_LOCATION],
    conflicts: [],
    verification: {
      beforeValid: true,
      afterValid: parsed !== null && isRecord(parsed),
      ownedValuesMatch: valuesEqual(owned, desired),
    },
  };
}
