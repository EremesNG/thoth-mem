import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import type { RuntimeConfigOptions } from '../../config/runtime.js';
import type { AdapterEvent, LifecycleIntent } from '../adapters/index.js';
import {
  isCanonicalValue,
  MEMORY_KIND_VALUES,
  MEMORY_OUTCOME_VALUES,
  MEMORY_STATUS_VALUES,
  type LifecycleInput,
  type LifecycleResult,
  type RecallItem,
} from '../../memory-core/contracts.js';

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256_000;
const INTENTS: Record<LifecycleInput['operation'], LifecycleIntent> = {
  enroll: 'session.enroll',
  recover: 'session.recover',
  capture_root: 'prompt.capture_root',
  checkpoint_pre_compact: 'session.checkpoint_pre_compact',
  guide_post_compact: 'session.guide_post_compact',
  finalize: 'session.finalize',
};

export interface OpenCodeLifecycleDispatchInput {
  operation: LifecycleInput['operation'];
  directory: string;
  rootSessionKey: string;
  eventKey: string;
  content?: string;
}

export interface NodeLifecycleClientOptions {
  runtimeEntry: string;
  runtimeConfig?: RuntimeConfigOptions;
  nodeCommand?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  onDiagnostic?: (code: string) => void;
}

type EnvelopeDiagnostic = 'node_lifecycle_invalid_json' | 'node_lifecycle_identity_mismatch' | 'node_lifecycle_invalid_recovery_taxonomy' | 'node_lifecycle_invalid_envelope';
type EnvelopeParseResult = { result: LifecycleResult; diagnostic?: never } | { result?: never; diagnostic: EnvelopeDiagnostic };

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function budget(value: unknown): boolean {
  const item = record(value);
  return Boolean(item
    && finiteNumber(item.requestedChars)
    && finiteNumber(item.returnedChars)
    && finiteNumber(item.truncatedChars)
    && finiteNumber(item.sourceChars)
    && finiteNumber(item.evidenceChars)
    && finiteNumber(item.fullChars)
    && finiteNumber(item.compressionRatio)
    && item.tokenBasis === 'estimated_chars_div_4');
}

function recallItem(value: unknown): value is RecallItem {
  const item = record(value);
  const score = record(item?.scoreComponents);
  return Boolean(item
    && typeof item.id === 'string'
    && typeof item.title === 'string'
    && isCanonicalValue(MEMORY_KIND_VALUES, item.kind)
    && (item.topicKey === null || typeof item.topicKey === 'string')
    && isCanonicalValue(MEMORY_OUTCOME_VALUES, item.outcome)
    && isCanonicalValue(MEMORY_STATUS_VALUES, item.status)
    && typeof item.snippet === 'string'
    && (item.content === undefined || typeof item.content === 'string')
    && finiteNumber(item.score)
    && score
    && finiteNumber(score.exact)
    && finiteNumber(score.lexical)
    && finiteNumber(score.temporal)
    && (item.lane === 'structured' || item.lane === 'lexical')
    && stringArray(item.evidenceIds));
}

function lifecycleResult(value: unknown): value is LifecycleResult {
  const data = record(value);
  const capability = record(data?.capability);
  const recovery = data?.recovery === undefined ? undefined : record(data.recovery);
  return Boolean(data
    && (data.outcome === 'confirmed' || data.outcome === 'degraded' || data.outcome === 'failed')
    && typeof data.duplicate === 'boolean'
    && typeof data.projectId === 'string'
    && typeof data.sessionId === 'string'
    && (data.evidenceId === null || typeof data.evidenceId === 'string')
    && capability
    && typeof capability.hookExecuted === 'boolean'
    && typeof capability.memoryConfirmed === 'boolean'
    && typeof capability.contextDelivered === 'boolean'
    && typeof capability.modelConsumed === 'boolean'
    && (recovery === undefined
      || (Array.isArray(recovery.items)
        && recovery.items.every(recallItem)
        && stringArray(recovery.sources)
        && budget(recovery.budget))));
}

function hasInvalidRecoveryTaxonomy(value: unknown): boolean {
  const data = record(value);
  const recovery = record(data?.recovery);
  if (!Array.isArray(recovery?.items)) return false;
  return recovery.items.some((value) => {
    const item = record(value);
    return Boolean(item && (
      ('kind' in item && !isCanonicalValue(MEMORY_KIND_VALUES, item.kind))
      || ('outcome' in item && !isCanonicalValue(MEMORY_OUTCOME_VALUES, item.outcome))
      || ('status' in item && !isCanonicalValue(MEMORY_STATUS_VALUES, item.status))
    ));
  });
}

