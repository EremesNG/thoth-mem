import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import * as esbuild from 'esbuild';

const outputDirectory = resolve('dist');
rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });
const shared = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  packages: 'external',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
};

await esbuild.build({ ...shared, entryPoints: [resolve('src/index.ts')], outfile: resolve(outputDirectory, 'index.js') });
await esbuild.build({ ...shared, entryPoints: [resolve('src/integration/opencode/index.ts')], outfile: resolve(outputDirectory, 'opencode.js') });
await esbuild.build({ ...shared, entryPoints: [resolve('src/integration/pi/index.ts')], outfile: resolve(outputDirectory, 'pi.js') });
