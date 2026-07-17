import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ThothConfig } from './config.js';
import { getConfig, resolveDataDir } from './config.js';
import { Store } from './store/index.js';
import { OBSERVATION_TYPES } from './store/types.js';
import type { DeleteProjectResult, ExportData, MaintenanceRunPreview, MaintenanceRunResult, MaintenanceScope, Observation, ObservationScope, ObservationType } from './store/types.js';
import { syncExport, syncImport } from './sync/index.js';
import { formatIdentityWarning } from './store/identity.js';
import { formatObservationMarkdown, formatSearchResultMarkdown } from './utils/content.js';
import { VERSION } from './version.js';
import { createEmbeddingProvider } from './retrieval/provider-factory.js';
import type { SemanticIndexProgress } from './store/index.js';
import { getSetupExitCode } from './setup/types.js';
import type { SetupRequest, SetupResult } from './setup/types.js';
import { inspectAndPlanSetup } from './setup/engine.js';
import {
  runIntegrationEventCommand,
  type IntegrationEventCommandResult,
} from './integration/runtime/integration-event-command.js';

export { VERSION };

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
   sync-import            Git sync import
   migrate-project <old> <new>  Rename a project
   delete-project <project>     Delete a project safely
   rebuild-graph          Rebuild derived graph facts
   prune-graph            Bound superseded graph history (keep-N)
   rebuild-communities    Rebuild derived KG community summaries
   preview-communities    Preview derived KG community summaries
   communities-status     Inspect derived KG community state
   drop-communities       Drop derived KG community summaries
   rebuild-index          Queue/process semantic index rebuild jobs
   rebuild-index --status Show semantic index progress without queueing work
   maintain-memory        Preview/apply memory maintenance metadata
   setup <opencode|codex|claude-code> Plan or manage a native harness integration
   version                Show version
   help                   Show this help

Global Options:
  --data-dir=<path>      Data directory (default: ~/.thoth)
  -p, --project <name>   Filter by project
  --help                 Show help

Setup Options:
  --scope <global|project>  Setup scope (default: global)
  --project <path>          Required with --scope project
  --plan                    Inspect and report without mutation
  --force                   Replace only conflicting managed entries
  --rollback <receipt>      Roll back a managed setup receipt
  --json                    Emit the setup result as JSON
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

export interface RunCliOptions {
  setupRunner?: (
    request: SetupRequest,
    options: { dataDir?: string },
  ) => Promise<SetupResult>;
  integrationEventRunner?: (
    options: { dataDir?: string },
  ) => Promise<IntegrationEventCommandResult>;
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

function detectCommand(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === '--data-dir' || arg === '-p' || arg === '--project') {
      index++;
      continue;
    }
    if (arg.startsWith('--data-dir=') || arg.startsWith('--project=')) {
      continue;
    }
    if (arg.startsWith('-')) {
      continue;
    }

    return arg;
  }

  return undefined;
}

