import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const receipt = JSON.parse(readFileSync(join(directory, '.thoth-mem-managed-v2.json'), 'utf8'));
const dataDirectory = process.env.THOTH_MEM_DATA_DIR ?? process.env.THOTH_MEM_CODEX_DATA_DIR ?? process.env.PLUGIN_DATA;
const runtimeEnvironment = dataDirectory ? { ...process.env, THOTH_MEM_DATA_DIR: dataDirectory } : process.env;

if (process.argv[2] === '--mcp') {
  const child = spawnSync(process.execPath, [receipt.runtimeEntry, 'mcp', '--no-http'], { stdio: 'inherit', env: runtimeEnvironment, windowsHide: true });
  process.exitCode = child.status ?? 1;
} else {
  const input = readFileSync(0, 'utf8');
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.stderr.write('Codex lifecycle input must be valid JSON.');
    process.exitCode = 1;
  }

  if (payload) {
    const child = spawnSync(process.execPath, [receipt.runtimeEntry, 'lifecycle-v2', '--harness', 'codex'], { input, encoding: 'utf8', env: runtimeEnvironment, windowsHide: true });
    if (child.status !== 0) {
      process.stderr.write((child.stderr || 'Codex lifecycle execution failed.').slice(0, 600));
      process.exitCode = child.status ?? 1;
    } else {
      try {
        const result = JSON.parse(child.stdout);
        if (result.schema !== 'thoth-mem.lifecycle.v2' || !result.data) throw new Error('unexpected lifecycle result');
        const items = result.data.recovery?.items;
        const additionalContext = Array.isArray(items) && items.length > 0
          ? ['## thoth-mem recovered context', ...items.map((item) => `- [${item.kind}] ${item.title}: ${item.content ?? item.snippet}`)].join('\n')
          : undefined;
        const output = payload.hook_event_name === 'SessionStart' && additionalContext
          ? { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }
          : {};
        process.stdout.write(JSON.stringify(output));
      } catch (error) {
        process.stderr.write(`Codex lifecycle result was invalid: ${error instanceof Error ? error.message : String(error)}`.slice(0, 600));
        process.exitCode = 1;
      }
    }
  }
}
