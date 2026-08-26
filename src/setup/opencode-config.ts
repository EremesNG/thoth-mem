import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { applyEdits, modify, parse, type ParseError, printParseErrorCode } from 'jsonc-parser';

export interface OpenCodeConfigOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

export interface OpenCodeConfigState {
  path: string;
  text: string;
  plugins: string[];
  managedPlugins: string[];
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

export function isThothMemPluginEntry(value: string): boolean {
  if (value === 'thoth-mem' || value.startsWith('thoth-mem@')) return true;
  if (!value.startsWith('file:')) return false;
  try {
    const segments = decodeURIComponent(new URL(value).pathname).replaceAll('\\', '/').split('/').filter(Boolean);
    return segments.length >= 3 && segments.at(-1) === 'opencode.js' && segments.at(-2) === 'dist' && segments.at(-3) === 'thoth-mem';
  } catch {
    return false;
  }
}

export function inspectOpenCodeConfig(options: OpenCodeConfigOptions = {}): OpenCodeConfigState {
  const path = getOpenCodeConfigPath(options);
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '{}\n';
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false }) as unknown;
  if (errors.length > 0 || value === null || typeof value !== 'object' || Array.isArray(value)) {
    const detail = errors[0] ? printParseErrorCode(errors[0].error) : 'root must be an object';
    throw new Error(`OpenCode configuration is invalid: ${detail}`);
  }
  const plugin = (value as Record<string, unknown>).plugin;
  if (plugin !== undefined && (!Array.isArray(plugin) || plugin.some((entry) => typeof entry !== 'string'))) {
    throw new Error('OpenCode configuration is invalid: plugin must be an array of strings');
  }
  const plugins = (plugin ?? []) as string[];
  return { path, text, plugins, managedPlugins: plugins.filter(isThothMemPluginEntry) };
}

export function desiredOpenCodePlugins(current: string[], desired: string): string[] {
  return [...current.filter((entry) => !isThothMemPluginEntry(entry)), desired];
}

export function updateOpenCodePluginText(text: string, plugins: string[]): string {
  const current = inspectOpenCodeText(text);
  if (JSON.stringify(current) === JSON.stringify(plugins)) return text;
  return applyEdits(text, modify(text, ['plugin'], plugins, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: text.includes('\r\n') ? '\r\n' : '\n' },
  }));
}

function inspectOpenCodeText(text: string): string[] {
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false }) as Record<string, unknown> | undefined;
  if (errors.length > 0 || !value || Array.isArray(value)) throw new Error('OpenCode configuration is invalid during managed edit');
  const plugins = value.plugin ?? [];
  if (!Array.isArray(plugins) || plugins.some((entry) => typeof entry !== 'string')) throw new Error('OpenCode configuration is invalid during managed edit');
  return plugins as string[];
}
