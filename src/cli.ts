import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { loadRuntimeConfig } from './config/runtime.js';
import { normalizeAdapterEvent, normalizeNativePayload, type AdapterEvent } from './integration/adapters/index.js';
import { importLegacyV1, LegacyImportFailure } from './memory-core/import/legacy-v1.js';
import { MemoryService, projectSelectorExists, validateProjectRenameInput } from './memory-core/service.js';
import { setupNativeManager } from './setup/native-manager.js';
import { setupOpenCode } from './setup/opencode.js';

const HELP = 'thoth-mem\n\nCommands:\n  setup <opencode|codex|claude> [--plan] [--json] [--data-dir <dir>] [--local-package-root <dir>] [--force-version]\n  project rename --project <exact-key-or-alias> --name <display-name> [--data-dir <dir>]\n  import-legacy --source <legacy.sqlite> --target <memory.sqlite> [--report <report.json>]\n  lifecycle --harness <opencode|codex|claude> [--data-dir <dir>]\n  mcp [--data-dir <dir>]\n';

function value(args: string[], name: string): string | undefined { const index = args.indexOf(name); if (index >= 0) return args[index + 1]; return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1); }

function projectRenameArguments(args: string[], commandIndex: number): { selector: string; name: string; dataDir?: string } | null {
  const parsed: Partial<{ selector: string; name: string; dataDir: string }> = {};
  const options = new Map([
    ['--project', 'selector' as const],
    ['--name', 'name' as const],
    ['--data-dir', 'dataDir' as const],
  ]);
  for (let index = commandIndex + 2; index < args.length; index += 1) {
    const token = args[index]!;
    const equals = token.indexOf('=');
    const option = equals >= 0 ? token.slice(0, equals) : token;
    const property = options.get(option);
    if (!property || parsed[property] !== undefined) return null;
    const optionValue = equals >= 0 ? token.slice(equals + 1) : args[++index];
    if (!optionValue || (equals < 0 && optionValue.startsWith('--'))) return null;
    parsed[property] = optionValue;
  }
  if (!parsed.selector || !parsed.name) return null;
  return { selector: parsed.selector, name: parsed.name, ...(parsed.dataDir ? { dataDir: parsed.dataDir } : {}) };
}

