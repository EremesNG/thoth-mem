import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const runnerDirectory = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(runnerDirectory, '..');
const MAX_DIAGNOSTIC_LENGTH = 560;
const MAX_HOST_OUTPUT_CODE_POINTS = 1_000;
const RECOVERY_TAG_START = '<!-- thoth-mem:recovery:start -->';
const RECOVERY_TAG_END = '<!-- thoth-mem:recovery:end -->';
const WINDOWS_SHELL_META_CHARACTERS = /([()\][%!^"`<>&|;, *?])/g;
const UNSAFE_IDENTITY_HEADER_CHARACTERS = /[;=\p{Cc}\p{Zl}\p{Zp}]/u;

function boundedDiagnostic(message) {
  return Array.from(message).slice(0, MAX_DIAGNOSTIC_LENGTH).join('');
}

function parseHarness(arguments_) {
  const index = arguments_.indexOf('--harness');
  const harness = index >= 0 ? arguments_[index + 1] : undefined;
  if (harness !== 'codex' && harness !== 'claude') throw new Error('Expected --harness codex or --harness claude.');
  return harness;
}

function loadRuntime() {
  const value = JSON.parse(readFileSync(join(pluginRoot, 'runtime.json'), 'utf8'));
  if (value?.package !== 'thoth-mem' || typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.version)) {
    throw new Error('Public runtime metadata is invalid.');
  }
  return value;
}

function escapeWindowsCommand(value) {
  return value.replace(WINDOWS_SHELL_META_CHARACTERS, '^$1');
}

function escapeWindowsArgument(value) {
  let escaped = `${value}`;
  escaped = escaped.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');
  escaped = escaped.replace(/(?=(\\+?)?)\1$/, '$1$1');
  escaped = `"${escaped}"`;
  return escaped.replace(WINDOWS_SHELL_META_CHARACTERS, '^$1');
}

function windowsInvocation(command, arguments_) {
  const commandLine = [escapeWindowsCommand(command), ...arguments_.map(escapeWindowsArgument)].join(' ');
  return {
    command: process.env.ComSpec ?? process.env.COMSPEC ?? 'cmd.exe',
    arguments: ['/d', '/s', '/c', `"${commandLine}"`],
    windowsVerbatimArguments: true,
  };
}

function validatedRuntimeEntry(value, runtime, label) {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error(`${label} must be an absolute path`);
  const entry = resolve(value);
  if (!existsSync(entry) || !statSync(entry).isFile()) throw new Error(`${label} is not a regular file`);
  const packageRoot = dirname(dirname(entry));
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  if (manifest?.name !== runtime.package || manifest?.version !== runtime.version) {
    throw new Error(`${label} package identity does not match the plugin runtime`);
  }
  return entry;
}

function embeddedRuntimeEntry(runtime) {
  return runtime.entry === undefined
    ? undefined
    : validatedRuntimeEntry(runtime.entry, runtime, 'plugin runtime entry');
}

function providerRuntimeEntry(runtime) {
  const configRoot = process.env.XDG_CONFIG_HOME?.trim() ? resolve(process.env.XDG_CONFIG_HOME) : join(homedir(), '.config');
  const configPath = join(configRoot, 'thoth-mem', 'config.json');
  if (!existsSync(configPath)) return undefined;
  let provider;
  try {
    provider = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    throw new Error('provider configuration is invalid: JSON parsing failed');
  }
  if (provider?.runtimeEntry === undefined) return undefined;
  return validatedRuntimeEntry(provider.runtimeEntry, runtime, 'provider runtimeEntry');
}

function runtimeInvocation(runtime, runtimeArguments) {
  const localEntry = embeddedRuntimeEntry(runtime) ?? providerRuntimeEntry(runtime);
  if (localEntry) return { command: process.execPath, arguments: [localEntry, ...runtimeArguments] };
  const command = process.env.THOTH_MEM_PUBLIC_NPX_COMMAND ?? (process.platform === 'win32' ? 'npx.cmd' : 'npx');
  const arguments_ = ['--yes', `${runtime.package}@${runtime.version}`, ...runtimeArguments];
  return process.platform === 'win32'
    ? windowsInvocation(command, arguments_)
    : { command, arguments: arguments_ };
}

function isSafeIdentityValue(value) {
  return typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && !UNSAFE_IDENTITY_HEADER_CHARACTERS.test(value);
}

function verifiedIdentity(identity) {
  if (!isSafeIdentityValue(identity?.root_session_id) || !isSafeIdentityValue(identity?.project)) return undefined;
  const header = `thoth-mem verified identity: root_session_id=${identity.root_session_id}; project=${identity.project}`;
  return Array.from(header).length <= MAX_HOST_OUTPUT_CODE_POINTS ? header : undefined;
}

function identityOnlyContext(identity) {
  if (!identity) return undefined;
  const context = `${RECOVERY_TAG_START}\n${identity}\n${RECOVERY_TAG_END}`;
  return Array.from(context).length <= MAX_HOST_OUTPUT_CODE_POINTS ? context : undefined;
}

function verifiedRecovery(lifecycle, identity) {
  const fallback = identityOnlyContext(identity);
  const data = lifecycle?.data;
  const recovery = data?.recovery;
  if (!fallback || !recovery || typeof recovery.context !== 'string') return fallback;
  const context = recovery.context;
  const items = Array.isArray(recovery.items) ? recovery.items : [];
  const selectedIds = items.map((item) => item?.id);
  const selectedSummaryIds = items.filter((item) => item?.recordType === 'summary').map((item) => item?.id);
  const selectedMemoryIds = items.filter((item) => item?.recordType !== 'summary').map((item) => item?.id);
  const rendering = recovery.rendering;
  const totalCodePoints = Array.from(context).length;
  if (
    !context.startsWith(`${RECOVERY_TAG_START}\n`) ||
    !context.endsWith(`\n${RECOVERY_TAG_END}`) ||
    context.split(RECOVERY_TAG_START).length !== 2 ||
    context.split(RECOVERY_TAG_END).length !== 2 ||
    context.split('\n')[1] !== identity ||
    totalCodePoints > MAX_HOST_OUTPUT_CODE_POINTS ||
    rendering?.maxCodePoints !== MAX_HOST_OUTPUT_CODE_POINTS ||
    rendering?.totalCodePoints !== totalCodePoints ||
    items.length > 3 ||
    selectedIds.some((id) => typeof id !== 'string') ||
    !Array.isArray(recovery.selectedSummaryIds) ||
    !Array.isArray(recovery.selectedMemoryIds) ||
    !Array.isArray(recovery.selectedRecordIds) ||
    JSON.stringify(selectedSummaryIds) !== JSON.stringify(recovery.selectedSummaryIds) ||
    JSON.stringify(selectedMemoryIds) !== JSON.stringify(recovery.selectedMemoryIds) ||
    JSON.stringify(selectedIds) !== JSON.stringify(recovery.selectedRecordIds) ||
    data?.capability?.contextDelivered !== (selectedIds.length > 0) ||
    items.some((item) => !context.includes(`(${item?.recordType === 'summary' ? 'summary' : 'memory'}:${item?.id})`)) ||
    items.some((item) => item?.recordType === 'summary'
      ? typeof item?.submissionEvidenceId === 'string' && context.includes(item.submissionEvidenceId)
      : Array.isArray(item?.evidenceIds) && item.evidenceIds.some((id) => typeof id === 'string' && context.includes(id)))
  ) return fallback;
  return context;
}

function renderHostOutput(payload, lifecycle) {
  const identity = verifiedIdentity(lifecycle?.identity);
  const additionalContext = verifiedRecovery(lifecycle, identity);
  return payload?.hook_event_name === 'SessionStart' && additionalContext
    ? { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }
    : {};
}

function fail(message, neutralOutput = true) {
  if (neutralOutput) process.stdout.write('{}');
  process.stderr.write(boundedDiagnostic(`thoth-mem public plugin: ${message}`));
  process.exitCode = 1;
}

const arguments_ = process.argv.slice(2);
const mcp = arguments_.includes('--mcp');

try {
  const harness = mcp ? undefined : parseHarness(arguments_);
  const runtime = loadRuntime();
  const runtimeArguments = mcp ? ['mcp', '--no-http'] : ['lifecycle', '--harness', harness];
  const invocation = runtimeInvocation(runtime, runtimeArguments);
  if (mcp) {
    const child = spawnSync(invocation.command, invocation.arguments, {
      stdio: 'inherit',
      env: process.env,
      windowsHide: true,
      ...(invocation.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
    });
    if (child.error || child.status !== 0) fail(child.error?.message ?? `runtime exited ${child.status}`, false);
    process.exitCode = child.status ?? process.exitCode;
  } else {
    const input = readFileSync(0, 'utf8');
    const payload = JSON.parse(input);
    const child = spawnSync(invocation.command, invocation.arguments, {
      input,
      encoding: 'utf8',
      env: process.env,
      windowsHide: true,
      ...(invocation.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
    });
    if (child.error || child.status !== 0) {
      fail(child.error?.message ?? child.stderr ?? `runtime exited ${child.status}`);
    } else {
      const lifecycle = JSON.parse(child.stdout);
      if (lifecycle?.schema !== 'thoth-mem.lifecycle' || !lifecycle.data) throw new Error('runtime returned an invalid lifecycle result');
      process.stdout.write(JSON.stringify(renderHostOutput(payload, lifecycle)));
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error), !mcp);
}
