import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";

const inputShape = {
  content: z.string().describe("The text output containing a '## Key Learnings:' section with numbered or bulleted items"),
  session_id: z.string().optional().describe("Session ID (default: manual-save-{project})"),
  project: z.string().optional().describe("Project name"),
  source: z.string().optional().describe("Source identifier (e.g. 'subagent-stop', 'session-end')"),
};

interface CapturePassiveInput {
  content: string;
  session_id?: string;
  project?: string;
  source?: string;
}

export function capturePassiveLearnings(
  store: Store,
  input: CapturePassiveInput
): { isError?: boolean; content: Array<{ type: 'text'; text: string }> } {
  const headerMatch = input.content.match(/^##\s+(Key Learnings|Aprendizajes Clave)\s*:?\s*$/im);

  if (!headerMatch || headerMatch.index === undefined) {
    return {
      isError: true,
      content: [{ type: 'text', text: "No '## Key Learnings:' or '## Aprendizajes Clave:' section found in content" }],
    };
  }

  const afterHeader = input.content.slice(headerMatch.index + headerMatch[0].length);
  const nextHeaderMatch = afterHeader.match(/^##\s+/m);
  const sectionText = nextHeaderMatch && nextHeaderMatch.index !== undefined
    ? afterHeader.slice(0, nextHeaderMatch.index)
    : afterHeader;

  const items = sectionText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.match(/^(?:-\s+|\*\s+|\d+\.\s+)(.+)$/)?.[1]?.trim())
    .filter((item): item is string => Boolean(item));

  let saved = 0;
  let duplicates = 0;

  for (const item of items) {
    const title = item.length > 50 ? `${item.slice(0, 50)}...` : item;
    const result = store.saveObservation({
      title,
      content: item,
      type: 'learning',
      session_id: input.session_id,
      project: input.project,
      scope: 'project',
    });

    if (result.action === 'created') {
      saved += 1;
    } else if (result.action === 'deduplicated') {
      duplicates += 1;
    }
  }

  return {
    content: [{ type: 'text', text: `Extracted ${items.length} learnings: ${saved} saved, ${duplicates} duplicates skipped` }],
  };
}

export function registerMemCapturePassive(server: McpServer, store: Store): void {
  server.tool(
    'mem_capture_passive',
    "Extract and save structured learnings from text output. Looks for '## Key Learnings:' or '## Aprendizajes Clave:' sections and saves each item as a separate observation. Duplicates are auto-detected and skipped.",
    inputShape,
    async (input) => capturePassiveLearnings(store, input)
  );
}
