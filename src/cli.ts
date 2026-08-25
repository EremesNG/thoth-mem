import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { normalizeAdapterEvent, normalizeNativePayload, type AdapterEvent } from './integration/adapters/v2.js';
import { importLegacyV1, LegacyImportFailure } from './memory-core/import/legacy-v1.js';
import { MemoryService } from './memory-core/service.js';
import { installPlugin, type SetupHarness } from './setup/install.js';

function value(args: string[], name: string): string | undefined { const index = args.indexOf(name); if (index >= 0) return args[index + 1]; return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1); }

export async function runCli(args: string[]): Promise<number> {
  const command = args.find((arg) => !arg.startsWith('-'));
  if (!command || command === 'help') { process.stdout.write('thoth-mem v2\n\nCommands:\n  import-v2 --source <legacy.sqlite> --target <v2.sqlite> [--report <report.json>]\n  setup-v2 --harness <opencode|codex|claude-code> --target <plugin-dir>\n  mcp [--data-dir <dir>]\n'); return 0; }
  if (command === 'lifecycle-v2') {
    try {
      const event = JSON.parse(readFileSync(0, 'utf8')) as AdapterEvent; const nativeHarness = value(args, '--harness') as 'opencode' | 'codex' | 'claude' | undefined;
      const dataDir = resolve(process.env.THOTH_MEM_DATA_DIR ?? join(homedir(), '.thoth-mem'));
      mkdirSync(dataDir, { recursive: true });
      const service = new MemoryService({ databasePath: join(dataDir, 'memory-v2.sqlite') });
      try { process.stdout.write(`${JSON.stringify({ schema: 'thoth-mem.lifecycle.v2', data: service.lifecycle(nativeHarness ? normalizeNativePayload(nativeHarness, event) : normalizeAdapterEvent(event)) })}\n`); } finally { service.close(); }
      return 0;
    } catch (error) { process.stderr.write(`Lifecycle failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 500)}\n`); return 1; }
  }
  if (command === 'setup-v2') {
    const harness = value(args, '--harness') as SetupHarness | undefined; const target = value(args, '--target');
    if (!harness || !target) { process.stderr.write('setup-v2 requires --harness and --target\n'); return 2; }
    try { process.stdout.write(`${JSON.stringify(installPlugin({ harness, targetRoot: target, force: args.includes('--force') }))}\n`); return 0; } catch (error) { process.stderr.write(`Setup failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 500)}\n`); return 1; }
  }
  if (command !== 'import-v2') { process.stderr.write(`Unknown command: ${command}\n`); return 2; }
  const source = value(args, '--source'); const target = value(args, '--target');
  if (!source || !target) { process.stderr.write('import-v2 requires explicit --source and --target paths\n'); return 2; }
  const reportPath = value(args, '--report'); const resolvedReportPath = reportPath ? resolve(reportPath) : null;
  try {
    if (resolvedReportPath && existsSync(resolvedReportPath)) throw new Error('Import report path must be absent');
    const report = importLegacyV1({ sourcePath: resolve(source), targetPath: resolve(target) });
    const json = `${JSON.stringify(report, null, 2)}\n`; if (resolvedReportPath) writeFileSync(resolvedReportPath, json, { encoding: 'utf8', flag: 'wx' }); else process.stdout.write(json); return 0;
  } catch (error) { if (resolvedReportPath && error instanceof LegacyImportFailure && !existsSync(resolvedReportPath)) writeFileSync(resolvedReportPath, `${JSON.stringify(error.report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }); process.stderr.write(`Import failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 500)}\n`); return 1; }
}
