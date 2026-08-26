import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { loadRuntimeConfig } from './config/runtime.js';
import { normalizeAdapterEvent, normalizeNativePayload, type AdapterEvent } from './integration/adapters/index.js';
import { importLegacyV1, LegacyImportFailure } from './memory-core/import/legacy-v1.js';
import { MemoryService } from './memory-core/service.js';
import { setupNativeManager } from './setup/native-manager.js';
import { setupOpenCode } from './setup/opencode.js';

const HELP = 'thoth-mem\n\nCommands:\n  setup <opencode|codex|claude> [--plan] [--json] [--data-dir <dir>] [--local-package-root <dir>] [--force-version]\n  import-legacy --source <legacy.sqlite> --target <memory.sqlite> [--report <report.json>]\n  lifecycle --harness <opencode|codex|claude> [--data-dir <dir>]\n  mcp [--data-dir <dir>]\n';

function value(args: string[], name: string): string | undefined { const index = args.indexOf(name); if (index >= 0) return args[index + 1]; return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1); }

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
        process.stdout.write(`${JSON.stringify({ schema: 'thoth-mem.lifecycle', identity: { root_session_id: normalized.rootSessionKey, project: normalized.project.name }, data })}\n`);
      } finally { service.close(); }
      return 0;
    } catch (error) { process.stderr.write(`Lifecycle failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 500)}\n`); return 1; }
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
