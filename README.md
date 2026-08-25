# thoth-mem

SQLite-first persistent memory for OpenCode, Codex, and Claude Code.

The v2 product has one local SQLite/FTS5 source of truth, immutable evidence, promoted temporal memories, and exactly six MCP tools: `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`. It requires no embedding model, vector extension, graph engine, LLM, network service, HTTP server, or dashboard.

## Use

```sh
pnpm install --frozen-lockfile
pnpm run build
node dist/index.js mcp --data-dir ./memory-data
```

Recall is progressive: `mem_recall mode=compact`, then `mode=context`, then `mem_get` only when full content is needed. `mem_context` is a separate bounded project-recovery briefing.

## Public plugin installation

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

## Local development and canary installation

`setup-v2` is only for an explicit local/private plugin target. It writes a managed receipt that points to the current local build; it does not install or modify the repository marketplace distribution:

```sh
node dist/index.js setup-v2 --harness codex --target /absolute/plugin/root
```

Supported harness values are `opencode`, `codex`, and `claude-code`. Each local bundle contains hooks, an MCP descriptor, a portable runner, a Skill, one host reference, and a managed receipt. Use a distinct marketplace/plugin identity for canary certification so public and local hooks are never enabled simultaneously by accident.

## Legacy import

V2 never opens a legacy database during normal runtime. Import is a one-way CLI operation into a distinct clean target; the source is opened read-only and verified unchanged.

```sh
node dist/index.js import-v2 --source ./legacy.sqlite --target ./memory-v2.sqlite --report ./import-report.json
```

## Verification and benchmarks

```sh
pnpm test
pnpm run integration:verify
pnpm run integration:smoke
pnpm run benchmark:fixture
pnpm run prepublishOnly
```

The committed fixture is an offline contract check, not evidence that optional retrieval lanes should be promoted. External LongMemEval-S, LoCoMo, AMB, and SDEBench lanes remain explicitly unavailable until separately prepared equal-budget runs produce complete reports.
