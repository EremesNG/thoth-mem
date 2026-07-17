import { createHash, randomUUID } from 'node:crypto';
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
    if (total > MAX_INPUT_BYTES) throw new Error('input_too_large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value, maximum = 10_000) {
  return typeof value === 'string'
    && Array.from(value).length > 0
    && Array.from(value).length <= maximum;
}

function isNullableBoundedString(value, maximum = 10_000) {
  return value === null || isBoundedString(value, maximum);
}

const NATIVE_BEHAVIOR_EVIDENCE = Object.freeze({
  codex: Object.freeze({
    payloadMappingId: 'codex-session-payload-v1',
    assetExecutionMarker: 'codex-activation-v1',
    behaviorEvidenceMappingId: 'codex-command-hook-payload-v1',
  }),
  claude: Object.freeze({
    payloadMappingId: 'claude-code-session-payload-v1',
    assetExecutionMarker: 'claude-code-activation-v1',
    behaviorEvidenceMappingId: 'claude-code-command-hook-payload-v1',
  }),
});

const NATIVE_HOOK_MAPPINGS = Object.freeze({
  codex: Object.freeze({
    SessionStart: Object.freeze({ eventMappingId: 'codex-session-start-v1', deliveryMappingId: 'codex-recovery-injection-v1' }),
    UserPromptSubmit: Object.freeze({ eventMappingId: 'codex-user-prompt-v1', deliveryMappingId: 'codex-user-prompt-injection-v1' }),
    PreCompact: Object.freeze({ eventMappingId: 'codex-compaction-v1', deliveryMappingId: 'codex-compaction-v1' }),
  }),
  claude: Object.freeze({
    SessionStart: Object.freeze({ eventMappingId: 'claude-code-session-start-v1', deliveryMappingId: 'claude-code-recovery-injection-v1' }),
    UserPromptSubmit: Object.freeze({ eventMappingId: 'claude-code-user-prompt-v1', deliveryMappingId: 'claude-code-user-prompt-injection-v1' }),
    PreCompact: Object.freeze({ eventMappingId: 'claude-code-compaction-v1', deliveryMappingId: 'claude-code-compaction-v1' }),
    SessionEnd: Object.freeze({ eventMappingId: 'claude-code-session-end-v1', deliveryMappingId: 'claude-code-session-end-v1' }),
    SubagentStop: Object.freeze({ eventMappingId: 'claude-subagent-stop-passive-v1', deliveryMappingId: 'claude-subagent-stop-passive-v1' }),
  }),
});

