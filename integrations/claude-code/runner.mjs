import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const receipt = JSON.parse(readFileSync(join(directory, '.thoth-mem-managed.json'), 'utf8'));
const dataDirectory = process.env.THOTH_MEM_DATA_DIR ?? process.env.THOTH_MEM_CLAUDE_DATA_DIR ?? process.env.PLUGIN_DATA;
const environment = dataDirectory ? { ...process.env, THOTH_MEM_DATA_DIR: dataDirectory } : process.env;

if (process.argv[2] === '--mcp') {
  const result = spawnSync(process.execPath, [receipt.runtimeEntry, 'mcp', '--no-http'], {
    stdio: 'inherit',
    env: environment,
    windowsHide: true,
  });
  process.exitCode = result.status ?? 1;
} else {
  const result = spawnSync(process.execPath, [receipt.runtimeEntry, 'lifecycle', '--harness', 'claude'], {
    input: readFileSync(0, 'utf8'),
    encoding: 'utf8',
    env: environment,
    windowsHide: true,
  });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  process.exitCode = result.status ?? 1;
}
