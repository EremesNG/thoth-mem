# thoth-mem

SQLite-first persistent memory for OpenCode, Codex, and Claude Code.

The product has one local SQLite/FTS5 source of truth, immutable evidence, promoted temporal memories, and exactly six MCP tools: `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`. OpenCode additionally exposes one read-only native `thoth_mem_root_identity` tool for active-session metadata; it is not an MCP memory operation. Codex and Claude obtain the same root identity from verified native lifecycle context. It requires no embedding model, vector extension, graph engine, LLM, network service, HTTP server, or dashboard.

## Use

```sh
pnpm install --frozen-lockfile
pnpm run build
node dist/index.js mcp --data-dir ./memory-data
```

Recall is progressive: `mem_recall mode=compact`, then `mode=context`, then `mem_get` only when full content is needed. `mem_context` is a separate bounded project-recovery briefing.

## Public plugin installation

OpenCode loads the npm package itself as a native plugin. Setup writes one exact `thoth-mem@<executing-version>` entry and synchronizes the packaged memory Skill into OpenCode's global Skill directory:

```sh
npx --yes thoth-mem@0.4.13 setup opencode --plan --json
npx --yes thoth-mem@0.4.13 setup opencode
```

Codex users can add the repository marketplace and install the public plugin:

```sh
codex plugin marketplace add EremesNG/thoth-mem
codex plugin add thoth-mem@thoth-mem
```

Claude Code users can use the corresponding repository marketplace:

```sh
claude plugin marketplace add EremesNG/thoth-mem
claude plugin install thoth-mem@thoth-mem
```

Both public plugins load the exact published `thoth-mem` npm version declared by the repository distribution. They include native hooks, one six-tool MCP registration, and the shared memory Skill.

The same operations are available through the package CLI. Codex `0.147.x` is the supported unforced manager contract; another Codex version fails closed unless `--force-version` verifies the complete safe manager surface first. Claude setup can verify marketplace, plugin, hooks, MCP, Skill, and runtime structure without claiming paid-model use.

```sh
npx --yes thoth-mem@0.4.13 setup codex --plan --json
npx --yes thoth-mem@0.4.13 setup codex
npx --yes thoth-mem@0.4.13 setup claude --plan --json
npx --yes thoth-mem@0.4.13 setup claude
```

Setup is global/user-native only. Project scope, copied plugin bundles, direct manager-cache edits, legacy fallback, and fragment migration are intentionally unsupported.

## Local OpenCode development

Build the checkout, then select local provenance explicitly. There is no fallback from `file://` to npm and the repository marketplaces remain unchanged:

```sh
pnpm run build
node dist/index.js setup opencode --plan --json \
  --local-package-root /absolute/path/to/thoth-mem \
  --data-dir /absolute/path/to/shared-memory
node dist/index.js setup opencode \
  --local-package-root /absolute/path/to/thoth-mem \
  --data-dir /absolute/path/to/shared-memory
```

The local entry is the canonical absolute URL for `dist/opencode.js`. OpenCode loads the thin native adapter inside Bun; SQLite-backed lifecycle calls cross bounded JSON stdio to literal `node` and the package-relative `dist/index.js lifecycle` entry, while MCP starts through the same package-relative Node entry. The adapter preserves user `skills.paths`, keeps changing recovered memory in one tagged trailing prompt region, and degrades without rejecting the host prompt if the Node lifecycle process is unavailable. Setup owns only the exact thoth-mem plugin entries, global `skills/thoth-mem` tree, provider config, and its bounded receipts.

Local Codex or Claude development uses the same explicit checkout provenance. The native manager still owns plugin installation; thoth-mem records the verified built `dist/index.js` entry outside the manager cache so the bundle runner uses the checkout instead of the published npm package:

```sh
node dist/index.js setup codex --local-package-root /absolute/path/to/thoth-mem --data-dir /absolute/path/to/shared-memory
node dist/index.js setup claude --local-package-root /absolute/path/to/thoth-mem --data-dir /absolute/path/to/shared-memory
```

## Shared runtime data

All hosts resolve one data directory in this order: explicit command value, `THOTH_MEM_DATA_DIR`, strict provider config, then `~/.thoth-mem`. The provider file is `${XDG_CONFIG_HOME:-~/.config}/thoth-mem/config.json`; `setup --data-dir` atomically merges only `dataDir` and preserves other valid provider fields. Explicit local Codex/Claude setup additionally records an absolute, package-identity-checked `runtimeEntry`; public manager setup removes that local override. Malformed, unreadable, schema-invalid, missing-runtime, or non-file configuration fails closed. The runtime database is always `memory.sqlite` inside the selected data directory.

Changed setup requests a host restart. A verified repeated setup changes no files or manager state and requests no restart. `--plan` performs no writes or mutating manager commands.

## Legacy import

The current runtime never opens a legacy database during normal operation. Import is a one-way CLI operation into a distinct clean target; the source is opened read-only and verified unchanged.

```sh
node dist/index.js import-legacy --source ./legacy.sqlite --target ./memory.sqlite --report ./import-report.json
```

The runtime also does not guess, rename, copy, or dual-read a database created under the previous generation-suffixed default filename. To adopt an existing local ledger, first close every host process, create a recoverable backup, then explicitly copy or move the exact selected old database to `memory.sqlite` in the configured data directory before restarting. Repository setup and tests never perform this stateful operation in a real user home.

## Verification and benchmarks

```sh
pnpm test
pnpm run integration:verify
pnpm run integration:smoke
pnpm run benchmark:fixture
pnpm run prepublishOnly
```

The committed fixture is an offline contract check, not evidence that optional retrieval lanes should be promoted. External LongMemEval-S, LoCoMo, AMB, and SDEBench lanes remain explicitly unavailable until separately prepared equal-budget runs produce complete reports.