const CODEX_COMMON_FIELDS = Object.freeze([
  'session_id',
  'transcript_path',
  'cwd',
  'hook_event_name',
  'model',
]);
const CLAUDE_COMMON_REQUIRED_FIELDS = Object.freeze([
  'session_id',
  'transcript_path',
  'cwd',
  'hook_event_name',
]);
const CLAUDE_OPTIONAL_COMMON_FIELDS = Object.freeze([
  'prompt_id',
  'permission_mode',
  'agent_id',
  'agent_type',
]);
const CODEX_HOOK_FIELDS = Object.freeze({
  SessionStart: Object.freeze([...CODEX_COMMON_FIELDS, 'permission_mode', 'source']),
  UserPromptSubmit: Object.freeze([...CODEX_COMMON_FIELDS, 'permission_mode', 'turn_id', 'prompt']),
  PreCompact: Object.freeze([...CODEX_COMMON_FIELDS, 'turn_id', 'trigger']),
  Stop: Object.freeze([...CODEX_COMMON_FIELDS, 'permission_mode', 'turn_id', 'stop_hook_active', 'last_assistant_message']),
  SubagentStop: Object.freeze([...CODEX_COMMON_FIELDS, 'permission_mode', 'turn_id', 'agent_id', 'agent_type', 'agent_transcript_path', 'stop_hook_active', 'last_assistant_message']),
});
const CLAUDE_HOOK_FIELDS = Object.freeze({
  SessionStart: Object.freeze([...CLAUDE_COMMON_REQUIRED_FIELDS, ...CLAUDE_OPTIONAL_COMMON_FIELDS, 'source', 'model', 'session_title']),
  UserPromptSubmit: Object.freeze([...CLAUDE_COMMON_REQUIRED_FIELDS, ...CLAUDE_OPTIONAL_COMMON_FIELDS, 'prompt']),
  PreCompact: Object.freeze([...CLAUDE_COMMON_REQUIRED_FIELDS, ...CLAUDE_OPTIONAL_COMMON_FIELDS, 'trigger', 'custom_instructions']),
  Stop: Object.freeze([...CLAUDE_COMMON_REQUIRED_FIELDS, ...CLAUDE_OPTIONAL_COMMON_FIELDS, 'stop_hook_active', 'last_assistant_message', 'effort', 'background_tasks', 'session_crons']),
  SessionEnd: Object.freeze([...CLAUDE_COMMON_REQUIRED_FIELDS, ...CLAUDE_OPTIONAL_COMMON_FIELDS, 'reason']),
  SubagentStop: Object.freeze([...CLAUDE_COMMON_REQUIRED_FIELDS, 'permission_mode', 'agent_id', 'agent_type', 'stop_hook_active', 'agent_transcript_path', 'last_assistant_message', 'prompt_id', 'effort', 'background_tasks', 'session_crons']),
});
const REQUIRED_NATIVE_FIELDS = Object.freeze({
  codex: Object.freeze({
    SessionStart: Object.freeze([...CODEX_COMMON_FIELDS, 'permission_mode', 'source']),
    UserPromptSubmit: Object.freeze([...CODEX_COMMON_FIELDS, 'permission_mode', 'turn_id', 'prompt']),
    PreCompact: Object.freeze([...CODEX_COMMON_FIELDS, 'turn_id', 'trigger']),
    Stop: Object.freeze([...CODEX_COMMON_FIELDS, 'permission_mode', 'turn_id', 'stop_hook_active', 'last_assistant_message']),
    SubagentStop: Object.freeze([...CODEX_COMMON_FIELDS, 'permission_mode', 'turn_id', 'agent_id', 'agent_type', 'agent_transcript_path', 'stop_hook_active', 'last_assistant_message']),
  }),
  claude: Object.freeze({
    SessionStart: Object.freeze([...CLAUDE_COMMON_REQUIRED_FIELDS, 'source']),
    UserPromptSubmit: Object.freeze([...CLAUDE_COMMON_REQUIRED_FIELDS, 'prompt']),
    PreCompact: Object.freeze([...CLAUDE_COMMON_REQUIRED_FIELDS, 'trigger', 'custom_instructions']),
    Stop: Object.freeze([...CLAUDE_COMMON_REQUIRED_FIELDS, 'stop_hook_active', 'last_assistant_message']),
    SessionEnd: Object.freeze([...CLAUDE_COMMON_REQUIRED_FIELDS, 'reason']),
    SubagentStop: Object.freeze([...CLAUDE_COMMON_REQUIRED_FIELDS, 'stop_hook_active', 'agent_id', 'agent_type', 'agent_transcript_path', 'last_assistant_message']),
  }),
});

function nativeMapping(harness, hook) {
  return NATIVE_HOOK_MAPPINGS[harness]?.[hook];
}

function allowedNativeFields(harness, hook) {
  return harness === 'codex' ? CODEX_HOOK_FIELDS[hook] : CLAUDE_HOOK_FIELDS[hook];
}

function requiredNativeFields(harness, hook) {
  return REQUIRED_NATIVE_FIELDS[harness]?.[hook];
}

const MAX_SUBAGENT_OPTIONAL_METADATA_ITEMS = 100;
const MAX_SUBAGENT_OPTIONAL_METADATA_CODE_POINTS = 1_000;
const BACKGROUND_TASK_FIELDS = new Set(['id', 'type', 'status', 'description', 'command', 'agent_type', 'server', 'tool', 'name']);

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isSubagentMetadataString(value) {
  return isBoundedString(value, MAX_SUBAGENT_OPTIONAL_METADATA_CODE_POINTS);
}

function isEffort(value) {
  return isRecord(value)
    && Object.keys(value).length === 1
    && ['low', 'medium', 'high', 'xhigh', 'max'].includes(value.level);
}

function isBackgroundTask(value) {
  return isRecord(value)
    && Object.keys(value).length > 0
    && Object.keys(value).every((key) => BACKGROUND_TASK_FIELDS.has(key))
    && Object.entries(value).every(([key, entry]) => (key === 'description' || key === 'command')
      ? isBoundedString(entry, MAX_SUBAGENT_OPTIONAL_METADATA_CODE_POINTS)
      : isSubagentMetadataString(entry));
}

function isSessionCron(value) {
  return isRecord(value)
    && Object.keys(value).length === 4
    && ['id', 'schedule', 'recurring', 'prompt'].every((key) => Object.hasOwn(value, key))
    && isSubagentMetadataString(value.id)
    && isSubagentMetadataString(value.schedule)
    && typeof value.recurring === 'boolean'
    && isBoundedString(value.prompt, MAX_SUBAGENT_OPTIONAL_METADATA_CODE_POINTS);
}

