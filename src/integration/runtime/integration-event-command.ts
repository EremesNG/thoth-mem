import type {Readable} from 'node:stream';

import {getConfig, resolveDataDir} from '../../config.js';
import {isPrivatePrepareDeliveryAuthorization} from './capability-evidence.js';
import {MemoryIntegrationCore, resolveLifecycleIdentity} from '../core/lifecycle.js';
import type {MemoryPort} from '../core/memory-port.js';
import {McpMemoryPort} from '../core/mcp-memory-port.js';
import {
    FileLifecycleStateStore,
    type LifecycleStateStoreOptions,
} from '../core/state-store.js';
import type {
    AdapterCapabilities,
    HostOutputReadiness,
    LifecycleResult,
    NormalizedEvent,
} from '../core/types.js';
import {
    executeHookCommand,
    HOOK_PROTOCOL_VERSION,
    type HookCommandResponse,
    type HookExecutionContext,
    type HookExecutionResult,
} from './hook-command.js';

const MAX_INTEGRATION_EVENT_INPUT_BYTES = 1_048_576;

interface IntegrationCore {
    handle(event: NormalizedEvent): Promise<Pick<
        LifecycleResult,
        'outcome' | 'retryable' | 'harness' | 'intent' | 'hostOutputDirective' | 'deliveryAttempt' | 'deliveryState'
    >>;

    prepareDelivery?(
        event: NormalizedEvent,
        binding: HookExecutionContext['mapping'],
    ): Promise<Pick<
        LifecycleResult,
        'outcome' | 'retryable' | 'harness' | 'intent' | 'hostOutputDirective' | 'deliveryAttempt' | 'deliveryState'
    >>;
}

interface IntegrationEventDependencies {
    resolveDataDir(requested: string | undefined): string;

    createMemoryPort(dataDir: string): Promise<MemoryPort>;

    createStateStore(options: LifecycleStateStoreOptions): FileLifecycleStateStore;

    createCore(options: {
        capabilities: AdapterCapabilities;
        memoryPort: MemoryPort;
        stateStore: FileLifecycleStateStore;
        rootIdentity: NormalizedEvent['identity'];
        hostOutput?: HostOutputReadiness;
    }): IntegrationCore;
}

export interface ExecuteIntegrationEventOptions {
    dataDir?: string;
    dependencies?: Partial<IntegrationEventDependencies>;
}

export interface IntegrationEventCommandResult {
    exitCode: number;
    response: HookCommandResponse;
}

export class IntegrationEventInputError extends Error {
    readonly code = 'INTEGRATION_EVENT_INPUT_TOO_LARGE';

    constructor() {
        super('Integration event stdin exceeded the bounded input limit');
        this.name = 'IntegrationEventInputError';
    }
}

const defaultDependencies: IntegrationEventDependencies = {
    resolveDataDir(requested) {
        const config = getConfig({...(requested ? {dataDir: requested} : {})});
        resolveDataDir(config);
        return config.dataDir;
    },
    createMemoryPort(dataDir) {
        return McpMemoryPort.create({dataDir});
    },
    createStateStore(options) {
        return new FileLifecycleStateStore(options);
    },
    createCore(options) {
        return new MemoryIntegrationCore(options);
    },
};

function commandFailureResponse(): HookCommandResponse {
    return {
        protocolVersion: HOOK_PROTOCOL_VERSION,
        outcome: 'degraded',
        retryable: true,
        diagnostic: 'Integration event input could not be read safely; no memory success was confirmed.',
    };
}

function dependencies(
    overrides: Partial<IntegrationEventDependencies> | undefined,
): IntegrationEventDependencies {
    return {...defaultDependencies, ...overrides};
}

