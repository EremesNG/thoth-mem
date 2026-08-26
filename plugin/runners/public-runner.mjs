import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const runnerDirectory = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(runnerDirectory, '..');
const MAX_DIAGNOSTIC_LENGTH = 560;
const MAX_HOST_OUTPUT_CODE_POINTS = 1_000;
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
  if (typeof provider.runtimeEntry !== 'string' || !isAbsolute(provider.runtimeEntry)) {
    throw new Error('provider runtimeEntry must be an absolute path');
  }
  const entry = resolve(provider.runtimeEntry);
  if (!existsSync(entry) || !statSync(entry).isFile()) throw new Error('provider runtimeEntry is not a regular file');
  const packageRoot = dirname(dirname(entry));
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  if (manifest?.name !== runtime.package || manifest?.version !== runtime.version) {
    throw new Error('provider runtimeEntry package identity does not match the plugin runtime');
  }
  return entry;
}

function runtimeInvocation(runtime, runtimeArguments) {
  const localEntry = providerRuntimeEntry(runtime);
  if (localEntry) return { command: process.execPath, arguments: [localEntry, ...runtimeArguments] };
  const command = process.env.THOTH_MEM_PUBLIC_NPX_COMMAND ?? (process.platform === 'win32' ? 'npx.cmd' : 'npx');
  const arguments_ = ['--yes', `${runtime.package}@${runtime.version}`, ...runtimeArguments];
  return process.platform === 'win32'
    ? windowsInvocation(command, arguments_)
    : { command, arguments: arguments_ };
}

function recoveredContext(items) {
  if (!Array.isArray(items) || items.length === 0) return undefined;
  const lines = items
    .filter((item) => item && typeof item === 'object')
    .map((item) => `- [${item.kind ?? 'memory'}] ${item.title ?? 'Memory'}: ${item.content ?? item.snippet ?? ''}`);
  return lines.length > 0 ? ['## thoth-mem recovered context', ...lines].join('\n') : undefined;
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

function identityAwareContext(identity, context) {
  if (!identity) return undefined;
  const remaining = MAX_HOST_OUTPUT_CODE_POINTS - Array.from(identity).length;
  if (!context || remaining <= 2) return identity;
  return `${identity}\n\n${Array.from(context).slice(0, remaining - 2).join('')}`;
}

function renderHostOutput(payload, lifecycle) {
  const identity = verifiedIdentity(lifecycle?.identity);
  const context = recoveredContext(lifecycle?.data?.recovery?.items);
  const additionalContext = identityAwareContext(identity, context);
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
  const runtimeArguments = mcp ? ['mcp', '--no-http'] : ['lifecycle-v2', '--harness', harness];
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
      if (lifecycle?.schema !== 'thoth-mem.lifecycle.v2' || !lifecycle.data) throw new Error('runtime returned an invalid lifecycle result');
      process.stdout.write(JSON.stringify(renderHostOutput(payload, lifecycle)));
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error), !mcp);
}