export async function runCli(args: string[]): Promise<number> {
  const command = args.find((arg) => !arg.startsWith('-'));
  if (!command || command === 'help' || args.includes('--help') || args.includes('-h')) { process.stdout.write(HELP); return 0; }
  if (command === 'lifecycle') {
    try {
      const event = JSON.parse(readFileSync(0, 'utf8')) as AdapterEvent; const nativeHarness = value(args, '--harness') as 'opencode' | 'codex' | 'claude' | undefined;
      const dataDir = loadRuntimeConfig({ explicitDataDir: value(args, '--data-dir') }).dataDir;
      mkdirSync(dataDir, { recursive: true });
      const service = new MemoryService({ databasePath: join(dataDir, 'memory.sqlite') });
      try {
        const normalized = nativeHarness ? normalizeNativePayload(nativeHarness, event) : normalizeAdapterEvent(event);
        const data = service.lifecycle(normalized);
        process.stdout.write(`${JSON.stringify({ schema: 'thoth-mem.lifecycle', identity: { root_session_id: normalized.rootSessionKey, project_key: data.projectKey, project_name: data.projectName }, data })}\n`);
      } finally { service.close(); }
      return 0;
    } catch (error) { process.stderr.write(`Lifecycle failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 500)}\n`); return 1; }
  }
  if (command === 'project') {
    const commandIndex = args.indexOf(command);
    const subcommand = args[commandIndex + 1];
    if (subcommand !== 'rename') { process.stderr.write(`Unknown project command: ${subcommand ?? ''}\n`); return 2; }
    const parsed = projectRenameArguments(args, commandIndex);
    if (!parsed) { process.stderr.write('project rename requires exact --project and --name values with no unknown options\n'); return 2; }
    let rename;
    try { rename = validateProjectRenameInput({ selector: parsed.selector, name: parsed.name }); }
    catch (error) { process.stderr.write(`Invalid project rename: ${error instanceof Error ? error.message : String(error)}\n`); return 2; }
    try {
      const dataDir = loadRuntimeConfig({ explicitDataDir: parsed.dataDir }).dataDir;
      const databasePath = join(dataDir, 'memory.sqlite');
      if (!existsSync(databasePath) || !projectSelectorExists(databasePath, rename.selector)) {
        process.stderr.write('Project rename failed: Project selector did not match a project\n');
        return 1;
      }
      const service = new MemoryService({ databasePath });
      try { process.stdout.write(`${JSON.stringify({ schema: 'thoth-mem.project.rename.v1', data: service.renameProject(rename) })}\n`); }
      finally { service.close(); }
      return 0;
    } catch (error) { process.stderr.write(`Project rename failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 500)}\n`); return 1; }
  }
  if (command === 'setup') {
    const commandIndex = args.indexOf(command); const harness = args.slice(commandIndex + 1).find((arg) => !arg.startsWith('-'));
    if (harness !== 'opencode' && harness !== 'codex' && harness !== 'claude') { process.stderr.write('setup requires opencode, codex, or claude\n'); return 2; }
    if (value(args, '--scope') || args.includes('--project')) { process.stderr.write('setup supports only global/user native installation; project scope is not supported\n'); return 2; }
    const localPackageRoot = value(args, '--local-package-root'); const dataDir = value(args, '--data-dir'); const planOnly = args.includes('--plan');
    try {
      const result = harness === 'opencode'
        ? setupOpenCode({ mode: localPackageRoot ? 'local' : 'public', ...(localPackageRoot ? { packageRoot: localPackageRoot } : {}), ...(dataDir ? { dataDir } : {}), planOnly })
        : setupNativeManager({ host: harness, ...(localPackageRoot ? { packageRoot: localPackageRoot } : {}), ...(dataDir ? { dataDir } : {}), planOnly, forceVersion: args.includes('--force-version') });
      if (args.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      else {
        process.stdout.write(`${harness}: ${result.status}; changed=${result.changed}\n`);
        for (const action of result.actions) process.stdout.write(`- ${action}\n`);
        if (result.receiptPath) process.stdout.write(`Receipt: ${result.receiptPath}\n`);
        if ('warnings' in result) for (const warning of result.warnings) process.stdout.write(`Warning: ${warning}\n`);
        if ('diagnostics' in result) for (const diagnostic of result.diagnostics) process.stdout.write(`Diagnostic: ${diagnostic}\n`);
      }
      return result.status === 'unsupported' || result.status === 'requires-user-action' ? 1 : 0;
    } catch (error) { process.stderr.write(`Setup failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 500)}\n`); return 1; }
  }
  if (command !== 'import-legacy') { process.stderr.write(`Unknown command: ${command}\n`); return 2; }
  const source = value(args, '--source'); const target = value(args, '--target');
  if (!source || !target) { process.stderr.write('import-legacy requires explicit --source and --target paths\n'); return 2; }
  const reportPath = value(args, '--report'); const resolvedReportPath = reportPath ? resolve(reportPath) : null;
  try {
    if (resolvedReportPath && existsSync(resolvedReportPath)) throw new Error('Import report path must be absent');
    const report = importLegacyV1({ sourcePath: resolve(source), targetPath: resolve(target) });
    const json = `${JSON.stringify(report, null, 2)}\n`; if (resolvedReportPath) writeFileSync(resolvedReportPath, json, { encoding: 'utf8', flag: 'wx' }); else process.stdout.write(json); return 0;
  } catch (error) { if (resolvedReportPath && error instanceof LegacyImportFailure && !existsSync(resolvedReportPath)) writeFileSync(resolvedReportPath, `${JSON.stringify(error.report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }); process.stderr.write(`Import failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 500)}\n`); return 1; }
}
