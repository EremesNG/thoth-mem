import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import * as esbuild from 'esbuild';

const outputDirectory = resolve('dist');
rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });
await esbuild.build({ entryPoints: [resolve('src/index.ts')], bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: resolve(outputDirectory, 'index.js'), sourcemap: true, external: ['better-sqlite3'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } });
