import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyEdits, createScanner, findNodeAtLocation, modify, parse, parseTree, SyntaxKind, type ParseError, printParseErrorCode } from 'jsonc-parser';

export interface OpenCodeConfigOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

export interface OpenCodeConfigState {
  path: string;
  text: string;
  plugins: unknown[];
  legacyPlugins: string[];
  managedPlugins: unknown[];
}

export function getOpenCodeConfigDirectory(options: OpenCodeConfigOptions = {}): string {
  const env = options.env ?? process.env;
  if (env.OPENCODE_CONFIG_DIR?.trim()) return resolve(env.OPENCODE_CONFIG_DIR);
  const root = env.XDG_CONFIG_HOME?.trim() ? resolve(env.XDG_CONFIG_HOME) : join(resolve(options.homeDir ?? homedir()), '.config');
  return join(root, 'opencode');
}

export function getOpenCodeConfigPath(options: OpenCodeConfigOptions = {}): string {
  const directory = getOpenCodeConfigDirectory(options);
  const json = join(directory, 'opencode.json');
  const jsonc = join(directory, 'opencode.jsonc');
  if (existsSync(json)) return json;
  if (existsSync(jsonc)) return jsonc;
  return json;
}

export function isThothMemPluginEntry(value: unknown): boolean {
  if (Array.isArray(value)) return isThothMemPluginEntry(value[0]);
  if (value && typeof value === 'object') return isThothMemPluginEntry((value as Record<string, unknown>).package);
  if (typeof value !== 'string') return false;
  if (value === 'thoth-mem' || value.startsWith('thoth-mem@')) return true;
  try {
    const path = value.startsWith('file:') ? decodeURIComponent(new URL(value).pathname) : value;
    const localPath = value.startsWith('file:') ? (() => { try { return fileURLToPath(value); } catch { return path; } })() : path;
    if (!isAbsolute(path)) return false;
    // Recognize old loader file URLs even when the checkout no longer exists.
    const normalized = path.replaceAll('\\', '/').replace(/\/$/u, '');
    if (normalized.endsWith('/thoth-mem/dist/opencode.js') || normalized.endsWith('/thoth-mem')) return true;
    const metadata = JSON.parse(readFileSync(join(localPath, 'package.json'), 'utf8')) as { name?: unknown };
    return metadata.name === 'thoth-mem';
  } catch {
    return false;
  }
}

function inspectOpenCodeText(text: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false }) as unknown;
  if (errors.length > 0 || value === null || typeof value !== 'object' || Array.isArray(value)) {
    const detail = errors[0] ? printParseErrorCode(errors[0].error) : 'root must be an object';
    throw new Error(`OpenCode configuration is invalid: ${detail}`);
  }
  const config = value as Record<string, unknown>;
  if (config.plugins !== undefined && !Array.isArray(config.plugins)) throw new Error('OpenCode configuration is invalid: plugins must be an array');
  if (config.plugin !== undefined && (!Array.isArray(config.plugin) || config.plugin.some((entry) => typeof entry !== 'string'))) {
    throw new Error('OpenCode configuration is invalid: plugin must be an array of strings');
  }
  return config;
}

export function inspectOpenCodeConfig(options: OpenCodeConfigOptions = {}): OpenCodeConfigState {
  const path = getOpenCodeConfigPath(options);
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '{}\n';
  const value = inspectOpenCodeText(text);
  const plugins = (value.plugins ?? []) as unknown[];
  const legacyPlugins = (value.plugin ?? []) as string[];
  return { path, text, plugins, legacyPlugins, managedPlugins: plugins.filter(isThothMemPluginEntry) };
}

export function desiredOpenCodePlugins(current: unknown[], desired: string): unknown[] {
  return [...current.filter((entry) => !isThothMemPluginEntry(entry)), desired];
}

/** Edit individual array entries so comments on unrelated plugins survive migration. */
export function updateOpenCodePluginText(text: string, plugins: unknown[], legacyPlugins?: string[]): string {
  const value = inspectOpenCodeText(text);
  const edit = (path: (string | number)[], next: unknown): void => {
    text = applyEdits(text, modify(text, path, next, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: text.includes('\r\n') ? '\r\n' : '\n' },
    }));
  };
  const updateArray = (key: string, current: unknown[], desired: unknown[]): void => {
    if (JSON.stringify(current) === JSON.stringify(desired)) return;
    // Only managed entries change; retain every unrelated entry and its order.
    for (let index = current.length - 1; index >= 0; index--) {
      if (!isThothMemPluginEntry(current[index])) continue;
      const tree = parseTree(text);
      const array = tree && findNodeAtLocation(tree, [key]);
      const node = array?.children?.[index];
      if (!node) throw new Error('OpenCode managed plugin edit could not locate entry');
      // jsonc-parser's array deletion can leave a quote behind; use its AST ranges
      // and scanner instead, retaining all surrounding comments and whitespace.
      const scanner = createScanner(text, true);
      const previous = array.children?.[index - 1];
      scanner.setPosition(index > 0 ? (previous?.offset ?? 0) + (previous?.length ?? 0) : node.offset + node.length);
      const comma = scanner.scan() === SyntaxKind.CommaToken ? scanner.getTokenOffset() : null;
      text = applyEdits(text, [
        { offset: node.offset, length: node.length, content: '' },
        ...(comma === null ? [] : [{ offset: comma, length: 1, content: '' }]),
      ]);
    }
    const retained = current.filter((entry) => !isThothMemPluginEntry(entry)).length;
    const managed = desired.filter(isThothMemPluginEntry);
    for (const [index, entry] of managed.entries()) edit([key, retained + index], entry);
  };
  updateArray('plugins', (value.plugins ?? []) as unknown[], plugins);
  const legacy = (value.plugin ?? []) as string[];
  const nextLegacy = legacyPlugins ?? legacy.filter((entry) => !isThothMemPluginEntry(entry));
  // Keep a pre-existing empty array; drop the key only when it contained solely ours.
  if (legacy.length > 0 && nextLegacy.length === 0) edit(['plugin'], undefined);
  else updateArray('plugin', legacy, nextLegacy);
  return text;
}
