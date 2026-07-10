import { spawn } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  realpathSync,
  readFileSync,
  statSync,
} from 'node:fs';
import {
  delimiter,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROTOCOL_VERSION = 1;
const MAX_INPUT_BYTES = 1_048_576;
const MAX_CHILD_OUTPUT_BYTES = 65_536;
const CHILD_TIMEOUT_MS = 10_000;
const MANAGED_METADATA_FILENAME = 'thoth-mem.installation.json';
const LEGACY_MANAGED_METADATA_FILENAME = '.thoth-mem-managed.json';

function bounded(value, maximum = 500) {
  return Array.from(value).slice(0, maximum).join('');
}

function degraded(diagnostic, retryable = true) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    outcome: 'degraded',
    retryable,
    diagnostic: bounded(diagnostic),
    manualAction: 'install thoth-mem and rerun managed setup.',
  };
}

function isFile(path) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function isRegularUnlinkedFile(path) {
  try {
    const details = lstatSync(path);
    return details.isFile() && !details.isSymbolicLink();
  } catch {
    return false;
  }
}

function sameRealPath(left, right) {
  try {
    return realpathSync.native(left) === realpathSync.native(right);
  } catch {
    return false;
  }
}

function normalizedMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  if (value.schemaVersion === 1) {
    return value;
  }
  if (value.schema_version !== 1) {
    return undefined;
  }
  return {
    schemaVersion: value.schema_version,
    packageVersion: value.package_version,
    executable: value.executable_path,
    harness: value.harness,
    scope: value.scope,
    target: value.target,
    configPath: value.config_path,
    assetsPath: value.assets_path,
    verified: value.verified,
  };
}

function validatedManagedExecutable(metadataPath) {
  if (!isRegularUnlinkedFile(metadataPath)) {
    return undefined;
  }
  const metadata = normalizedMetadata(JSON.parse(readFileSync(metadataPath, 'utf8')));
  if (!metadata
    || metadata.schemaVersion !== 1
    || typeof metadata.packageVersion !== 'string'
    || metadata.packageVersion.length === 0
    || !['opencode', 'codex', 'claude'].includes(metadata.harness)
    || !['global', 'project'].includes(metadata.scope)
    || typeof metadata.target !== 'string'
    || !isAbsolute(metadata.target)
    || typeof metadata.configPath !== 'string'
    || !isAbsolute(metadata.configPath)
    || typeof metadata.assetsPath !== 'string'
    || !isAbsolute(metadata.assetsPath)
    || !sameRealPath(metadata.assetsPath, dirname(metadataPath))
    || metadata.verified !== true
    || typeof metadata.executable !== 'string'
    || !isAbsolute(metadata.executable)
    || !isRegularUnlinkedFile(metadata.executable)) {
    return undefined;
  }
  return realpathSync.native(metadata.executable);
}

function nodeInvocation(executable) {
  const extension = extname(executable).toLowerCase();
  if (['.js', '.mjs', '.cjs'].includes(extension)) {
    return { command: process.execPath, args: [executable] };
  }

  try {
    const prefix = readFileSync(executable, { encoding: 'utf8' }).slice(0, 256);
    if (/^#!.*\bnode\b/m.test(prefix) || /^\s*(?:import|export|const|let|var)\b/m.test(prefix)) {
      return { command: process.execPath, args: [executable] };
    }
  } catch {
    // Native executables and unreadable launchers are invoked directly.
  }
  return { command: executable, args: [] };
}

function managedExecutable(runnerPath) {
  const runnerDirectory = dirname(runnerPath);
  const roots = [join(runnerDirectory, '..'), runnerDirectory];
  const candidates = roots.flatMap((root) => [
    join(root, MANAGED_METADATA_FILENAME),
    join(root, LEGACY_MANAGED_METADATA_FILENAME),
  ]);

  for (const metadataPath of candidates) {
    if (!existsSync(metadataPath)) {
      continue;
    }
    try {
      const executable = validatedManagedExecutable(metadataPath);
      if (executable) {
        return executable;
      }
    } catch {
      // Invalid managed metadata falls through to the next safe source.
    }
  }
  return undefined;
}

