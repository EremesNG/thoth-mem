import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { z } from 'zod';

const providerConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(2),
  dataDir: z.string().trim().min(1).optional(),
  runtimeEntry: z.string().trim().min(1).refine(isAbsolute).optional(),
  recall: z.object({
    compactChars: z.number().int().min(64).max(20_000).optional(),
    contextChars: z.number().int().min(64).max(20_000).optional(),
  }).strict().optional(),
  plugins: z.object({
    opencode: z.boolean().optional(),
    codex: z.boolean().optional(),
    claudeCode: z.boolean().optional(),
  }).strict().optional(),
}).strict();

export type ProviderConfig = z.infer<typeof providerConfigSchema>;

export interface RuntimeConfigOptions {
  explicitDataDir?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

export interface ResolvedRuntimeConfig {
  configPath: string;
  dataDir: string;
  source: 'explicit' | 'environment' | 'file' | 'default';
  provider: ProviderConfig | null;
}

export interface RuntimeConfigUpdate {
  dataDir?: string;
  runtimeEntry?: string | null;
}

function providerConfigError(reason: string): Error {
  return new Error(`thoth-mem provider configuration is invalid: ${reason}`);
}

export function getRuntimeConfigPath(options: Pick<RuntimeConfigOptions, 'env' | 'homeDir'> = {}): string {
  const env = options.env ?? process.env;
  const home = resolve(options.homeDir ?? homedir());
  const configRoot = env.XDG_CONFIG_HOME?.trim() ? resolve(env.XDG_CONFIG_HOME) : join(home, '.config');
  return join(configRoot, 'thoth-mem', 'config.json');
}

function readProviderConfig(path: string): ProviderConfig | null {
  if (!existsSync(path)) return null;
  try {
    if (!statSync(path).isFile()) throw providerConfigError('config path is not a regular file');
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    const result = providerConfigSchema.safeParse(parsed);
    if (!result.success) throw providerConfigError('schema-v2 validation failed');
    return result.data;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('thoth-mem provider configuration')) throw error;
    throw providerConfigError(error instanceof SyntaxError ? 'JSON parsing failed' : 'config file could not be read');
  }
}

function selectedDataDir(value: string, label: string): string {
  if (!value.trim()) throw providerConfigError(`${label} data directory is empty`);
  return resolve(value);
}

export function loadRuntimeConfig(options: RuntimeConfigOptions = {}): ResolvedRuntimeConfig {
  const env = options.env ?? process.env;
  const home = resolve(options.homeDir ?? homedir());
  const configPath = getRuntimeConfigPath({ env, homeDir: home });
  const provider = readProviderConfig(configPath);

  if (options.explicitDataDir !== undefined) {
    return { configPath, dataDir: selectedDataDir(options.explicitDataDir, 'explicit'), source: 'explicit', provider };
  }
  if (env.THOTH_MEM_DATA_DIR?.trim()) {
    return { configPath, dataDir: selectedDataDir(env.THOTH_MEM_DATA_DIR, 'environment'), source: 'environment', provider };
  }
  if (provider?.dataDir) {
    return { configPath, dataDir: selectedDataDir(provider.dataDir, 'persisted'), source: 'file', provider };
  }
  return { configPath, dataDir: join(home, '.thoth-mem'), source: 'default', provider };
}

export function persistRuntimeConfig(update: RuntimeConfigUpdate, options: Pick<RuntimeConfigOptions, 'env' | 'homeDir'> = {}): { path: string; changed: boolean } {
  const path = getRuntimeConfigPath(options);
  const current = readProviderConfig(path) ?? { version: 2 as const };
  const candidate: Record<string, unknown> = { ...current };
  if (update.dataDir !== undefined) candidate.dataDir = selectedDataDir(update.dataDir, 'persisted');
  if (update.runtimeEntry === null) delete candidate.runtimeEntry;
  else if (update.runtimeEntry !== undefined) candidate.runtimeEntry = resolve(update.runtimeEntry);
  const next = providerConfigSchema.parse(candidate);
  if (JSON.stringify(current) === JSON.stringify(next)) return { path, changed: false };

  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporaryPath, path);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw providerConfigError('atomic data directory update failed');
  }
  return { path, changed: true };
}

export function persistRuntimeDataDir(dataDir: string, options: Pick<RuntimeConfigOptions, 'env' | 'homeDir'> = {}): { path: string; changed: boolean; dataDir: string } {
  const resolvedDataDir = selectedDataDir(dataDir, 'persisted');
  const result = persistRuntimeConfig({ dataDir: resolvedDataDir }, options);
  return { ...result, dataDir: resolvedDataDir };
}