function parseGlobals(args: string[], options: { parseProject?: boolean } = {}): ParsedArgs {
  const globals: GlobalOptions = { help: false };
  const remaining: string[] = [];
  const parseProject = options.parseProject !== false;

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

    if (parseProject && (arg === '-p' || arg === '--project')) {
      globals.project = requireValue(args, index, arg);
      index++;
      continue;
    }

    if (parseProject && arg.startsWith('--project=')) {
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

function parseSetupValue(
  args: string[],
  index: number,
  option: '--scope' | '--project' | '--rollback',
): { value: string; nextIndex: number } {
  const arg = args[index];
  const prefix = `${option}=`;

  if (arg.startsWith(prefix)) {
    const value = arg.slice(prefix.length);
    if (!value) {
      fail(`Missing value for ${option}`);
    }
    return { value, nextIndex: index };
  }

  return {
    value: requireValue(args, index, option),
    nextIndex: index + 1,
  };
}

function setupOptionName(arg: string): string {
  if (arg.startsWith('--scope=')) {
    return '--scope';
  }
  if (arg.startsWith('--project=')) {
    return '--project';
  }
  if (arg.startsWith('--rollback=')) {
    return '--rollback';
  }
  return arg;
}

export function parseSetupRequest(args: string[]): SetupRequest {
  const [harnessValue, ...options] = args;
  if (!harnessValue) {
    fail('setup requires opencode, codex, or claude-code');
  }
  if (harnessValue !== 'opencode' && harnessValue !== 'codex' && harnessValue !== 'claude-code') {
    fail(`Invalid setup harness: ${harnessValue}. Expected one of: opencode, codex, claude-code`);
  }

  let scope: SetupRequest['scope'] = 'global';
  let projectPath: string | undefined;
  let rollbackReceipt: string | undefined;
  let planOnly = false;
  let force = false;
  let json = false;
  const seen = new Set<string>();

  for (let index = 0; index < options.length; index++) {
    const arg = options[index];
    const option = setupOptionName(arg);

    if (seen.has(option)) {
      fail(`Duplicate setup option: ${option}`);
    }

    if (option === '--scope') {
      seen.add(option);
      const parsed = parseSetupValue(options, index, '--scope');
      index = parsed.nextIndex;
      if (parsed.value !== 'global' && parsed.value !== 'project') {
        fail(`Invalid value for --scope: ${parsed.value}. Expected one of: global, project`);
      }
      scope = parsed.value;
      continue;
    }
    if (option === '--project') {
      seen.add(option);
      const parsed = parseSetupValue(options, index, '--project');
      index = parsed.nextIndex;
      projectPath = parsed.value.trim();
      if (!projectPath) {
        fail('Missing value for --project');
      }
      continue;
    }
    if (option === '--rollback') {
      seen.add(option);
      const parsed = parseSetupValue(options, index, '--rollback');
      index = parsed.nextIndex;
      rollbackReceipt = parsed.value.trim();
      if (!rollbackReceipt) {
        fail('Missing value for --rollback');
      }
      continue;
    }
    if (option === '--plan' || option === '--force' || option === '--json') {
      seen.add(option);
      if (option === '--plan') {
        planOnly = true;
      } else if (option === '--force') {
        force = true;
      } else {
        json = true;
      }
      continue;
    }

    if (arg.startsWith('-')) {
      fail(`Unexpected setup option: ${arg}`);
    }
    fail(`Unexpected setup argument: ${arg}`);
  }

  if (scope === 'project' && !projectPath) {
    fail('--scope project requires --project <path>');
  }
  if (scope === 'global' && projectPath) {
    fail('--project is only valid with --scope project');
  }

  return {
    harness: harnessValue,
    scope,
    ...(projectPath ? { projectPath } : {}),
    planOnly,
    force,
    ...(rollbackReceipt ? { rollbackReceipt } : {}),
    json,
  };
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

function parseRequiredProjectName(value: string | undefined, command: string): string {
  if (value === undefined) {
    fail(`${command} requires <project>`);
  }

  const project = value.trim();
  if (!project) {
    fail(`${command} requires a non-empty <project>`);
  }

  return project;
}

function parseMaintenanceScope(positionals: string[], globals: GlobalOptions): { rest: string[]; scope: MaintenanceScope; label: string } {
  const parsedTopicKey = parseOptionValue(positionals, ['--topic-key']);
  const parsedTopicPrefix = parseOptionValue(parsedTopicKey.rest, ['--topic-prefix']);
  const all = parsedTopicPrefix.rest.includes('--all');
  const rest = parsedTopicPrefix.rest.filter((arg) => arg !== '--all');
  const scopes = [
    all ? 'all' : null,
    globals.project ? 'project' : null,
    parsedTopicKey.value ? 'topic-key' : null,
    parsedTopicPrefix.value ? 'topic-prefix' : null,
  ].filter((value): value is string => value !== null);

  if (scopes.length !== 1) {
    fail('maintain-memory requires exactly one scope: --all, --project <name>, --topic-key <key>, or --topic-prefix <prefix>');
  }

  if (all) {
    return { rest, scope: { all: true }, label: 'all memories' };
  }
  if (globals.project) {
    const project = parseRequiredProjectName(globals.project, 'maintain-memory --project');
    return { rest, scope: { project }, label: `project ${project}` };
  }
  if (parsedTopicKey.value) {
    return { rest, scope: { topic_key: parsedTopicKey.value }, label: `topic_key ${parsedTopicKey.value}` };
  }

  const topicPrefix = parsedTopicPrefix.value!;
  return { rest, scope: { topic_prefix: topicPrefix }, label: `topic_prefix ${topicPrefix}` };
}

function parseProjectOrAllScope(positionals: string[], globals: GlobalOptions, command: string): { rest: string[]; all: boolean; project?: string; label: string } {
  const all = positionals.includes('--all');
  const rest = positionals.filter((arg) => arg !== '--all');
  const hasProject = globals.project !== undefined;

  if (all && hasProject) {
    fail('Use either --project or --all, not both');
  }

  if (!all && !hasProject) {
    fail(`${command} requires --project <name> or --all`);
  }

  const project = hasProject
    ? parseRequiredProjectName(globals.project, `${command} --project`)
    : undefined;

  return {
    rest,
    all,
    project,
    label: project ? `project ${project}` : 'all projects',
  };
}

function createStoreContext(dataDir?: string): StoreContext {
  const config = getConfig({ dataDir });

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

function formatSemanticProgress(progress: SemanticIndexProgress, scopeLabel: string): string {
  const jobLines = progress.jobs.length > 0
    ? progress.jobs.map((job) => `  - ${job.state}/${job.kind}: ${job.count}`)
    : ['  - none'];
  const laneLines = progress.lanes.length > 0
    ? progress.lanes.map((lane) => [
      `  - ${lane.lane}:`,
      `pending=${lane.pending ? 'yes' : 'no'}`,
      `degraded=${lane.degraded ? 'yes' : 'no'}`,
      `stale=${lane.stale ? 'yes' : 'no'}`,
      `dimensions=${lane.embeddingDimensions ?? 'unknown'}`,
      `ready=${lane.lastReadyAt ?? 'never'}`,
      `updated=${lane.updatedAt ?? 'never'}`,
    ].join(' '))
    : ['  - none'];
  const errorLines = progress.recentErrors.length > 0
    ? progress.recentErrors.map((job) => `  - #${job.id} ${job.kind}/${job.state} attempts=${job.attemptCount}: ${job.lastError ?? 'unknown error'}`)
    : ['  - none'];
  const donePercent = progress.totals.total > 0
    ? Math.round((progress.totals.done / progress.totals.total) * 100)
    : 100;

  return [
    '## Semantic Index Status',
    `- **Scope:** ${scopeLabel}`,
    `- **Jobs:** ${progress.totals.done}/${progress.totals.total} done (${donePercent}%)`,
    `- **Pending jobs:** ${progress.totals.pending}`,
    `- **Running jobs:** ${progress.totals.running}`,
    `- **Failed jobs:** ${progress.totals.failed}`,
    `- **Active observations:** ${progress.coverage.observations}`,
    `- **Chunk coverage:** ${progress.coverage.chunkVectors}/${progress.coverage.chunks} vectors`,
    `- **Sentence coverage:** ${progress.coverage.sentenceVectors}/${progress.coverage.sentences} vectors`,
    '- **Queue by state/kind:**',
    ...jobLines,
    '- **Lanes:**',
    ...laneLines,
    '- **Recent errors:**',
    ...errorLines,
  ].join('\n');
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
   const usesDefaultDir = parsedDir.value === undefined;

   await withStore(globals.dataDir, ({ store }) => {
     const result = syncExport(store, syncDir, globals.project);
     printStdout([
       '## Sync Export Complete',
       `- **Directory:** ${syncDir}`,
       usesDefaultDir ? '- **Directory default:** current working directory' : null,
       `- **Chunk:** ${result.filename || 'none'}`,
       `- **Sessions:** ${result.sessions}`,
       `- **Observations:** ${result.observations}`,
       `- **Prompts:** ${result.prompts}`,
     ].filter((line): line is string => line !== null).join('\n'));
   });
}

async function handleSyncImport(positionals: string[], globals: GlobalOptions): Promise<void> {
   const parsedDir = parseOptionValue(positionals, ['--dir']);
   ensureNoExtraArgs(parsedDir.rest, 'sync-import');

   const syncDir = parsedDir.value ?? join(process.cwd(), '.thoth-sync');
   const usesDefaultDir = parsedDir.value === undefined;

   await withStore(globals.dataDir, ({ store }) => {
     const result = syncImport(store, syncDir);
     const identityWarning = formatIdentityWarning(result.identity);
     printStdout([
       '## Sync Import Complete',
       `- **Directory:** ${syncDir}`,
       usesDefaultDir ? '- **Directory default:** current working directory' : null,
       `- **Chunks processed:** ${result.chunks_processed}`,
       `- **Sessions imported:** ${result.sessions_imported}`,
       `- **Observations imported:** ${result.observations_imported}`,
       `- **Prompts imported:** ${result.prompts_imported}`,
       `- **Skipped (duplicates):** ${result.skipped}`,
       identityWarning ? `- **Identity fallback:** ${identityWarning.replace(/^Identity fallback: /, '').replace(/\.$/, '')}` : null,
     ].filter((line): line is string => line !== null).join('\n'));
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

function formatDeleteProjectOutput(result: DeleteProjectResult & { sync_mutations_deleted?: number }): string {
  const lines = [
    '## Project Deletion Complete',
    `- **Project:** ${result.project}`,
    `- **Observations deleted:** ${result.observations_deleted}`,
    `- **Observation versions deleted:** ${result.observation_versions_deleted}`,
    `- **Prompts deleted:** ${result.prompts_deleted}`,
    `- **Sessions deleted:** ${result.sessions_deleted}`,
  ];

  if (typeof result.sync_mutations_deleted === 'number') {
    lines.push(`- **Sync mutations deleted:** ${result.sync_mutations_deleted}`);
  }

  return lines.join('\n');
}

async function handleDeleteProject(positionals: string[], globals: GlobalOptions): Promise<void> {
  if (positionals.length !== 1) {
    fail('delete-project requires <project>');
  }

  const project = parseRequiredProjectName(positionals[0], 'delete-project');

  await withStore(globals.dataDir, ({ store }) => {
    try {
      const result = store.deleteProject(project);
      printStdout(formatDeleteProjectOutput(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(`Project delete blocked: ${message}`);
    }
  });
}

async function handleRebuildGraph(positionals: string[], globals: GlobalOptions): Promise<void> {
  const all = positionals.includes('--all');
  const rest = positionals.filter((arg) => arg !== '--all');
  const hasProject = globals.project !== undefined;

  if (all && hasProject) {
    fail('Use either --project or --all, not both');
  }

  if (!all && !hasProject) {
    fail('rebuild-graph requires --project <name> or --all');
  }

  ensureNoExtraArgs(rest, 'rebuild-graph');

  const project = hasProject
    ? parseRequiredProjectName(globals.project, 'rebuild-graph --project')
    : undefined;

  await withStore(globals.dataDir, ({ store }) => {
    const result = store.rebuildObservationFacts({ project });
    printStdout([
      '## Graph Rebuild Complete',
      `- **Scope:** ${result.project ? `project ${result.project}` : 'all projects'}`,
      `- **Observations scanned:** ${result.observations_scanned}`,
      `- **Facts deleted:** ${result.facts_deleted}`,
      `- **Facts created:** ${result.facts_created}`,
    ].join('\n'));
  });
}

function formatMaintenanceResult(result: MaintenanceRunPreview | MaintenanceRunResult, scopeLabel: string): string {
  const applied = result.dry_run === false;
  return [
    applied ? '## Memory Maintenance Applied' : '## Memory Maintenance Preview',
    `- **Mode:** ${applied ? 'apply' : 'dry-run'}`,
    `- **Scope:** ${scopeLabel}`,
    applied ? `- **Run ID:** ${result.run_id}` : null,
    `- **Records scanned:** ${result.counts.records_scanned}`,
    `- **Consolidation candidates:** ${result.counts.consolidation_candidates}`,
    `- **Reflection candidates:** ${result.counts.reflection_candidates}`,
    `- **Decay candidates:** ${result.counts.decay_candidates}`,
    `- **Review required:** ${result.counts.review_required}`,
    `- **Degraded signals:** ${result.degraded.length > 0 ? result.degraded.join(', ') : 'none'}`,
  ].filter((line): line is string => line !== null).join('\n');
}

async function handlePruneGraph(positionals: string[], globals: GlobalOptions): Promise<void> {
  const dryRun = positionals.includes('--dry-run');
  const all = positionals.includes('--all');
  const rest = positionals.filter((arg) => arg !== '--all' && arg !== '--dry-run');
  const hasProject = globals.project !== undefined;

  if (all && hasProject) {
    fail('Use either --project or --all, not both');
  }

  if (!all && !hasProject) {
    fail('prune-graph requires --project <name> or --all');
  }

  ensureNoExtraArgs(rest, 'prune-graph');

  const project = hasProject
    ? parseRequiredProjectName(globals.project, 'prune-graph --project')
    : undefined;

  await withStore(globals.dataDir, ({ store }) => {
    const result = store.pruneSupersededTriples({ project, dryRun });
    printStdout([
      '## Graph Prune Complete',
      `- **Scope:** ${result.project ? `project ${result.project}` : 'all projects'}`,
      `- **Dry run:** ${result.dry_run ? 'yes' : 'no'}`,
      `- **Slots scanned:** ${result.slots_scanned}`,
      `- **Triples pruned:** ${result.triples_pruned}`,
      `- **Entities pruned:** ${result.entities_pruned}`,
      `- **Dangling refs NULLed:** ${result.dangling_refs_nulled}`,
      `- **Superseded before -> after:** ${result.superseded_before} -> ${result.superseded_after}`,
    ].join('\n'));
  });
}

async function handleRebuildCommunities(positionals: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseProjectOrAllScope(positionals, globals, 'rebuild-communities');
  ensureNoExtraArgs(parsed.rest, 'rebuild-communities');

  await withStore(globals.dataDir, ({ store }) => {
    if (parsed.project) {
      const result = store.rebuildCommunitySummaries({ project: parsed.project });
      printStdout([
        '## Community Summary Rebuild Complete',
        `- **Scope:** ${parsed.label}`,
        `- **Status:** ${result.status}`,
        `- **Freshness:** ${result.freshness}`,
        `- **Run ID:** ${result.run_id}`,
        `- **Communities created:** ${result.communities_created}`,
        `- **Entities scanned:** ${result.entities_scanned}`,
        `- **Triples scanned:** ${result.triples_scanned}`,
        `- **Source observations scanned:** ${result.source_observations_scanned}`,
        `- **Degraded reasons:** ${result.degraded_reasons.length > 0 ? result.degraded_reasons.join(', ') : 'none'}`,
        result.error ? `- **Error:** ${result.error}` : null,
      ].filter((line): line is string => line !== null).join('\n'));
      return;
    }

    const projects = store.getStats().projects;
    const results = projects.map((project) => store.rebuildCommunitySummaries({ project }));
    const lines = results.length > 0
      ? results.map((result) => `- ${result.project}: status=${result.status} communities=${result.communities_created} freshness=${result.freshness}`)
      : ['- none'];
    printStdout([
      '## Community Summary Rebuild Complete',
      `- **Scope:** ${parsed.label}`,
      `- **Projects scanned:** ${projects.length}`,
      '',
      ...lines,
    ].join('\n'));
  });
}

async function handlePreviewCommunities(positionals: string[], globals: GlobalOptions): Promise<void> {
  ensureNoExtraArgs(positionals, 'preview-communities');
  const project = parseRequiredProjectName(globals.project, 'preview-communities --project');

  await withStore(globals.dataDir, ({ store }) => {
    const result = store.previewCommunitySummaries({
      project,
      limit: Math.min(5, store.config.communitySummaries.maxCommunitiesPerProject),
      maxChars: Math.min(600, store.config.communitySummaries.summaryMaxChars),
    });
    const communityLines = result.communities.length > 0
      ? result.communities.map((community) => [
        `- ${community.community_id}`,
        `entities=${community.entity_count}`,
        `triples=${community.triple_count}`,
        `sources=${community.source_observation_count}`,
        `degraded=${community.degraded ? 'yes' : 'no'}`,
      ].join(' | '))
      : ['- none'];

    printStdout([
      '## Community Summary Preview',
      `- **Scope:** project ${project}`,
      '- **Would commit:** no',
      `- **State:** ${result.state}`,
      `- **Communities shown:** ${result.communities.length}`,
      `- **Triples scanned:** ${result.triples_scanned}`,
      `- **Truncated:** ${result.truncated ? 'yes' : 'no'}`,
      `- **Degraded reasons:** ${result.degraded_reasons.length > 0 ? result.degraded_reasons.join(', ') : 'none'}`,
      '',
      ...communityLines,
    ].join('\n'));
  });
}

async function handleCommunitiesStatus(positionals: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseProjectOrAllScope(positionals, globals, 'communities-status');
  ensureNoExtraArgs(parsed.rest, 'communities-status');

  await withStore(globals.dataDir, ({ store }) => {
    if (parsed.project) {
      const state = store.getCommunitySummaryState({ project: parsed.project });
      printStdout([
        '## Community Summary Status',
        `- **Project:** ${parsed.project}`,
        `- **State:** ${state.state}`,
        `- **Run ID:** ${state.run_id ?? 'none'}`,
        `- **Latest committed run ID:** ${state.latest_committed_run_id ?? 'none'}`,
        `- **Communities:** ${state.communities_count}`,
        `- **Entities:** ${state.entities_count}`,
        `- **Triples:** ${state.triples_count}`,
        `- **Source observations:** ${state.source_observations_count}`,
        `- **Degraded:** ${state.degraded ? 'yes' : 'no'}`,
        `- **Degraded reasons:** ${state.degraded_reasons.length > 0 ? state.degraded_reasons.join(', ') : 'none'}`,
        state.error ? `- **Error:** ${state.error}` : null,
      ].filter((line): line is string => line !== null).join('\n'));
      return;
    }

    const projects = store.getStats().projects;
    const lines = projects.length > 0
      ? projects.map((project) => {
        const state = store.getCommunitySummaryState({ project });
        return `- ${project}: state=${state.state} communities=${state.communities_count} run=${state.run_id ?? 'none'}`;
      })
      : ['- none'];
    printStdout([
      '## Community Summary Status',
      `- **Scope:** ${parsed.label}`,
      `- **Projects scanned:** ${projects.length}`,
      '',
      ...lines,
    ].join('\n'));
  });
}

async function handleDropCommunities(positionals: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseProjectOrAllScope(positionals, globals, 'drop-communities');
  ensureNoExtraArgs(parsed.rest, 'drop-communities');

  await withStore(globals.dataDir, ({ store }) => {
    const result = store.dropCommunitySummaries({ project: parsed.project });
    printStdout([
      '## Community Summaries Dropped',
      `- **Scope:** ${parsed.label}`,
      `- **Runs deleted:** ${result.runs_deleted}`,
      `- **Communities deleted:** ${result.communities_deleted}`,
      `- **Members deleted:** ${result.members_deleted}`,
      `- **Evidence deleted:** ${result.evidence_deleted}`,
    ].join('\n'));
  });
}

async function handleRebuildIndex(positionals: string[], globals: GlobalOptions): Promise<void> {
  const parsedReason = parseOptionValue(positionals, ['--reason']);
  const parsedProcess = parseOptionValue(parsedReason.rest, ['--process']);
  const statusOnly = parsedProcess.rest.includes('--status');
  const hasProject = globals.project !== undefined;
  const all = parsedProcess.rest.includes('--all');
  const rest = parsedProcess.rest.filter((arg) => arg !== '--all' && arg !== '--status');

  if (all && hasProject) {
    fail('Use either --project or --all, not both');
  }
  if (!statusOnly && !all && !hasProject) {
    fail('rebuild-index requires --project <name> or --all');
  }
  ensureNoExtraArgs(rest, 'rebuild-index');

  const processLimit = parsedProcess.value ? parseInteger(parsedProcess.value, '--process', 0) : 25;
  const project = hasProject
    ? parseRequiredProjectName(globals.project, 'rebuild-index --project')
    : undefined;
  const scopeLabel = project ? `project ${project}` : 'all projects';

  await withStore(globals.dataDir, async ({ store }) => {
    if (statusOnly) {
      printStdout(formatSemanticProgress(store.getSemanticIndexProgress({ project }), scopeLabel));
      return;
    }

    const reason = parsedReason.value?.trim() || 'cli-manual';
    const requeued = store.requeueFailedEmbeddingJobs();
    const rebuild = store.enqueueManualSemanticRebuild({
      scope: project ?? 'all',
      reason,
    });
    if (processLimit > 0 && !store.config.embedding) {
      fail('Embedding config unavailable; cannot process semantic jobs');
    }
    const embeddingProvider = processLimit > 0 && store.config.embedding
      ? createEmbeddingProvider(store.config.embedding)
      : null;
    const processed = processLimit > 0
      ? await store.processSemanticJobs({ limit: processLimit, embeddingProvider })
      : 0;
    const state = store.getSemanticIndexState();
    const progress = store.getSemanticIndexProgress({ project });

    printStdout([
      '## Semantic Index Rebuild',
      `- **Scope:** ${scopeLabel}`,
      `- **Queued key:** ${rebuild.dedupeKey}`,
      `- **Requeued failed jobs:** ${requeued}`,
      `- **Jobs processed:** ${processed}`,
      `- **Pending:** ${state.pending ? 'yes' : 'no'}`,
      `- **Degraded:** ${state.degraded ? 'yes' : 'no'}`,
      `- **Stale:** ${state.stale ? 'yes' : 'no'}`,
      '',
      formatSemanticProgress(progress, scopeLabel),
    ].join('\n'));
  });
}

async function handleMaintainMemory(positionals: string[], globals: GlobalOptions): Promise<void> {
  const dryRun = positionals.includes('--dry-run');
  const apply = positionals.includes('--apply');

  if (dryRun && apply) {
    fail('Use either --dry-run or --apply, not both');
  }

  const modeArgsRemoved = positionals.filter((arg) => arg !== '--dry-run' && arg !== '--apply');
  const parsed = parseMaintenanceScope(modeArgsRemoved, globals);
  ensureNoExtraArgs(parsed.rest, 'maintain-memory');

  await withStore(globals.dataDir, ({ store }) => {
    const effectiveMode = apply ? 'apply' : dryRun ? 'dry-run' : store.config.maintenance.defaultMode;
    const result = effectiveMode === 'apply'
      ? store.runMaintenance({ scope: parsed.scope, mode: 'apply' })
      : store.evaluateMaintenance({ scope: parsed.scope, mode: 'dry-run' });

    printStdout(formatMaintenanceResult(result, parsed.label));
  });
}

function formatSetupItems(label: string, items: string[]): string[] {
  return [
    `${label}:`,
    ...(items.length > 0 ? items.map((item) => `  - ${item}`) : ['  - none']),
  ];
}

export function formatSetupResult(result: SetupResult, json: boolean): string {
  if (json) {
    return JSON.stringify(result, null, 2);
  }

  return [
    `Setup: ${result.harness} (${result.scope})`,
    `Status: ${result.status}`,
    `Changed: ${result.changed ? 'yes' : 'no'}`,
    `Target: ${result.target}`,
    ...formatSetupItems(
      'Steps',
      result.steps.map((step) => `${step.name}: ${step.outcome}`),
    ),
    ...formatSetupItems('Diagnostics', result.diagnostics),
    ...formatSetupItems('Manual actions', result.manual_actions),
    `Receipt: ${result.receipt ?? 'none'}`,
  ].join('\n');
}

function setupScopeFromArgs(args: string[]): SetupRequest['scope'] {
  for (let index = 1; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--scope' && args[index + 1] === 'project') {
      return 'project';
    }
    if (arg === '--scope=project') {
      return 'project';
    }
  }
  return 'global';
}

function setupProjectPathFromArgs(args: string[]): string | undefined {
  for (let index = 1; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--project') {
      return args[index + 1]?.trim() || undefined;
    }
    if (arg.startsWith('--project=')) {
      return arg.slice('--project='.length).trim() || undefined;
    }
  }
  return undefined;
}

function setupValidationFailure(
  args: string[],
  error: unknown,
): { result: SetupResult; json: boolean } | null {
  const harness = args[0];
  if (harness !== 'opencode' && harness !== 'codex' && harness !== 'claude-code') {
    return null;
  }

  const scope = setupScopeFromArgs(args);
  const projectPath = setupProjectPathFromArgs(args);
  const message = error instanceof Error ? error.message : 'Invalid setup options';
  return {
    result: {
      status: 'failed',
      changed: false,
      harness,
      scope,
      target: projectPath ?? `unresolved ${scope} target`,
      steps: [{ name: 'Validate setup request', outcome: 'failed' }],
      diagnostics: [message],
      manual_actions: ['Correct the setup options and retry.'],
      receipt: null,
    },
    json: args.includes('--json'),
  };
}

async function handleSetup(
  positionals: string[],
  globals: GlobalOptions,
  options: RunCliOptions,
): Promise<number> {
  let request: SetupRequest;
  try {
    request = parseSetupRequest(positionals);
  } catch (error) {
    const failure = setupValidationFailure(positionals, error);
    if (!failure) {
      throw error;
    }
    printStdout(formatSetupResult(failure.result, failure.json));
    return getSetupExitCode(failure.result.status);
  }

  let result: SetupResult;
  try {
    const setupEngineOptions = globals.dataDir ? { dataDir: globals.dataDir } : {};
    result = options.setupRunner
      ? await options.setupRunner(request, setupEngineOptions)
      : await inspectAndPlanSetup(request, setupEngineOptions);
  } catch {
    result = {
      status: 'failed',
      changed: false,
      harness: request.harness,
      scope: request.scope,
      target: request.projectPath ?? 'unresolved global target',
      steps: [{ name: 'Execute setup inspection', outcome: 'failed' }],
      diagnostics: ['Setup inspection failed before a verified result was available.'],
      manual_actions: ['Verify filesystem access and retry.'],
      receipt: null,
    };
  }
  printStdout(formatSetupResult(result, request.json));
  return getSetupExitCode(result.status);
}

async function handleVersion(positionals: string[]): Promise<void> {
  ensureNoExtraArgs(positionals, 'version');
  printStdout(VERSION);
}

async function handleIntegrationEvent(
  positionals: string[],
  globals: GlobalOptions,
  options: RunCliOptions,
): Promise<number> {
  ensureNoExtraArgs(positionals, 'integration-event');
  const commandOptions = globals.dataDir ? { dataDir: globals.dataDir } : {};
  const result = options.integrationEventRunner
    ? await options.integrationEventRunner(commandOptions)
    : await runIntegrationEventCommand(process.stdin, commandOptions);
  printStdout(JSON.stringify(result.response));
  return result.exitCode;
}

export async function runCli(args: string[], options: RunCliOptions = {}): Promise<number> {
  try {
    const command = detectCommand(args);
    const parsed = parseGlobals(args, { parseProject: command !== 'setup' });

    if (parsed.globals.help || parsed.command === 'help' || !parsed.command) {
      printHelp();
      return 0;
    }

    switch (parsed.command) {
      case 'search':
        await handleSearch(parsed.positionals, parsed.globals);
        return 0;
      case 'save':
        await handleSave(parsed.positionals, parsed.globals);
        return 0;
      case 'timeline':
        await handleTimeline(parsed.positionals, parsed.globals);
        return 0;
      case 'context':
        await handleContext(parsed.positionals, parsed.globals);
        return 0;
      case 'stats':
        await handleStats(parsed.positionals, parsed.globals);
        return 0;
      case 'export':
        await handleExport(parsed.positionals, parsed.globals);
        return 0;
      case 'import':
        await handleImport(parsed.positionals, parsed.globals);
        return 0;
      case 'sync':
         await handleSync(parsed.positionals, parsed.globals);
         return 0;
       case 'sync-import':
         await handleSyncImport(parsed.positionals, parsed.globals);
         return 0;
       case 'migrate-project':
         await handleMigrateProject(parsed.positionals, parsed.globals);
         return 0;
       case 'delete-project':
         await handleDeleteProject(parsed.positionals, parsed.globals);
         return 0;
       case 'rebuild-graph':
         await handleRebuildGraph(parsed.positionals, parsed.globals);
         return 0;
       case 'prune-graph':
         await handlePruneGraph(parsed.positionals, parsed.globals);
         return 0;
       case 'rebuild-communities':
         await handleRebuildCommunities(parsed.positionals, parsed.globals);
         return 0;
       case 'preview-communities':
         await handlePreviewCommunities(parsed.positionals, parsed.globals);
         return 0;
       case 'communities-status':
         await handleCommunitiesStatus(parsed.positionals, parsed.globals);
         return 0;
       case 'drop-communities':
         await handleDropCommunities(parsed.positionals, parsed.globals);
         return 0;
       case 'rebuild-index':
         await handleRebuildIndex(parsed.positionals, parsed.globals);
         return 0;
       case 'maintain-memory':
         await handleMaintainMemory(parsed.positionals, parsed.globals);
         return 0;
       case 'setup':
         return handleSetup(parsed.positionals, parsed.globals, options);
       case 'integration-event':
         return handleIntegrationEvent(parsed.positionals, parsed.globals, options);
       case 'version':
         await handleVersion(parsed.positionals);
         return 0;
      default:
        fail(`Unknown command: ${parsed.command}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    printStderr(message);
    throw error;
  }
}
