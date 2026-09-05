import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { loadRuntimeConfig } from './config/runtime.js';
import { normalizeAdapterEvent, normalizeNativePayload, type AdapterEvent } from './integration/adapters/index.js';
import { LegacyImportFailure, applyLegacyImport, findCommittedLegacyImport, parseImportPlan, parseMappingManifest, planLegacyImport } from './memory-core/import/legacy-v1.js';
import { MemoryService, projectSelectorExists, validateProjectRenameInput } from './memory-core/service.js';
import { setupNativeManager } from './setup/native-manager.js';
import { setupOpenCode } from './setup/opencode.js';
import { setupPi } from './setup/pi.js';

const HELP = 'thoth-mem\n\nCommands:\n  setup <opencode|codex|claude|pi> [--plan] [--json] [--data-dir <dir>] [--local-package-root <dir>]\n    --force-version: Codex version override; Pi uses capability checks without a version allowlist.\n  project rename --project <exact-key-or-alias> --name <display-name> [--data-dir <dir>]\n  import-legacy [--source <legacy.sqlite>] [--map <mapping.json>] [--data-dir <dir>] [--json]\n  import-legacy plan --source <legacy.sqlite> --target <memory.sqlite> --plan <plan.json> [--map <mapping.json>]\n  import-legacy apply --plan <plan.json> --report <report.json>\n  lifecycle --harness <opencode|codex|claude> [--data-dir <dir>]\n  mcp [--data-dir <dir>]\n';

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

function importPlanArguments(args: string[], commandIndex: number): { source: string; target: string; plan: string; map?: string } | null {
  if (args[commandIndex + 1] !== 'plan') return null;
  const parsed: Partial<{ source: string; target: string; plan: string; map: string }> = {};
  const options = new Map([
    ['--source', 'source' as const],
    ['--target', 'target' as const],
    ['--plan', 'plan' as const],
    ['--map', 'map' as const],
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
  if (!parsed.source || !parsed.target || !parsed.plan) return null;
  return { source: parsed.source, target: parsed.target, plan: parsed.plan, ...(parsed.map ? { map: parsed.map } : {}) };
}

function importApplyArguments(args: string[], commandIndex: number): { plan: string; report: string } | null {
  if (args[commandIndex + 1] !== 'apply') return null;
  const parsed: Partial<{ plan: string; report: string }> = {};
  const options = new Map([['--plan', 'plan' as const], ['--report', 'report' as const]]);
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
  return parsed.plan && parsed.report ? { plan: parsed.plan, report: parsed.report } : null;
}

interface ImportRunArguments { source?: string; map?: string; dataDir?: string; json: boolean }

const IMPORT_PLAN_BINDING_SCHEMA = 'thoth-mem.import.plan-binding.v1';

interface ImportPlanBinding { schema: typeof IMPORT_PLAN_BINDING_SCHEMA; requestKey: string; planHash: string }

function importRunArguments(args: string[], commandIndex: number): ImportRunArguments | null {
  const parsed: Partial<Omit<ImportRunArguments, 'json'>> & { json: boolean } = { json: false };
  const options = new Map([
    ['--source', 'source' as const],
    ['--map', 'map' as const],
    ['--data-dir', 'dataDir' as const],
  ]);
  for (let index = commandIndex + 1; index < args.length; index += 1) {
    const token = args[index]!;
    if (token === '--json') {
      if (parsed.json) return null;
      parsed.json = true;
      continue;
    }
    const equals = token.indexOf('=');
    const option = equals >= 0 ? token.slice(0, equals) : token;
    const property = options.get(option);
    if (!property || parsed[property] !== undefined) return null;
    const optionValue = equals >= 0 ? token.slice(equals + 1) : args[++index];
    if (!optionValue || (equals < 0 && optionValue.startsWith('--'))) return null;
    parsed[property] = optionValue;
  }
  return parsed;
}

function importDispositionTotals(dispositions: Record<string, { imported: number; linked: number; skipped: number; quarantined: number }>): { imported: number; linked: number; skipped: number; quarantined: number } {
  const totals = { imported: 0, linked: 0, skipped: 0, quarantined: 0 };
  for (const disposition of Object.values(dispositions)) {
    totals.imported += disposition.imported;
    totals.linked += disposition.linked;
    totals.skipped += disposition.skipped;
    totals.quarantined += disposition.quarantined;
  }
  return totals;
}

function assertImportCustodyContained(path: string, canonicalDataDir: string): void {
  const relation = relative(canonicalDataDir, realpathSync(path));
  if (!relation || relation === '..' || relation.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(relation)) {
    throw new Error('Legacy import custody must remain beneath the configured data directory');
  }
}

function ensureImportCustodyDirectory(path: string, canonicalDataDir: string): void {
  if (!existsSync(path)) mkdirSync(path);
  const status = lstatSync(path);
  if (!status.isDirectory() || status.isSymbolicLink()) throw new Error('Legacy import custody must use regular directories without symbolic or reparse aliases');
  assertImportCustodyContained(path, canonicalDataDir);
}

function assertImportCustodyFile(path: string, canonicalDataDir: string): void {
  const status = lstatSync(path);
  if (!status.isFile() || status.isSymbolicLink()) throw new Error('Legacy import custody must use regular files without symbolic or reparse aliases');
  assertImportCustodyContained(path, canonicalDataDir);
}

function readImportPlanBinding(path: string, expected: ImportPlanBinding, canonicalDataDir: string): void {
  if (!existsSync(path)) throw new Error('Legacy import plan request binding is missing');
  assertImportCustodyFile(path, canonicalDataDir);
  const binding = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)
    || JSON.stringify(Object.keys(binding).sort()) !== JSON.stringify(['planHash', 'requestKey', 'schema'])
    || JSON.stringify(binding) !== JSON.stringify(expected)) {
    throw new Error('Legacy import plan request binding is invalid');
  }
}

