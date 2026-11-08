import type { Plugin } from '@opencode/plugin';
import type { Info, ToolContext } from '@opencode/plugin/promise/tool';

import { TOOL_OUTPUT_MAX_CHARS } from '../../tools/bounded-json.js';
import { MEMORY_TOOL_CATALOG, type MemoryToolName } from '../../tools/index.js';
import type { McpChildClient } from '../mcp-child-client.js';
import { resolveLocalProjectIdentity } from '../project-identity.js';
import { buildIdentityResult } from './helpers.js';

function boundedText(text: string, tool: MemoryToolName): string {
  return text.length <= TOOL_OUTPUT_MAX_CHARS ? text : JSON.stringify({
    schema: 'thoth-mem.opencode.output_truncated', tool,
    original_chars: text.length, cap_chars: TOOL_OUTPUT_MAX_CHARS,
    guidance: 'Narrow the request with a smaller budget_chars or a selective mem_get.',
  });
}

/** Allocate once per setup, not when the host evaluates a session's transform. */
export function createNativeTools(client: McpChildClient, ctx: Plugin.Context): Info[] {
  return [
    ...MEMORY_TOOL_CATALOG.filter((tool) => tool.name !== 'mem_session').map((tool): Info => ({
      name: tool.name,
      options: { codemode: false },
      description: tool.description,
      input: tool.inputSchema,
      async execute(input, context) {
        try {
          const result = await client.callTool(tool.name, input, context.signal);
          const text = Array.isArray(result.content)
            ? result.content.flatMap((item: unknown) => item && typeof item === 'object'
              && 'type' in item && item.type === 'text' && 'text' in item && typeof item.text === 'string'
              ? [item.text] : []).join('\n')
            : JSON.stringify(result.structuredContent ?? {});
          return { content: [{ type: 'text', text: boundedText(text, tool.name) }] };
        } catch {
          // Preserve MCP tool-error text above, but never expose rejected transport internals.
          return { content: [{ type: 'text', text: JSON.stringify({
            schema: 'thoth-mem.opencode.error',
            error: { code: 'tool_request_failed', message: 'Memory tool failed; retry the request.', retryable: true },
          }) }] };
        }
      },
    })),
    {
      name: 'thoth_mem_root_identity',
      options: { codemode: false },
      description: 'Read verified root, caller, and project identity; delegated callers have no lifecycle authorization.',
      input: { type: 'object', properties: {} },
      async execute(_input, context: ToolContext) {
        const text = await buildIdentityResult(
          context.sessionID,
          (sessionID) => ctx.session.get({ sessionID: sessionID as ToolContext['sessionID'] }),
          () => resolveLocalProjectIdentity(ctx.location.directory || ctx.location.project.directory),
        );
        return { content: [{ type: 'text', text }] };
      },
    },
  ];
}
