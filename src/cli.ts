import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ThothConfig } from './config.js';
import { getConfig, resolveDataDir } from './config.js';
import { Store } from './store/index.js';
import { OBSERVATION_TYPES } from './store/types.js';
import type { ExportData, Observation, ObservationScope, ObservationType } from './store/types.js';
import { syncExport } from './sync/index.js';
import { formatObservationMarkdown, formatSearchResultMarkdown } from './utils/content.js';

export const VERSION = '0.1.2';

const HELP_TEXT = `thoth-mem — Persistent memory for AI coding agents

Usage:
  thoth-mem [command] [options]

Commands:
  mcp                    Start MCP server (default)
  search <query>         Search memories
  save <title> <content> Save a memory
  timeline <obs_id>      Chronological context
  context [project]      Recent session context
  stats                  Memory statistics
  export [file]          Export to JSON
  import <file>          Import from JSON
  sync                   Git sync export
  migrate-project <old> <new>  Rename a project
  version                Show version
  help                   Show this help

Global Options:
  --data-dir=<path>      Data directory (default: ~/.thoth)
  -p, --project <name>   Filter by project
  --help                 Show help
`;

class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}

interface GlobalOptions {
  dataDir?: string;
  project?: string;
  help: boolean;
}

interface ParsedArgs {
  command?: string;
  positionals: string[];
  globals: GlobalOptions;
}

interface StoreContext {
  store: Store;
  config: ThothConfig;
}

export function isCliError(error: unknown): error is CliError {
  return error instanceof CliError;
}

function printStdout(text: string): void {
  process.stdout.write(`${text}\n`);
}

function printStderr(text: string): void {
  process.stderr.write(`${text}\n`);
}

function fail(message: string): never {
  throw new CliError(message);
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) {
    fail(`Missing value for ${option}`);
  }
  return value;
}

function parseGlobals(args: string[]): ParsedArgs {
  const globals: GlobalOptions = { help: false };
  const remaining: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === '--help') {
      globals.help = true;
      continue;
    }

    if (arg === '--data-dir') {
      globals.dataDir = requireValue(args, index, '--data-dir');
      index++;
      continue;
    }

    if (arg.startsWith('--data-dir=')) {
      globals.dataDir = arg.slice('--data-dir='.length);
      if (!globals.dataDir) {
        fail('Missing value for --data-dir');
      }
      continue;
    }

    if (arg === '-p' || arg === '--project') {
      globals.project = requireValue(args, index, arg);
      index++;
      continue;
    }

    if (arg.startsWith('--project=')) {
      globals.project = arg.slice('--project='.length);
      if (!globals.project) {
        fail('Missing value for --project');
      }
      continue;
    }

    remaining.push(arg);
  }

  const [command, ...positionals] = remaining;
  return { command, positionals, globals };
}

function parseOptionValue(positionals: string[], optionNames: string[]): { value?: string; rest: string[] } {
  const rest: string[] = [];
  let value: string | undefined;

  for (let index = 0; index < positionals.length; index++) {
    const arg = positionals[index];
    const exactMatch = optionNames.find((name) => arg === name);
    const prefixMatch = optionNames.find((name) => arg.startsWith(`${name}=`));

    if (exactMatch) {
      value = requireValue(positionals, index, exactMatch);
      index++;
      continue;
    }

    if (prefixMatch) {
      value = arg.slice(prefixMatch.length + 1);
      if (!value) {
        fail(`Missing value for ${prefixMatch}`);
      }
      continue;
    }

    rest.push(arg);
  }

  return { value, rest };
}

function ensureNoExtraArgs(args: string[], command: string): void {
  if (args.length > 0) {
    fail(`Unexpected arguments for ${command}: ${args.join(' ')}`);
  }
}

function parseInteger(value: string, option: string, minimum: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    fail(`Invalid value for ${option}: ${value}`);
  }
  return parsed;
}

function parseObservationId(value: string): number {
  return parseInteger(value, 'obs_id', 1);
}

function parseObservationType(value: string): ObservationType {
  if (OBSERVATION_TYPES.includes(value as ObservationType)) {
    return value as ObservationType;
  }

  fail(`Invalid type: ${value}. Expected one of: ${OBSERVATION_TYPES.join(', ')}`);
}

function parseScope(value: string): ObservationScope {
  if (value === 'project' || value === 'personal') {
    return value;
  }

  fail(`Invalid scope: ${value}. Expected one of: project, personal`);
}

function createStoreContext(dataDir?: string): StoreContext {
  const config = getConfig();

  if (dataDir) {
    config.dataDir = dataDir;
    config.dbPath = join(dataDir, 'thoth.db');
  }

  resolveDataDir(config);

  return {
    store: new Store(config.dbPath, config),
    config,
  };
}

