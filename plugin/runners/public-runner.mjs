import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const runnerDirectory = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(runnerDirectory, '..');
const MAX_DIAGNOSTIC_LENGTH = 560;
const WINDOWS_SHELL_META_CHARACTERS = /([()\][%!^"`<>&|;, *?])/g;

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

function publicInvocation(harness, runtime) {
  const command = process.env.THOTH_MEM_PUBLIC_NPX_COMMAND ?? (process.platform === 'win32' ? 'npx.cmd' : 'npx');
  const arguments_ = ['--yes', `${runtime.package}@${runtime.version}`, 'lifecycle-v2', '--harness', harness];
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

function renderHostOutput(payload, lifecycle) {
  const context = recoveredContext(lifecycle?.data?.recovery?.items);
  return payload?.hook_event_name === 'SessionStart' && context
    ? { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }
    : {};
}

function fail(message) {
  process.stdout.write('{}');
  process.stderr.write(boundedDiagnostic(`thoth-mem public plugin: ${message}`));
  process.exitCode = 1;
}

try {
  const harness = parseHarness(process.argv.slice(2));
  const input = readFileSync(0, 'utf8');
  const payload = JSON.parse(input);
  const runtime = loadRuntime();
  const invocation = publicInvocation(harness, runtime);
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
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