function pathExecutable(env) {
  const pathValue = env.PATH ?? env.Path ?? env.path ?? '';
  const names = process.platform === 'win32'
    ? ['thoth-mem', 'thoth-mem.exe', 'thoth-mem.mjs', 'thoth-mem.js']
    : ['thoth-mem', 'thoth-mem.mjs', 'thoth-mem.js'];

  for (const directory of pathValue.split(delimiter)) {
    if (!directory) {
      continue;
    }
    for (const name of names) {
      const candidate = join(directory, name);
      if (isFile(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

export function resolveThothMemCommand(options = {}) {
  const runnerPath = options.runnerPath ?? fileURLToPath(import.meta.url);
  const env = options.env ?? process.env;
  const managed = managedExecutable(runnerPath);
  if (managed) {
    return { ...nodeInvocation(managed), source: 'managed' };
  }

  const environmentExecutable = env.THOTH_MEM_BIN;
  if (environmentExecutable && isFile(environmentExecutable)) {
    return { ...nodeInvocation(environmentExecutable), source: 'environment' };
  }

  const fromPath = pathExecutable(env);
  if (fromPath) {
    return { ...nodeInvocation(fromPath), source: 'path' };
  }
  return undefined;
}

function parseArguments(args) {
  let harness;
  let hook;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--harness') {
      harness = args[index + 1];
      index += 1;
    } else if (args[index] === '--hook') {
      hook = args[index + 1];
      index += 1;
    }
  }
  return { harness, hook };
}

async function readBoundedStdin(stream) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_INPUT_BYTES) {
      throw new Error('input_too_large');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function protocolRequest(input, args) {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return { error: degraded('Hook stdin is not valid JSON.', false) };
  }

  if (payload?.protocolVersion === PROTOCOL_VERSION) {
    return { request: payload };
  }
  if (!['opencode', 'codex', 'claude'].includes(args.harness) || !args.hook) {
    return { error: degraded('Runner requires a supported --harness and --hook.', false) };
  }
  return {
    request: {
      protocolVersion: PROTOCOL_VERSION,
      harness: args.harness,
      event: { hook: args.hook, payload },
    },
  };
}

function execute(command, request) {
  return new Promise((resolveResult) => {
    const child = spawn(
      command.command,
      [...command.args, 'integration-event'],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      },
    );
    const stdout = [];
    let stdoutLength = 0;
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolveResult(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(degraded('thoth-mem integration event timed out before confirmation.'));
    }, CHILD_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdoutLength += chunk.length;
      if (stdoutLength > MAX_CHILD_OUTPUT_BYTES) {
        child.kill();
        finish(degraded('thoth-mem integration output exceeded the bounded response limit.'));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.resume();
    child.on('error', () => {
      finish(degraded('thoth-mem could not be started; no memory success was confirmed.'));
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      if (code !== 0) {
        finish(degraded('thoth-mem exited before memory success was confirmed.'));
        return;
      }

      try {
        const response = JSON.parse(Buffer.concat(stdout).toString('utf8'));
        if (!response
          || response.protocolVersion !== PROTOCOL_VERSION
          || !['confirmed', 'failed', 'degraded', 'no_op'].includes(response.outcome)) {
          finish(degraded('thoth-mem returned an unverified integration response.'));
          return;
        }
        finish(response);
      } catch {
        finish(degraded('thoth-mem returned invalid JSON; no memory success was confirmed.'));
      }
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(JSON.stringify(request));
  });
}

export async function dispatchHookRequest(request, options = {}) {
  const command = resolveThothMemCommand(options);
  if (!command) {
    return degraded('Unable to resolve the thoth-mem executable from managed metadata, THOTH_MEM_BIN, or PATH.');
  }
  return execute(command, request);
}

export async function main() {
  let input;
  try {
    input = await readBoundedStdin(process.stdin);
  } catch {
    process.stdout.write(`${JSON.stringify(degraded('Hook stdin exceeded the bounded input limit.', false))}\n`);
    return;
  }

  const wrapped = protocolRequest(input, parseArguments(process.argv.slice(2)));
  const result = wrapped.error ?? await dispatchHookRequest(wrapped.request);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPath === import.meta.url) {
  await main();
}
