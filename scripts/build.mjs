// @ts-check
/**
 * esbuild bundler for thoth-mem.
 *
 * Bundles src/index.ts -> dist/index.js as a single ESM file.
 * @huggingface/transformers (and its sub-packages) are bundled IN so
 * their internal `import "onnxruntime-common"` resolves from thoth-mem's
 * own node_modules context (where onnxruntime-common is a declared dep),
 * fixing the phantom-dep failure under pnpm global installs.
 *
 * Native / runtime-singleton packages are kept EXTERNAL:
 *  - onnxruntime-common  (MUST be external: shared Tensor class identity
 *                         between onnxruntime-node and bundled transformers)
 *  - onnxruntime-node    (native addon)
 *  - onnxruntime-web     (runtime-specific, not used in node path)
 *  - sharp               (native addon)
 *  - better-sqlite3      (native addon)
 *  - sqlite-vec          (native addon)
 */

import * as esbuild from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

import { verifyIntegrationPackage } from './verify-integration-package.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

async function bundleNodeRuntime() {
  await esbuild.build({
    entryPoints: [resolve(repoRoot, 'src', 'index.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    outfile: resolve(repoRoot, 'dist', 'index.js'),
    sourcemap: true,
    // Keep native addons and the onnxruntime-common singleton external.
    // All other deps (including @huggingface/transformers) are bundled.
    external: [
      'onnxruntime-common',
      'onnxruntime-node',
      'onnxruntime-web',
      'better-sqlite3',
      'sqlite-vec',
    ],
    // sharp is a native addon only used in transformers' image pipelines —
    // thoth-mem uses text-only pipelines (feature-extraction, text-generation).
    // Replace with a stub so the top-level import resolves without the native addon.
    alias: {
      'sharp': resolve(repoRoot, 'scripts', 'stubs', 'sharp-stub.mjs'),
      // The default UMD entry leaves relative require() calls unresolved in the ESM bundle.
      'jsonc-parser': resolve(repoRoot, 'node_modules', 'jsonc-parser', 'lib', 'esm', 'main.js'),
    },
    // Silence warnings about dynamic require() in CJS deps that esbuild shims.
    // The banner adds the CommonJS compatibility shims esbuild needs for any
    // bundled dep that still calls require() or reads __dirname/__filename.
    banner: {
      js: [
        "import { createRequire } from 'node:module';",
        "import { fileURLToPath as __esbuild_fileURLToPath } from 'node:url';",
        "import { dirname as __esbuild_dirname } from 'node:path';",
        "const require = createRequire(import.meta.url);",
        "const __filename = __esbuild_fileURLToPath(import.meta.url);",
        "const __dirname = __esbuild_dirname(__filename);",
      ].join('\n'),
    },
    logLevel: 'info',
  });
}

async function verifyNativeAssets() {
  await verifyIntegrationPackage({ rootDir: repoRoot });
}

export async function runBuild(options = {}) {
  const bundle = options.bundle ?? bundleNodeRuntime;
  const verify = options.verify ?? verifyNativeAssets;
  await bundle();
  await verify();
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPath === import.meta.url) {
  await runBuild();
}
