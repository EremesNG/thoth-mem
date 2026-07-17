import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HOST_EVIDENCE } from '../fixtures/integration/host-evidence.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const pluginPath = join(repositoryRoot, 'integrations/opencode/plugin.mjs');
const memoryProtocol = readFileSync(join(repositoryRoot, 'integrations/opencode/memory-protocol.md'), 'utf8');
const openCode = HOST_EVIDENCE.find((entry) => entry.harness === 'opencode');
if (!openCode) throw new Error('Expected OpenCode host evidence');

type DirectivePurpose = 'recovery_context' | 'post_compaction_guidance';
interface HookResponse {
  protocolVersion: 1;
  operation?: 'prepare_delivery' | 'confirm_delivery';
  outcome: 'confirmed';
  retryable: false;
  hostOutputDirective?: { purpose: DirectivePurpose; text: string; deliveryMappingId: string };
  deliveryAttempt?: string;
}
interface OpenCodeHooks {
  'experimental.chat.system.transform'(input: { sessionID?: string; model?: unknown }, output: { system: string[] }): Promise<void>;
  'experimental.session.compacting'(input: { sessionID?: string }, output: { context: string[]; prompt?: string }): Promise<void>;
}
type Dispatch = (request: unknown) => Promise<HookResponse>;
type PluginFactory = (options?: { dispatch?: Dispatch }) => (context: unknown) => Promise<OpenCodeHooks>;

async function loadPlugin(): Promise<PluginFactory> {
  const module = await import(`${pathToFileURL(pluginPath).href}?test=${randomUUID()}`);
  return module.createOpenCodePlugin as PluginFactory;
}

function response(purpose: DirectivePurpose, deliveryMappingId: string, text: string): HookResponse {
  return {
    protocolVersion: 1,
    operation: 'prepare_delivery',
    outcome: 'confirmed',
    retryable: false,
    deliveryAttempt: `${Buffer.from('{"version":1}').toString('base64url')}.${'a'.repeat(64)}`,
    hostOutputDirective: { purpose, deliveryMappingId, text },
  };
}

function modelInput(sessionID = 'root-session'): { sessionID: string; model: { providerID: string; modelID: string } } {
  return { sessionID, model: { providerID: 'openai', modelID: 'gpt-5.6-terra' } };
}

function occurrences(text: string, fragment: string): number {
  return text.split(fragment).length - 1;
}