function parseEnvelope(value: string, event: AdapterEvent): EnvelopeParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { diagnostic: 'node_lifecycle_invalid_json' };
  }
  const envelope = record(parsed);
  const identity = record(envelope?.identity);
  if (envelope?.schema !== 'thoth-mem.lifecycle'
    || typeof identity?.root_session_id !== 'string'
    || typeof identity.project !== 'string') return { diagnostic: 'node_lifecycle_invalid_envelope' };
  if (identity.root_session_id !== event.rootSessionKey || identity.project !== event.projectName) return { diagnostic: 'node_lifecycle_identity_mismatch' };
  if (hasInvalidRecoveryTaxonomy(envelope.data)) return { diagnostic: 'node_lifecycle_invalid_recovery_taxonomy' };
  if (!lifecycleResult(envelope.data)) return { diagnostic: 'node_lifecycle_invalid_envelope' };
  return { result: envelope.data };
}

function adapterEvent(input: OpenCodeLifecycleDispatchInput): AdapterEvent {
  const normalizedDirectory = input.directory.replaceAll('\\', '/').replace(/\/$/u, '');
  const projectName = normalizedDirectory.split('/').filter(Boolean).at(-1) ?? normalizedDirectory;
  return {
    version: 2,
    harness: 'opencode',
    intent: INTENTS[input.operation],
    projectKey: `path:${normalizedDirectory}`,
    projectName,
    rootSessionKey: input.rootSessionKey,
    eventKey: input.eventKey,
    ...(input.content?.trim() ? { content: input.content.slice(0, 20_000) } : {}),
    callerRole: 'root',
  };
}

function childEnvironment(runtimeConfig: RuntimeConfigOptions | undefined): NodeJS.ProcessEnv {
  const env = { ...process.env, ...runtimeConfig?.env };
  if (runtimeConfig?.homeDir) {
    env.HOME = runtimeConfig.homeDir;
    env.USERPROFILE = runtimeConfig.homeDir;
  }
  return env;
}

export async function dispatchOpenCodeLifecycleThroughNode(
  input: OpenCodeLifecycleDispatchInput,
  options: NodeLifecycleClientOptions,
): Promise<LifecycleResult | undefined> {
  const event = adapterEvent(input);
  const args = [options.runtimeEntry, 'lifecycle'];
  if (options.runtimeConfig?.explicitDataDir !== undefined) args.push('--data-dir', options.runtimeConfig.explicitDataDir);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let outputBytes = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: LifecycleResult | undefined, diagnostic?: string): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (diagnostic) {
        try {
          options.onDiagnostic?.(diagnostic);
        } catch {
          // Diagnostics must never make a host lifecycle callback fail.
        }
      }
      resolve(result);
    };
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(options.nodeCommand ?? 'node', args, {
        env: childEnvironment(options.runtimeConfig),
        shell: false,
        stdio: 'pipe',
        windowsHide: true,
      });
    } catch {
      finish(undefined, 'node_lifecycle_launch_failed');
      return;
    }
    const consume = (chunk: Buffer, capture: boolean): void => {
      outputBytes += chunk.byteLength;
      if (outputBytes > maxOutputBytes) {
        child.kill();
        finish(undefined, 'node_lifecycle_output_limit');
        return;
      }
      if (capture) stdout += chunk.toString('utf8');
    };
    timer = setTimeout(() => {
      child.kill();
      finish(undefined, 'node_lifecycle_timeout');
    }, timeoutMs);
    timer.unref?.();
    child.once('error', () => finish(undefined, 'node_lifecycle_launch_failed'));
    child.stdout.on('data', (chunk: Buffer) => consume(chunk, true));
    child.stderr.on('data', (chunk: Buffer) => consume(chunk, false));
    child.once('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(undefined, 'node_lifecycle_nonzero_exit');
        return;
      }
      const parsed = parseEnvelope(stdout.trim(), event);
      finish(parsed.result, parsed.diagnostic);
    });
    child.stdin.once('error', () => finish(undefined, 'node_lifecycle_stdin_failed'));
    child.stdin.end(JSON.stringify(event));
  });
}