function privatePrepareHostOutput(
    event: NormalizedEvent,
    execution: HookExecutionContext,
): HostOutputReadiness | undefined {
    if (execution.operation !== 'prepare_delivery'
      || !isPrivatePrepareDeliveryAuthorization(execution.prepareDeliveryAuthorization)) {
      return undefined;
    }
    const mapping = {
      mappingId: execution.mapping.deliveryMappingId,
      verifiedMappingId: execution.mapping.deliveryMappingId,
      ready: true,
    };
    if (event.intent === 'recall_guidance') return { recovery: mapping };
    if (event.intent === 'compact_session') return { postCompaction: mapping };
    return undefined;
}


    function nativeBehaviorHostOutput(
        event: NormalizedEvent,
        execution: HookExecutionContext,
    ): HostOutputReadiness | undefined {
        if (!execution.behaviorEligible || execution.mapping.deliveryChannel !== 'runner-stdout') {
            return undefined;
        }
        const mapping = {
            mappingId: execution.mapping.deliveryMappingId,
            verifiedMappingId: execution.mapping.deliveryMappingId,
            ready: true,
        };
        if (event.intent === 'enroll_session' || event.intent === 'recall_guidance') return {recovery: mapping};
        if (event.intent === 'compact_session') return {postCompaction: mapping};
        return undefined;
    }

    async function executeProductionEvent(
    event: NormalizedEvent,
    capabilities: AdapterCapabilities,
    execution: HookExecutionContext,
    options: ExecuteIntegrationEventOptions,
): Promise<HookExecutionResult> {
    const ports = dependencies(options.dependencies);
    const identity = resolveLifecycleIdentity(event);
    const dataDir = ports.resolveDataDir(options.dataDir);
    const stateStore = ports.createStateStore({
        dataDir,
        harness: event.harness,
        projectId: identity.projectId,
        rootSessionId: identity.rootSessionId,
        capabilities,
    });
    if (execution.operation === 'confirm_delivery') {
        const directive = execution.hostOutputDirective;
        const deliveryAttempt = execution.deliveryAttempt;
        if (!directive || !deliveryAttempt || execution.mapping.deliveryChannel === 'none') {
            return {
                outcome: 'failed',
                retryable: false,
                harness: event.harness,
                intent: event.intent,
            };
        }
        const confirmation = await stateStore.confirmDeliveryAttempt({
            eventMappingId: execution.mapping.eventMappingId,
            deliveryChannel: execution.mapping.deliveryChannel,
            deliveryMappingId: execution.mapping.deliveryMappingId,
            purpose: directive.purpose,
            directiveText: directive.text,
            deliveryAttempt,
        });
        return {
            outcome: confirmation.outcome,
            retryable: confirmation.retryable,
            harness: event.harness,
            intent: event.intent,
            deliveryState: {
                activation: 'eligible',
                memoryConfirmation: 'confirmed',
                outputReadiness: 'ready',
                outputSupport: confirmation.outcome === 'confirmed' || confirmation.outcome === 'no_op'
                    ? 'confirmed'
                    : 'eligible',
                localEmission: 'emitted',
                modelConsumption: 'unproven',
            },
        };
    }

    const memoryPort = await ports.createMemoryPort(dataDir);
        try {
            const hostOutput = privatePrepareHostOutput(event, execution)
                ?? nativeBehaviorHostOutput(event, execution);
            const core = ports.createCore({
                capabilities,
                memoryPort,
                stateStore,
                rootIdentity: event.identity,
                ...(hostOutput ? {hostOutput} : {}),
            });
const result = execution.operation === 'prepare_delivery' && core.prepareDelivery
    ? await core.prepareDelivery(event, execution.mapping)
    : await core.handle(event);
return {
    outcome: result.outcome,
    retryable: result.retryable,
    harness: result.harness,
    intent: result.intent,
    ...(result.hostOutputDirective
        ? { hostOutputDirective: result.hostOutputDirective }
        : {}),
    ...(result.deliveryState ? { deliveryState: result.deliveryState } : {}),
    ...(result.deliveryAttempt ? { deliveryAttempt: result.deliveryAttempt } : {}),
};

    } finally {
        await memoryPort.close();
    }
}

export async function executeIntegrationEvent(
    input: string,
    options: ExecuteIntegrationEventOptions = {},
): Promise<IntegrationEventCommandResult> {
    const response = await executeHookCommand(
        input,
        (event, capabilities, execution) => executeProductionEvent(event, capabilities, execution, options),
    );
    return {exitCode: 0, response};
}

export async function readIntegrationEventInput(
    stream: Readable,
    maximumBytes = MAX_INTEGRATION_EVENT_INPUT_BYTES,
): Promise<string> {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > maximumBytes) {
            throw new IntegrationEventInputError();
        }
        chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
}

export async function runIntegrationEventCommand(
    stream: Readable,
    options: ExecuteIntegrationEventOptions = {},
): Promise<IntegrationEventCommandResult> {
    try {
        return executeIntegrationEvent(await readIntegrationEventInput(stream), options);
    } catch {
        return {exitCode: 1, response: commandFailureResponse()};
    }
}
