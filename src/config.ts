import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface ThothConfig {
  dataDir: string;
  dbPath: string;            // resolved: {dataDir}/thoth.db
  maxContentLength: number;
  maxContextResults: number;
  maxSearchResults: number;
  dedupeWindowMinutes: number;
  previewLength: number;
}

/**
 * Resolve home directory with Windows MCP subprocess fallbacks.
 * MCP subprocesses on Windows often lack proper HOME. This matches
 * engram's resolveHomeFallback() pattern.
 * Tries: os.homedir() -> USERPROFILE -> HOME -> LOCALAPPDATA
 */
function resolveHome(): string {
  try {
    const home = homedir();
    if (home && home !== '') return home;
  } catch {
    // homedir() can throw in broken environments
  }

  const fallbacks = ['USERPROFILE', 'HOME', 'LOCALAPPDATA'];
  for (const envVar of fallbacks) {
    const val = process.env[envVar];
    if (val && val !== '') return val;
  }

  throw new Error('Cannot resolve home directory. Set THOTH_DATA_DIR environment variable.');
}

export function getConfig(): ThothConfig {
  const home = resolveHome();
  const dataDir = process.env.THOTH_DATA_DIR || join(home, '.thoth');

  return {
    dataDir,
    dbPath: join(dataDir, 'thoth.db'),
    maxContentLength: parseInt(process.env.THOTH_MAX_CONTENT_LENGTH || '100000', 10),
    maxContextResults: parseInt(process.env.THOTH_MAX_CONTEXT_RESULTS || '20', 10),
    maxSearchResults: parseInt(process.env.THOTH_MAX_SEARCH_RESULTS || '20', 10),
    dedupeWindowMinutes: parseInt(process.env.THOTH_DEDUPE_WINDOW_MINUTES || '15', 10),
    previewLength: parseInt(process.env.THOTH_PREVIEW_LENGTH || '300', 10),
  };
}

/**
 * Ensure the data directory exists (creates recursively if missing).
 */
export function resolveDataDir(config: ThothConfig): void {
  mkdirSync(config.dataDir, { recursive: true });
}