async function withStore<T>(dataDir: string | undefined, action: (context: StoreContext) => Promise<T> | T): Promise<T> {
  const context = createStoreContext(dataDir);

  try {
    return await action(context);
  } finally {
    context.store.close();
  }
}

function formatTimelineObservation(observation: Observation): string {
  return formatObservationMarkdown(observation);
}

function printHelp(): void {
  printStdout(HELP_TEXT.trimEnd());
}

async function handleSearch(positionals: string[], globals: GlobalOptions): Promise<void> {
  const parsedLimit = parseOptionValue(positionals, ['--limit']);
  const query = parsedLimit.rest.join(' ').trim();

  if (!query) {
    fail('search requires <query>');
  }

  const limit = parsedLimit.value ? parseInteger(parsedLimit.value, '--limit', 1) : undefined;

  await withStore(globals.dataDir, ({ store }) => {
    const results = store.searchObservations({ query, project: globals.project, limit });
    printStdout(formatSearchResultMarkdown(results));
  });
}

async function handleSave(positionals: string[], globals: GlobalOptions): Promise<void> {
  const parsedType = parseOptionValue(positionals, ['--type']);
  const parsedScope = parseOptionValue(parsedType.rest, ['--scope']);

  if (parsedScope.rest.length !== 2) {
    fail('save requires <title> <content>');
  }

  const [title, content] = parsedScope.rest;
  const type = parsedType.value ? parseObservationType(parsedType.value) : undefined;
  const scope = parsedScope.value ? parseScope(parsedScope.value) : undefined;

  await withStore(globals.dataDir, ({ store }) => {
    const result = store.saveObservation({
      title,
      content,
      type,
      project: globals.project,
      scope,
    });

    printStdout([
      `Action: ${result.action}`,
      '',
      formatObservationMarkdown(result.observation),
    ].join('\n'));
  });
}

async function handleTimeline(positionals: string[], globals: GlobalOptions): Promise<void> {
  const parsedBefore = parseOptionValue(positionals, ['--before']);
  const parsedAfter = parseOptionValue(parsedBefore.rest, ['--after']);

  if (parsedAfter.rest.length !== 1) {
    fail('timeline requires <obs_id>');
  }

  const observationId = parseObservationId(parsedAfter.rest[0]);
  const before = parsedBefore.value ? parseInteger(parsedBefore.value, '--before', 0) : 5;
  const after = parsedAfter.value ? parseInteger(parsedAfter.value, '--after', 0) : 5;

  await withStore(globals.dataDir, ({ store }) => {
    const timeline = store.getTimeline({ observation_id: observationId, before, after });

    if (!timeline.focus) {
      fail(`Observation ${observationId} not found`);
    }

    const beforeText = timeline.before.length > 0
      ? timeline.before.map((observation) => formatTimelineObservation(observation)).join('\n\n')
      : 'No earlier observations in this session';
    const focusText = formatTimelineObservation(timeline.focus).replace(
      `### [${timeline.focus.type}] ${timeline.focus.title} (ID: ${timeline.focus.id})`,
      `### ► Focus: [${timeline.focus.type}] ${timeline.focus.title} (ID: ${timeline.focus.id})`
    );
    const afterText = timeline.after.length > 0
      ? timeline.after.map((observation) => formatTimelineObservation(observation)).join('\n\n')
      : 'No later observations in this session';

    printStdout([
      `## Timeline around observation ${observationId}`,
      '',
      '### Before',
      beforeText,
      '',
      focusText,
      '',
      '### After',
      afterText,
    ].join('\n'));
  });
}

async function handleContext(positionals: string[], globals: GlobalOptions): Promise<void> {
  ensureNoExtraArgs(positionals, 'context');

  await withStore(globals.dataDir, ({ store }) => {
    printStdout(store.getContext({ project: globals.project }));
  });
}

async function handleStats(positionals: string[], globals: GlobalOptions): Promise<void> {
  ensureNoExtraArgs(positionals, 'stats');

  await withStore(globals.dataDir, ({ store }) => {
    const stats = store.getStats();
    printStdout([
      '## Thoth Memory Statistics',
      `- **Sessions:** ${stats.total_sessions}`,
      `- **Observations:** ${stats.total_observations}`,
      `- **User Prompts:** ${stats.total_prompts}`,
      `- **Projects:** ${stats.projects.join(', ') || 'none'}`,
    ].join('\n'));
  });
}

