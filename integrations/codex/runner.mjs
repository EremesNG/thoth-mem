import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const publicRunner = resolve(directory, '..', '..', 'plugin', 'runners', 'public-runner.mjs');
const arguments_ = process.argv[2] === '--mcp' ? ['--mcp'] : ['--harness', 'codex'];
const child = spawnSync(process.execPath, [publicRunner, ...arguments_], {
  stdio: 'inherit',
  env: process.env,
  windowsHide: true,
});
process.exitCode = child.status ?? 1;