function hasValidClaudeSubagentStopOptionalMetadata(value) {
  return (value.prompt_id === undefined || isUuid(value.prompt_id))
    && (value.effort === undefined || isEffort(value.effort))
    && (value.background_tasks === undefined || (
      Array.isArray(value.background_tasks)
      && value.background_tasks.length <= MAX_SUBAGENT_OPTIONAL_METADATA_ITEMS
      && value.background_tasks.every(isBackgroundTask)
    ))
    && (value.session_crons === undefined || (
      Array.isArray(value.session_crons)
      && value.session_crons.length <= MAX_SUBAGENT_OPTIONAL_METADATA_ITEMS
      && value.session_crons.every(isSessionCron)
    ));
}

function isValidNativeField(key, value) {
  if (key === 'transcript_path' || key === 'agent_transcript_path' || key === 'last_assistant_message') {
    return isNullableBoundedString(value);
  }
  if (key === 'stop_hook_active') return typeof value === 'boolean';
  if (key === 'custom_instructions') return typeof value === 'string' && Array.from(value).length <= 10_000;
  if (key === 'effort') return isEffort(value);
  if (key === 'background_tasks') return Array.isArray(value) && value.length <= 100 && value.every(isBackgroundTask);
  if (key === 'session_crons') return Array.isArray(value) && value.length <= 100 && value.every(isSessionCron);
  return isBoundedString(value);
}

function validatedNativePayload(harness, hook, value) {
  const allowed = allowedNativeFields(harness, hook);
  const required = requiredNativeFields(harness, hook);
  if (!allowed || !required || !isRecord(value) || Object.keys(value).some((key) => !allowed.includes(key))) return undefined;
  for (const field of required) {
    if (!Object.hasOwn(value, field) || !isValidNativeField(field, value[field])) return undefined;
  }
  if (value.hook_event_name !== hook) return undefined;
  if (harness === 'claude' && hook === 'SubagentStop'
    && !hasValidClaudeSubagentStopOptionalMetadata(value)) return undefined;
  if (harness === 'codex' && hook === 'SessionStart'
    && !['startup', 'resume', 'clear', 'compact'].includes(value.source)) return undefined;
  if (harness === 'codex' && hook === 'PreCompact'
    && !['manual', 'auto'].includes(value.trigger)) return undefined;
  if (harness === 'claude' && hook === 'SessionStart'
    && !['startup', 'resume', 'clear', 'compact'].includes(value.source)) return undefined;
  if (harness === 'claude' && hook === 'PreCompact'
    && !['manual', 'auto'].includes(value.trigger)) return undefined;

  const payload = {};
  for (const field of allowed) {
    if (Object.hasOwn(value, field)) {
      if (!isValidNativeField(field, value[field])) return undefined;
      payload[field] = value[field];
    }
  }
  if (harness === 'claude' && hook === 'SubagentStop') {
    delete payload.transcript_path;
    delete payload.agent_transcript_path;
    delete payload.prompt_id;
    delete payload.effort;
    delete payload.background_tasks;
    delete payload.session_crons;
  }
  return payload;
}

function stableClaudeSubagentEventId(payload) {
  return 'claude-subagent-stop-' + createHash('sha256')
    .update(payload.session_id, 'utf8')
    .update('\u0000', 'utf8')
    .update(payload.agent_id, 'utf8')
    .digest('hex')
    .slice(0, 48);
}

function expectedNativeIntent(request) {
  const hook = request.event?.hook;
  const payload = request.event?.payload;
  if (hook === 'UserPromptSubmit') return 'capture_root_prompt';
  if (hook === 'PreCompact') return 'compact_session';
  if (request.harness === 'claude' && hook === 'SubagentStop') return 'capture_passive_learning';
  if (hook === 'SessionEnd' || (request.harness === 'codex' && hook === 'Stop')) return 'finalize_session';
  if (['codex', 'claude'].includes(request.harness) && hook === 'SessionStart' && payload?.source === 'compact') return 'recall_guidance';
  return 'enroll_session';
}

function isExactDirective(value, mapping, purpose) {
  return isRecord(value)
    && Object.keys(value).length === 3
    && value.purpose === purpose
    && isBoundedString(value.text, 1_000)
    && value.deliveryMappingId === mapping.deliveryMappingId;
}

function isReadyDeliveryState(value) {
  return isRecord(value)
    && Object.keys(value).length === 5
    && (value.activation === 'unproven' || value.activation === 'eligible')
    && value.memoryConfirmation === 'confirmed'
    && value.outputReadiness === 'ready'
    && value.localEmission === 'not_emitted'
    && value.modelConsumption === 'unproven';
}