async function handleExport(positionals: string[], globals: GlobalOptions): Promise<void> {
  if (positionals.length > 1) {
    fail('export accepts at most one [file] argument');
  }

  const outputFile = positionals[0];

  await withStore(globals.dataDir, ({ store }) => {
    const data = store.exportData(globals.project);
    const json = JSON.stringify(data, null, 2);

    if (outputFile) {
      writeFileSync(outputFile, json, 'utf-8');
      printStdout(`Exported memory data to ${outputFile}`);
      return;
    }

    printStdout(json);
  });
}

function parseImportData(text: string): ExportData {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    fail('Invalid JSON — could not parse import data');
  }

  if (!parsed || typeof parsed !== 'object') {
    fail('Invalid export format — expected an object');
  }

  const candidate = parsed as Partial<ExportData>;

  if (!candidate.version || !Array.isArray(candidate.sessions) || !Array.isArray(candidate.observations) || !Array.isArray(candidate.prompts)) {
    fail('Invalid export format — missing required fields (version, sessions, observations, prompts)');
  }

  return candidate as ExportData;
}

async function handleImport(positionals: string[], globals: GlobalOptions): Promise<void> {
  if (positionals.length !== 1) {
    fail('import requires <file>');
  }

  const filePath = positionals[0];
  const data = parseImportData(readFileSync(filePath, 'utf-8'));

  await withStore(globals.dataDir, ({ store }) => {
    const result = store.importData(data);
    printStdout([
      '## Memory Import Complete',
      `- **Sessions imported:** ${result.sessions_imported}`,
      `- **Observations imported:** ${result.observations_imported}`,
      `- **Prompts imported:** ${result.prompts_imported}`,
      `- **Skipped (duplicates):** ${result.skipped}`,
    ].join('\n'));
  });
}

async function handleSync(positionals: string[], globals: GlobalOptions): Promise<void> {
  const parsedDir = parseOptionValue(positionals, ['--dir']);
  ensureNoExtraArgs(parsedDir.rest, 'sync');

  const syncDir = parsedDir.value ?? join(process.cwd(), '.thoth-sync');

  await withStore(globals.dataDir, ({ store }) => {
    const result = syncExport(store, syncDir, globals.project);
    printStdout([
      '## Sync Export Complete',
      `- **Directory:** ${syncDir}`,
      `- **Chunk:** ${result.filename || 'none'}`,
      `- **Sessions:** ${result.sessions}`,
      `- **Observations:** ${result.observations}`,
      `- **Prompts:** ${result.prompts}`,
    ].join('\n'));
  });
}

async function handleMigrateProject(positionals: string[], globals: GlobalOptions): Promise<void> {
  if (positionals.length !== 2) {
    fail('migrate-project requires <old_project> <new_project>');
  }

  const [oldProject, newProject] = positionals;

  if (oldProject === newProject) {
    fail('Old and new project names must be different');
  }

  await withStore(globals.dataDir, ({ store }) => {
    const result = store.migrateProject(oldProject, newProject);
    printStdout([
      '## Project Migration Complete',
      `- **From:** ${result.old_project}`,
      `- **To:** ${result.new_project}`,
      `- **Sessions updated:** ${result.sessions_updated}`,
      `- **Observations updated:** ${result.observations_updated}`,
      `- **Prompts updated:** ${result.prompts_updated}`,
    ].join('\n'));
  });
}

async function handleVersion(positionals: string[]): Promise<void> {
  ensureNoExtraArgs(positionals, 'version');
  printStdout(VERSION);
}

export async function runCli(args: string[]): Promise<void> {
  try {
    const parsed = parseGlobals(args);

    if (parsed.globals.help || parsed.command === 'help' || !parsed.command) {
      printHelp();
      return;
    }

    switch (parsed.command) {
      case 'search':
        await handleSearch(parsed.positionals, parsed.globals);
        return;
      case 'save':
        await handleSave(parsed.positionals, parsed.globals);
        return;
      case 'timeline':
        await handleTimeline(parsed.positionals, parsed.globals);
        return;
      case 'context':
        await handleContext(parsed.positionals, parsed.globals);
        return;
      case 'stats':
        await handleStats(parsed.positionals, parsed.globals);
        return;
      case 'export':
        await handleExport(parsed.positionals, parsed.globals);
        return;
      case 'import':
        await handleImport(parsed.positionals, parsed.globals);
        return;
      case 'sync':
        await handleSync(parsed.positionals, parsed.globals);
        return;
      case 'migrate-project':
        await handleMigrateProject(parsed.positionals, parsed.globals);
        return;
      case 'version':
        await handleVersion(parsed.positionals);
        return;
      default:
        fail(`Unknown command: ${parsed.command}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    printStderr(message);
    throw error;
  }
}
