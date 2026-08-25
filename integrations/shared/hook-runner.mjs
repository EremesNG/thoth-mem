import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const result = spawnSync(process.execPath, [resolve(packageRoot, 'dist', 'index.js'), 'lifecycle-v2'], { input: readFileSync(0, 'utf8'), encoding: 'utf8', windowsHide: true });
process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? ''); process.exitCode = result.status ?? 1;
