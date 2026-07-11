import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServer, type ServerOptions } from '../../server.js';
import {
  isMemoryToolName,
  type MemoryCallResult,
  type MemoryPort,
  type MemoryToolName,
} from './memory-port.js';

function extractReference(text: string): MemoryCallResult['reference'] {
  const promptMatch = text.match(/Prompt saved \(prompt ID: (\d+)\)/);
  if (promptMatch) {
    return { kind: 'prompt', id: Number(promptMatch[1]) };
  }

  const observationMatch = text.match(/(?:Observation saved \(ID:|observation ID:) (\d+)\)?/i);
  if (observationMatch) {
    return { kind: 'observation', id: Number(observationMatch[1]) };
  }

  return undefined;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class McpMemoryPort implements MemoryPort {
  private closed = false;

  private constructor(
    private readonly client: Client,
    private readonly closeResources: () => Promise<void>,
  ) {}

  static async create(options: ServerOptions): Promise<McpMemoryPort> {
    const { server, store } = createServer(options);
    const client = new Client({ name: 'thoth-mem-integration', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
    } catch (error) {
      await clientTransport.close().catch(() => undefined);
      await serverTransport.close().catch(() => undefined);
      store.close();
      throw error;
    }

    return new McpMemoryPort(client, async () => {
      try {
        await client.close();
      } finally {
        try {
          await server.close();
        } finally {
          store.close();
        }
      }
    });
  }

  async call(tool: MemoryToolName, input: Record<string, unknown>): Promise<MemoryCallResult> {
    if (!isMemoryToolName(tool)) {
      throw new Error(`Memory tool is not allowlisted: ${String(tool)}`);
    }

    try {
      const result = await this.client.callTool({ name: tool, arguments: input });
      if (!('content' in result) || !Array.isArray(result.content)) {
        return {
          confirmed: false,
          isError: true,
          text: 'MCP tool returned a task result instead of a completed response.',
        };
      }

      const text = result.content
        .map((item) => (
          typeof item === 'object'
          && item !== null
          && 'type' in item
          && item.type === 'text'
          && 'text' in item
          && typeof item.text === 'string'
            ? item.text
            : null
        ))
        .filter((item): item is string => item !== null)
        .join('\n');
      const isError = result.isError === true;
      const reference = isError ? undefined : extractReference(text);

      return {
        confirmed: !isError,
        isError,
        text,
        ...(reference ? { reference } : {}),
      };
    } catch (error) {
      return {
        confirmed: false,
        isError: true,
        text: `MCP call failed: ${errorText(error)}`,
      };
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    await this.closeResources();
  }
}