function createOrVerifyImportPlanBinding(path: string, binding: ImportPlanBinding, canonicalDataDir: string): void {
  if (!existsSync(path)) writeFileSync(path, `${JSON.stringify(binding, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  readImportPlanBinding(path, binding, canonicalDataDir);
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
    const commandIndex = args.indexOf(command); const harness = args[commandIndex + 1];
    if (harness !== 'opencode' && harness !== 'codex' && harness !== 'claude' && harness !== 'pi') { process.stderr.write('setup requires opencode, codex, claude, or pi\n'); return 2; }
    if (value(args, '--scope') || args.includes('--project')) { process.stderr.write('setup supports only global/user native installation; project scope is not supported\n'); return 2; }
    const seen = new Set<string>();
    for (let index = commandIndex + 2; index < args.length; index += 1) {
      const token = args[index]!;
      const equals = token.indexOf('=');
      const option = equals >= 0 ? token.slice(0, equals) : token;
      if (!['--plan', '--json', '--force-version', '--data-dir', '--local-package-root'].includes(option) || seen.has(option) || (harness === 'pi' && option === '--force-version')) {
        process.stderr.write('setup received a duplicate or unknown option\n'); return 2;
      }
      seen.add(option);
      if (option === '--data-dir' || option === '--local-package-root') {
        const optionValue = equals >= 0 ? token.slice(equals + 1) : args[++index];
        if (!optionValue || optionValue.startsWith('--')) { process.stderr.write(`setup ${option} requires a value\n`); return 2; }
      } else if (equals >= 0) { process.stderr.write(`setup ${option} does not accept a value\n`); return 2; }
    }
    const localPackageRoot = value(args, '--local-package-root'); const dataDir = value(args, '--data-dir'); const planOnly = args.includes('--plan');
    try {
      const result = harness === 'opencode'
        ? setupOpenCode({ mode: localPackageRoot ? 'local' : 'public', ...(localPackageRoot ? { packageRoot: localPackageRoot } : {}), ...(dataDir ? { dataDir } : {}), planOnly })
        : harness === 'pi'
          ? setupPi({ ...(localPackageRoot ? { packageRoot: localPackageRoot } : {}), ...(dataDir ? { dataDir } : {}), planOnly })
          : setupNativeManager({ host: harness, ...(localPackageRoot ? { packageRoot: localPackageRoot } : {}), ...(dataDir ? { dataDir } : {}), planOnly, forceVersion: args.includes('--force-version') });
      if (args.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      else {
        process.stdout.write(`${harness}: ${result.status}; changed=${result.changed}\n`);
        for (const action of result.actions) process.stdout.write(`- ${action}\n`);
        if (result.receiptPath) process.stdout.write(`Receipt: ${result.receiptPath}\n`);
        if ('warnings' in result) for (const warning of result.warnings) process.stdout.write(`Warning: ${warning}\n`);
        if ('diagnostics' in result) for (const diagnostic of result.diagnostics) process.stdout.write(`Diagnostic: ${diagnostic}\n`);
      }
      return 'strategy' in result && (result.status === 'unsupported' || result.status === 'requires-user-action') ? 1 : 0;
    } catch (error) { process.stderr.write(`Setup failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 500)}\n`); return 1; }
  }
  if (command !== 'import-legacy') { process.stderr.write(`Unknown command: ${command}\n`); return 2; }
  const commandIndex = args.indexOf(command);
  if (args[commandIndex + 1] === 'apply') {
    const parsedApply = importApplyArguments(args, commandIndex);
    if (!parsedApply) { process.stderr.write('import-legacy apply requires exact --plan and --report values with no duplicate or unknown options\n'); return 2; }
    const reportPath = resolve(parsedApply.report);
    if (existsSync(reportPath)) { process.stderr.write('Import apply failed: Import report path must be absent\n'); return 1; }
    try {
      let plan: unknown = null;
      try { plan = JSON.parse(readFileSync(resolve(parsedApply.plan), 'utf8')) as unknown; }
      catch (error) { if (!(error instanceof SyntaxError)) throw error; }
      const report = await applyLegacyImport({ plan });
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      return 0;
    } catch (error) {
      if (error instanceof LegacyImportFailure && !existsSync(reportPath)) writeFileSync(reportPath, `${JSON.stringify(error.report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      process.stderr.write(`Import apply failed: ${(error instanceof Error ? error.message : String(error)).replace(/[\r\n\t]+/gu, ' ').slice(0, 500)}\n`);
      return 1;
    }
  }
  if (args[commandIndex + 1] !== 'plan') {
    const parsedRun = importRunArguments(args, commandIndex);
    if (!parsedRun) { process.stderr.write('import-legacy accepts only --source, --map, --data-dir, and --json with no duplicate or unknown options\n'); return 2; }
    let retainedFailureReportPath: string | null = null;
    try {
      const sourcePath = resolve(parsedRun.source ?? join(homedir(), '.thoth', 'thoth.db'));
      const dataDir = loadRuntimeConfig({ explicitDataDir: parsedRun.dataDir }).dataDir;
      const targetPath = join(dataDir, 'memory.sqlite');
      const mapping = parsedRun.map ? parseMappingManifest(JSON.parse(readFileSync(resolve(parsedRun.map), 'utf8'))) : null;
      const freshPlan = planLegacyImport({ sourcePath, targetPath, mapping });
      const canonicalMapping = freshPlan.mappingRequest;
      const requestKey = createHash('sha256').update(JSON.stringify({ sourcePath, targetPath, sourceFingerprint: freshPlan.source.logicalFingerprint, mapping: canonicalMapping, policyHash: freshPlan.policy.policyHash })).digest('hex');
      const requestDirectory = join(dataDir, 'imports', requestKey);
      const planDirectory = join(requestDirectory, 'plans');
      const reportDirectory = join(requestDirectory, 'reports');
      mkdirSync(dataDir, { recursive: true });
      const canonicalDataDir = realpathSync(dataDir);
      ensureImportCustodyDirectory(join(dataDir, 'imports'), canonicalDataDir);
      ensureImportCustodyDirectory(requestDirectory, canonicalDataDir);
      ensureImportCustodyDirectory(planDirectory, canonicalDataDir);
      ensureImportCustodyDirectory(reportDirectory, canonicalDataDir);
      const committed = findCommittedLegacyImport(targetPath, freshPlan.source.logicalFingerprint);
      const planHash = committed?.planHash ?? freshPlan.planHash;
      const planPath = join(planDirectory, `${planHash}.json`);
      const planBindingPath = join(planDirectory, `${planHash}.binding.json`);
      const planBinding: ImportPlanBinding = { schema: IMPORT_PLAN_BINDING_SCHEMA, requestKey, planHash };
      const reportPath = join(reportDirectory, `${randomUUID()}.json`);
      retainedFailureReportPath = reportPath;
      let plan = freshPlan;
      if (committed) {
        if (!existsSync(planPath)) throw new Error('Committed legacy import plan custody is missing');
        readImportPlanBinding(planBindingPath, planBinding, canonicalDataDir);
        assertImportCustodyFile(planPath, canonicalDataDir);
        plan = parseImportPlan(JSON.parse(readFileSync(planPath, 'utf8')));
        if (plan.planHash !== committed.planHash
          || plan.source.path !== sourcePath
          || plan.target.path !== targetPath
          || plan.source.logicalFingerprint !== freshPlan.source.logicalFingerprint
          || plan.policy.policyHash !== freshPlan.policy.policyHash
          || JSON.stringify(plan.mappingRequest) !== JSON.stringify(canonicalMapping)) {
          throw new Error('Committed legacy import plan custody does not match this request');
        }
      } else {
        if (existsSync(planPath)) {
          readImportPlanBinding(planBindingPath, planBinding, canonicalDataDir);
          assertImportCustodyFile(planPath, canonicalDataDir);
          plan = parseImportPlan(JSON.parse(readFileSync(planPath, 'utf8')));
          if (JSON.stringify(plan) !== JSON.stringify(freshPlan)) throw new Error('Legacy import plan custody collision');
        } else {
          createOrVerifyImportPlanBinding(planBindingPath, planBinding, canonicalDataDir);
          writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
          assertImportCustodyFile(planPath, canonicalDataDir);
        }
      }
      let report;
      try { report = await applyLegacyImport({ plan }); }
      catch (error) {
        if (error instanceof LegacyImportFailure) {
          writeFileSync(reportPath, `${JSON.stringify(error.report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
          assertImportCustodyFile(reportPath, canonicalDataDir);
        }
        throw error;
      }
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      assertImportCustodyFile(reportPath, canonicalDataDir);
      const output = {
        schema: 'thoth-mem.import.run.v1',
        data: {
          importId: report.importId,
          committed: report.committed,
          duplicate: report.duplicate,
          counts: importDispositionTotals(report.dispositions),
          reasonCounts: report.reasonCounts,
          artifacts: {
            planPath,
            reportPath,
            backupPath: report.artifacts.backupPath,
            recoveryBundlePath: report.artifacts.recoveryBundlePath,
          },
        },
      };
      if (parsedRun.json) process.stdout.write(`${JSON.stringify(output)}\n`);
      else {
        const counts = output.data.counts;
        const totalRows = counts.imported + counts.linked + counts.quarantined + counts.skipped;
        process.stdout.write(`${[
          'Outcome: SUCCESS - legacy import completed and committed.',
          `Rows: total=${totalRows}; imported=${counts.imported}; linked=${counts.linked}; quarantined=${counts.quarantined}; skipped=${counts.skipped}`,
          `Non-imported rows: quarantined=${counts.quarantined}; skipped=${counts.skipped}. They were accounted for in the report and did not prevent the commit.`,
          `Replay: ${output.data.duplicate ? 'yes - the existing committed import was reused without adding duplicate rows' : 'no'}`,
          `Plan: ${planPath}`,
          `Report: ${reportPath}`,
          `Backup (safety artifact): ${report.artifacts.backupPath ?? 'null'}`,
          `Recovery (safety artifact): ${report.artifacts.recoveryBundlePath ?? 'null'}`,
        ].join('\n')}\n`);
      }
      return 0;
    } catch (error) {
      const reportPath = retainedFailureReportPath && existsSync(retainedFailureReportPath) ? retainedFailureReportPath : null;
      const message = (error instanceof Error ? error.message : String(error)).replace(/[\r\n\t]+/gu, ' ').slice(0, 400);
      const nextAction = (error instanceof LegacyImportFailure && error.code === 'TARGET_LOCKED') || /locked|busy/iu.test(message)
        ? 'Close all hosts using the target and rerun the same command.'
        : null;
      process.stderr.write(`${[
        'Outcome: FAILED - legacy import was not committed.',
        `Reason: ${message}`,
        ...(reportPath ? [`Report: ${reportPath}`] : []),
        ...(nextAction ? [`Next action: ${nextAction}`] : []),
      ].join('\n')}\n`);
      return 1;
    }
  }
  const parsedImport = importPlanArguments(args, commandIndex);
  if (!parsedImport) { process.stderr.write('import-legacy plan requires exact --source, --target, and --plan values with no duplicate or unknown options\n'); return 2; }
  const planPath = resolve(parsedImport.plan);
  try {
    if (existsSync(planPath)) throw new Error('Import plan path must be absent');
    const mapping = parsedImport.map ? parseMappingManifest(JSON.parse(readFileSync(resolve(parsedImport.map), 'utf8'))) : null;
    const plan = planLegacyImport({ sourcePath: resolve(parsedImport.source), targetPath: resolve(parsedImport.target), mapping });
    writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    return 0;
  } catch (error) {
    process.stderr.write(`Import planning failed: ${(error instanceof Error ? error.message : String(error)).replace(/[\r\n\t]+/gu, ' ').slice(0, 500)}\n`);
    return 1;
  }
}