describe('OpenCode runtime behavior-evidence binding', () => {
  it('omits unavailable hostVersion and awaits structured initialization and emission logs', async () => {
    const requests: Record<string, unknown>[] = [];
    const logs: unknown[] = [];
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        requests.push(request as Record<string, unknown>);
        return response('recovery_context', openCode.recovery.mappingId, 'Recovered context');
      },
    })({
      directory: '/workspace',
      project: 'thoth-mem',
      client: { app: { log: async (entry: unknown) => { await Promise.resolve(); logs.push(entry); } } },
    });
    const system = ['Existing system instructions'];
    const output = { system };

    expect(await hooks['experimental.chat.system.transform'](modelInput(), output)).toBeUndefined();
    expect(output.system).toBe(system);
    expect(output.system).toHaveLength(1);
    expect(output.system[0]).toContain(memoryProtocol);
    expect(output.system[0]).toContain('Recovered context');
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      protocolVersion: 1,
      operation: 'prepare_delivery',
      harness: 'opencode',
      event: { type: 'experimental.chat.system.transform', input: modelInput() },
      capabilityEvidence: {
        payloadMappingId: openCode.payloadMappingId,
        assetExecutionMarker: openCode.activationMarker,
        eventMappingId: openCode.activation.mappingId,
        deliveryChannel: openCode.recovery.channel,
        deliveryMappingId: openCode.recovery.mappingId,
        behaviorEvidenceMappingId: 'opencode-plugin-init-mutation-v1',
      },
    });
    expect((requests[0].capabilityEvidence as Record<string, unknown>)).not.toHaveProperty('hostVersion');
    expect(logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ body: expect.objectContaining({ message: 'opencode_behavior_evidence_initialized' }) }),
      expect.objectContaining({ body: expect.objectContaining({ message: 'emitted_via_verified_channel' }) }),
    ]));
  });

  it('accepts a nonempty plain model with additional fields but rejects empty, array, and null models', async () => {
    const requests: Record<string, unknown>[] = [];
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        requests.push(request as Record<string, unknown>);
        return response('recovery_context', openCode.recovery.mappingId, 'Recovered context');
      },
    })({ client: { app: { log: async () => undefined } } });
    const output = { system: ['base'] };

    await hooks['experimental.chat.system.transform']({
      sessionID: 'root-session',
      model: { providerID: 'openai', modelID: 'gpt-5.6-terra', reasoning: { effort: 'high' } },
    }, output);
    expect(output.system.join('\n')).toContain('Recovered context');
    expect(requests).toHaveLength(2);

    for (const model of [{}, [], null]) {
      await hooks['experimental.chat.system.transform']({ sessionID: 'invalid-model', model }, { system: ['base'] });
    }
    expect(requests).toHaveLength(2);
  });

  it('merges the final system entry or pushes an empty channel without duplicate protocol or recovery text', async () => {
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async () => response('recovery_context', openCode.recovery.mappingId, 'Recovered context'),
    })({ client: { app: { log: async () => undefined } } });
    const nonEmpty = { system: ['Base'] };
    const existingArray = nonEmpty.system;

    await hooks['experimental.chat.system.transform'](modelInput(), nonEmpty);
    await hooks['experimental.chat.system.transform'](modelInput(), nonEmpty);
    expect(nonEmpty.system).toBe(existingArray);
    expect(nonEmpty.system).toHaveLength(1);
    expect(occurrences(nonEmpty.system[0], memoryProtocol)).toBe(1);
    expect(occurrences(nonEmpty.system[0], 'Recovered context')).toBe(1);

    const empty = { system: [] as string[] };
    const emptyArray = empty.system;
    await hooks['experimental.chat.system.transform'](modelInput(), empty);
    expect(empty.system).toBe(emptyArray);
    expect(empty.system).toHaveLength(1);
  });

  it('appends compacting output.context in place and never sets a replacement prompt', async () => {
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async () => response('post_compaction_guidance', openCode.compaction.mappingId, 'Continue after compaction'),
    })({ client: { app: { log: async () => undefined } } });
    const context = ['Existing compaction context'];
    const output = { context };

    expect(await hooks['experimental.session.compacting']({ sessionID: 'root-session' }, output)).toBeUndefined();
    expect(output.context).toBe(context);
    expect(output.context).toEqual(['Existing compaction context', 'Continue after compaction']);
    expect(output).not.toHaveProperty('prompt');
  });

  it('fails closed with no directive mutation for missing marker, malformed payload, or mismatched channel', async () => {
    const createOpenCodePlugin = await loadPlugin();
    const noMarker = await createOpenCodePlugin({
      dispatch: async () => response('recovery_context', openCode.recovery.mappingId, 'Recovered context'),
    })({});
    const markerOutput = { system: ['Base'] };
    await noMarker['experimental.chat.system.transform']({ sessionID: 'root-session' }, markerOutput);
    expect(markerOutput.system).toEqual(['Base']);

    const mismatched = await createOpenCodePlugin({
      dispatch: async () => response('recovery_context', openCode.compaction.mappingId, 'Wrong channel'),
    })({ client: { app: { log: async () => undefined } } });
    const malformedOutput = { system: ['Base'] };
    await mismatched['experimental.chat.system.transform']({}, malformedOutput);
    expect(malformedOutput.system).toEqual(['Base']);
    const channelOutput = { system: ['Base'] };
    await mismatched['experimental.chat.system.transform'](modelInput(), channelOutput);
    expect(channelOutput.system).toEqual(['Base']);
  });
});
describe('OpenCode private delivery preparation', () => {
  it('sends only an eligible private prepare request for the exact v1.17.19 system callback and consumes a bounded tokenized directive', async () => {
    const requests: Record<string, unknown>[] = [];
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        requests.push(request as Record<string, unknown>);
        return response('recovery_context', openCode.recovery.mappingId, 'Recovered context');
      },
    })({ client: { app: { log: async () => undefined } } });
    const output = { system: [] as string[] };

    await hooks['experimental.chat.system.transform']({ sessionID: 'root', model: { providerID: 'openai', modelID: 'gpt' } } as never, output);

    expect(requests[0]).toMatchObject({
      operation: 'prepare_delivery',
      capabilityEvidence: expect.not.objectContaining({ hostVersion: expect.anything() }),
      event: { type: 'experimental.chat.system.transform', input: { sessionID: 'root', model: { providerID: 'openai', modelID: 'gpt' } } },
    });
    expect(output.system.join('\n')).toContain('Recovered context');
  });

  it('uses the official compacting payload with no model and completes prepare then confirmation', async () => {
    const operations: string[] = [];
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        const operation = (request as Record<string, unknown>).operation as string;
        operations.push(operation);
        return operation === 'prepare_delivery'
          ? response('post_compaction_guidance', openCode.compaction.mappingId, 'Continue after compaction')
          : { protocolVersion: 1, operation: 'confirm_delivery', outcome: 'confirmed', retryable: false };
      },
    })({ client: { app: { log: async () => undefined } } });
    const context = ['Existing context'];

    await hooks['experimental.session.compacting']({ sessionID: 'root-session' }, { context });

    expect(context).toEqual(['Existing context', 'Continue after compaction']);
    expect(operations).toEqual(['prepare_delivery', 'confirm_delivery']);
  });

  it('uses one generated callback nonce and sequence through retries, then creates fresh evidence for the next compaction', async () => {
    const prepares: Array<{ id: unknown; sequence: unknown }> = [];
    const confirmations: Array<{ id: unknown; sequence: unknown }> = [];
    let confirmationCount = 0;
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        const record = request as { operation?: string; event?: Record<string, unknown> };
        if (record.operation === 'prepare_delivery') {
          prepares.push({ id: record.event?.id, sequence: record.event?.sequence });
          return response('post_compaction_guidance', openCode.compaction.mappingId, 'Guidance ' + prepares.length);
        }
        confirmations.push({ id: record.event?.id, sequence: record.event?.sequence });
        confirmationCount += 1;
        return confirmationCount === 1
          ? { protocolVersion: 1, operation: 'confirm_delivery', outcome: 'failed', retryable: true }
          : { protocolVersion: 1, operation: 'confirm_delivery', outcome: 'confirmed', retryable: false };
      },
    })({ client: { app: { log: async () => undefined } } });

    await hooks['experimental.session.compacting']({ sessionID: 'root-session' }, { context: [] });
    await hooks['experimental.session.compacting']({ sessionID: 'root-session' }, { context: [] });

    expect(prepares).toEqual([
      { id: expect.stringMatching(/^[0-9a-f-]{36}$/i), sequence: 1 },
      { id: expect.stringMatching(/^[0-9a-f-]{36}$/i), sequence: 2 },
    ]);
    expect(prepares[0].id).not.toBe(prepares[1].id);
    expect(confirmations).toEqual([prepares[0], prepares[0], prepares[1]]);
  });

  it('fails closed for an absent model or a 1001-code-point astral directive without replacing the original array', async () => {
    const createOpenCodePlugin = await loadPlugin();
    const tooLong = '😀'.repeat(1001);
    const hooks = await createOpenCodePlugin({
      dispatch: async () => response('recovery_context', openCode.recovery.mappingId, tooLong),
    })({ client: { app: { log: async () => undefined } } });
    const output = { system: ['base'] };
    const identity = output.system;

    await hooks['experimental.chat.system.transform'](modelInput('root'), output);
    expect(output.system).toBe(identity);
    expect(output.system).toEqual(['base']);
  });

  it('accepts one and 1000 astral code points but rejects 1001 without confirmation', async () => {
    const createOpenCodePlugin = await loadPlugin();
    const confirmed: string[] = [];
    let directive = '😀';
    const hooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        const operation = (request as Record<string, unknown>).operation;
        if (operation === 'prepare_delivery') {
          return response('recovery_context', openCode.recovery.mappingId, directive);
        }
        confirmed.push((request as Record<string, unknown>).deliveryAttempt as string);
        return { protocolVersion: 1, operation: 'confirm_delivery', outcome: 'confirmed', retryable: false };
      },
    })({ client: { app: { log: async () => undefined } } });

    const one = { system: ['base'] };
    await hooks['experimental.chat.system.transform'](modelInput('one'), one);
    expect(one.system.join('\n')).toContain('😀');

    directive = '😀'.repeat(1000);
    const atBound = { system: ['base'] };
    await hooks['experimental.chat.system.transform'](modelInput('bound'), atBound);
    expect(atBound.system.join('\n')).toContain(directive);

    directive = '😀'.repeat(1001);
    const overBound = { system: ['base'] };
    const identity = overBound.system;
    await hooks['experimental.chat.system.transform'](modelInput('over'), overBound);
    expect(overBound.system).toBe(identity);
    expect(overBound.system).toEqual(['base']);
    expect(confirmed).toHaveLength(2);
  });

  it('globally deduplicates output arrays, rolls back on log failure, and retries confirmation with the same token', async () => {
    const createOpenCodePlugin = await loadPlugin();
    const duplicateHooks = await createOpenCodePlugin({
      dispatch: async (request) => (request as Record<string, unknown>).operation === 'prepare_delivery'
        ? response('recovery_context', openCode.recovery.mappingId, 'Recovered context')
        : { protocolVersion: 1, operation: 'confirm_delivery', outcome: 'confirmed', retryable: false },
    })({ client: { app: { log: async () => undefined } } });
    const system = [memoryProtocol, 'Recovered context', 'Tail'];
    await duplicateHooks['experimental.chat.system.transform'](modelInput(), { system });
    expect(system).toEqual([memoryProtocol, 'Recovered context', 'Tail']);

    const rollbackHooks = await createOpenCodePlugin({
      dispatch: async () => response('recovery_context', openCode.recovery.mappingId, 'Recovered context'),
    })({ client: { app: { log: async (entry: unknown) => {
      if ((entry as { body?: { message?: string } }).body?.message === 'emitted_via_verified_channel') {
        throw new Error('log failure');
      }
    } } } });
    const rollback = { system: ['base'] };
    await rollbackHooks['experimental.chat.system.transform'](modelInput(), rollback);
    expect(rollback.system).toEqual(['base']);

    const sequence: string[] = [];
    const attempts: string[] = [];
    let confirmations = 0;
    const retryHooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        const operation = (request as Record<string, unknown>).operation as string;
        sequence.push(operation);
        if (operation === 'prepare_delivery') {
          return response('recovery_context', openCode.recovery.mappingId, 'Recovered context');
        }
        attempts.push((request as Record<string, unknown>).deliveryAttempt as string);
        confirmations += 1;
        return confirmations === 1
          ? { protocolVersion: 1, operation: 'confirm_delivery', outcome: 'failed', retryable: true }
          : { protocolVersion: 1, operation: 'confirm_delivery', outcome: 'confirmed', retryable: false };
      },
    })({ client: { app: { log: async () => { sequence.push('log'); } } } });
    await retryHooks['experimental.chat.system.transform'](modelInput(), { system: ['base'] });
    expect(sequence.slice(-4)).toEqual(['prepare_delivery', 'log', 'confirm_delivery', 'confirm_delivery']);
    expect(new Set(attempts)).toEqual(new Set([attempts[0]]));
  });
});
