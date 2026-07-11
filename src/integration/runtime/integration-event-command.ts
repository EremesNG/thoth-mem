import type {Readable} from 'node:stream';

import {getConfig, resolveDataDir} from '../../config.js';
import {MemoryIntegrationCore, resolveLifecycleIdentity} from '../core/lifecycle.js';
import type {MemoryPort} from '../core/memory-port.js';
import {McpMemoryPort} from '../core/mcp-memory-port.js';
import {
    FileLifecycleStateStore,
    type LifecycleStateStoreOptions,
} from '../core/state-store.js';
import type {
    AdapterCapabilities,
    LifecycleResult,
    NormalizedEvent,
} from '../core/types.js';
import {
    executeHookCommand,
    HOOK_PROTOCOL_VERSION,
    type HookCommandResponse,
    type HookExecutionResult,
} from './hook-command.js';

const MAX_INTEGRATION_EVENT_INPUT_BYTES = 1_048_576;

interface IntegrationCore {
    handle(event: NormalizedEvent): Promise<Pick<
        LifecycleResult,
        'outcome' | 'retryable' | 'harness' | 'intent'
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

async function executeProductionEvent(
    event: NormalizedEvent,
    capabilities: AdapterCapabilities,
    options: ExecuteIntegrationEventOptions,
): Promise<HookExecutionResult> {
    const ports = dependencies(options.dependencies);
    const identity = resolveLifecycleIdentity(event);
    const dataDir = ports.resolveDataDir(options.dataDir);
    const memoryPort = await ports.createMemoryPort(dataDir);

    try {
        const stateStore = ports.createStateStore({
            dataDir,
            harness: event.harness,
            projectId: identity.projectId,
            rootSessionId: identity.rootSessionId,
            capabilities,
        });
        const core = ports.createCore({
            capabilities,
            memoryPort,
            stateStore,
            rootIdentity: event.identity,
        });
        const result = await core.handle(event);
        return {
            outcome: result.outcome,
            retryable: result.retryable,
            harness: result.harness,
            intent: result.intent,
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
        (event, capabilities) => executeProductionEvent(event, capabilities, options),
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
