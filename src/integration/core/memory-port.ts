import {
  MEMORY_TOOL_NAMES,
  type MemoryToolName,
} from './types.js';

export { MEMORY_TOOL_NAMES };
export type { MemoryToolName };

export interface MemoryCallResult {
  confirmed: boolean;
  isError: boolean;
  text: string;
  reference?: { kind: 'prompt' | 'observation'; id: number };
}

export interface MemoryPort {
  call(tool: MemoryToolName, input: Record<string, unknown>): Promise<MemoryCallResult>;
  close(): Promise<void>;
}

export function isMemoryToolName(tool: string): tool is MemoryToolName {
  return (MEMORY_TOOL_NAMES as readonly string[]).includes(tool);
}

export async function callMemoryTool(
  port: MemoryPort,
  tool: string,
  input: Record<string, unknown>,
): Promise<MemoryCallResult> {
  if (!isMemoryToolName(tool)) {
    throw new Error(`Memory tool is not allowlisted: ${tool}`);
  }

  return port.call(tool, input);
}