function isStrictNativeChildResponse(response, request) {
  if (request.harness !== 'codex' && request.harness !== 'claude') return true;
  if (!isRecord(response)) return false;
  const allowed = new Set([
    'protocolVersion', 'harness', 'intent', 'outcome', 'retryable',
    'hostOutputDirective', 'deliveryState',
  ]);
  if (Object.keys(response).some((key) => !allowed.has(key))
    || response.protocolVersion !== PROTOCOL_VERSION
    || response.harness !== request.harness
    || response.intent !== expectedNativeIntent(request)
    || !['confirmed', 'degraded'].includes(response.outcome)
    || response.retryable !== false) return false;

  const hook = request.event.hook;
  const directive = response.hostOutputDirective;
  const deliveryState = response.deliveryState;
  if ((directive === undefined) !== (deliveryState === undefined)) return false;
  if (directive === undefined) return hook !== 'SessionStart';

  const mapping = nativeMapping(request.harness, hook);
  const purpose = hook === 'PreCompact' ? 'post_compaction_guidance' : 'recovery_context';
  return mapping
    && isExactDirective(directive, mapping, purpose)
    && isReadyDeliveryState(deliveryState);
}

function nativeHookRequest(payload, args) {
  if (!['codex', 'claude'].includes(args.harness) || !isBoundedString(args.hook, 128)) {
    return { error: degraded('Runner requires a supported native --harness and --hook.', false) };
  }
  const validated = validatedNativePayload(args.harness, args.hook, payload);
  if (!validated) return { error: degraded('Native hook payload is missing, malformed, or contains unsupported facts.', false) };

  if (args.harness === 'claude' && args.hook === 'SubagentStop' && validated.stop_hook_active !== false) {
    return { error: degraded('Claude SubagentStop is unsafe while stop_hook_active is true.', false) };
  }
  const localEventId = args.harness === 'claude' && args.hook === 'SubagentStop'
    ? stableClaudeSubagentEventId(validated)
    : randomUUID();
  const localTimestamp = new Date().toISOString();
  const mapping = nativeMapping(args.harness, args.hook);
  const behavior = NATIVE_BEHAVIOR_EVIDENCE[args.harness];
  return {
    request: {
      protocolVersion: PROTOCOL_VERSION,
      harness: args.harness,
      ...(mapping ? {
        capabilityEvidence: {
          ...behavior,
          eventMappingId: mapping.eventMappingId,
          deliveryChannel: 'runner-stdout',
          deliveryMappingId: mapping.deliveryMappingId,
        },
      } : {}),
      event: {
        hook: args.hook,
        id: localEventId,
        timestamp: localTimestamp,
        payload: validated,
      },
    },
  };
}

function protocolRequest(input, args) {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return { error: degraded('Hook stdin is not valid JSON.', false) };
  }
  if (args.harness === 'codex' || args.harness === 'claude') return nativeHookRequest(payload, args);
  if (payload?.protocolVersion === PROTOCOL_VERSION) return { request: payload };
  if (args.harness !== 'opencode' || !args.hook) {
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
    const child = spawn(command.command, [...command.args, 'integration-event'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    const stdout = [];
    let stdoutLength = 0;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
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
    child.on('error', () => finish(degraded('thoth-mem could not be started; no memory success was confirmed.')));
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(degraded('thoth-mem exited before memory success was confirmed.'));
        return;
      }
      try {
        const response = JSON.parse(Buffer.concat(stdout).toString('utf8'));
        if (!response
          || response.protocolVersion !== PROTOCOL_VERSION
          || !['confirmed', 'failed', 'degraded', 'no_op'].includes(response.outcome)
          || !isStrictNativeChildResponse(response, request)) {
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

function renderNativeStdout(args, request, result) {
  if ((args.harness !== 'codex' && args.harness !== 'claude')
    || args.hook !== 'SessionStart'
    || !request
    || !isStrictNativeChildResponse(result, request)) return {};
  return {
    hookSpecificOutput: {
      hookEventName: args.hook,
      additionalContext: result.hostOutputDirective.text,
    },
  };
}

export async function dispatchHookRequest(request, options = {}) {
  const command = resolveThothMemCommand(options);
  return command
    ? execute(command, request)
    : degraded('Unable to resolve the thoth-mem executable from managed metadata, THOTH_MEM_BIN, or PATH.');
}

export async function main() {
  const args = parseArguments(process.argv.slice(2));
  const nativeHarness = args.harness === 'codex' || args.harness === 'claude';
  let input;
  try {
    input = await readBoundedStdin(process.stdin);
  } catch {
    process.stdout.write(JSON.stringify(nativeHarness ? {} : degraded('Hook stdin exceeded the bounded input limit.', false)) + '\n');
    return;
  }
  const wrapped = protocolRequest(input, args);
  const result = wrapped.error ?? await dispatchHookRequest(wrapped.request);
  const output = nativeHarness ? renderNativeStdout(args, wrapped.request, result) : result;
  if (nativeHarness && Object.hasOwn(output, 'hookSpecificOutput')) {
    process.stderr.write('thoth-mem: emitted_via_verified_channel\n');
  }
  process.stdout.write(JSON.stringify(output) + '\n');
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPath === import.meta.url) await main();
