# Development guide

This guide keeps repository work out of the product-focused README. It covers cloning, local builds, host wiring, verification, and benchmark reproduction for contributors working from a checkout.

## Requirements

- Node.js <code>&gt;=22.12.0</code>
- pnpm <code>11.20.0</code>, pinned by <code>package.json#packageManager</code>
- Git
- Bun only when exercising the native OpenCode runtime path

## Clone and build

~~~sh
git clone https://github.com/EremesNG/thoth-mem.git
cd thoth-mem
pnpm install --frozen-lockfile
pnpm run build
~~~

The build runs strict TypeScript checking and produces the runtime distribution through <code>scripts/build.mjs</code>. Never edit <code>dist/</code> directly.

Start a standalone MCP server against a disposable local data directory:

~~~sh
node dist/index.js mcp --data-dir ./memory-data
~~~

## Repository map

| Path | Responsibility |
| --- | --- |
| <code>src/memory-core/</code> | SQLite ledger, FTS5 retrieval, identities, projections, and shared <code>MemoryService</code>. |
| <code>src/tools/</code> | Exact six-tool MCP surface. |
| <code>src/integration/</code> | Host-neutral lifecycle mapping. |
| <code>src/setup/</code> | Transactional OpenCode, Codex, and Claude Code setup. |
| <code>integrations/</code> | Canonical native plugin bundles. |
| <code>scripts/</code> | Build, package verification, distribution sync, and marketplace publication. |
| <code>benchmarks/</code> | Offline fixtures, immutable external reports, schemas, and validators. |
| <code>tests/</code> | Unit, integration, setup, packaging, tool, importer, and benchmark suites. |
| <code>docs/agent/</code> | Task-routed repository guidance for coding agents. |

## Local host wiring

### OpenCode checkout

Build the checkout and select local provenance explicitly:

~~~sh
pnpm run build
node dist/index.js setup opencode --plan --json \
  --local-package-root /absolute/path/to/thoth-mem \
  --data-dir /absolute/path/to/shared-memory
node dist/index.js setup opencode \
  --local-package-root /absolute/path/to/thoth-mem \
  --data-dir /absolute/path/to/shared-memory
~~~

There is no fallback from <code>file://</code> to npm. The repository marketplaces remain unchanged. OpenCode loads the thin native adapter inside Bun; SQLite-backed lifecycle calls cross bounded JSON stdio to literal <code>node</code> and the package-relative <code>dist/index.js lifecycle</code> entry.

### Codex personal marketplace

Keep the personal marketplace entry pointed at <code>./plugins/thoth-mem</code>, then synchronize the payload from this checkout:

~~~sh
pnpm run setup:codex:local
~~~

The command builds the checkout, replaces <code>~/plugins/thoth-mem</code>, assigns copied manifests a cache-busting local version, and points MCP and lifecycle execution to this checkout. It does not edit the marketplace catalog, install or uninstall a plugin, or change the shared memory database. Restart Codex after synchronizing a new build.

### Explicit Codex or Claude checkout

~~~sh
node dist/index.js setup codex --local-package-root /absolute/path/to/thoth-mem --data-dir /absolute/path/to/shared-memory
node dist/index.js setup claude --local-package-root /absolute/path/to/thoth-mem --data-dir /absolute/path/to/shared-memory
~~~

## Verification

Run the nearest terminating test first, then the repository gates that match the changed surface.

~~~sh
pnpm run build
pnpm test
pnpm run integration:verify
pnpm run integration:smoke
pnpm run benchmark:fixture
pnpm run prepublishOnly
git diff --check
~~~

| Check | Contract |
| --- | --- |
| <code>pnpm run build</code> | Strict TypeScript and distribution build. |
| <code>pnpm test</code> | Full unit and integration test configuration. |
| <code>integration:verify</code> | Canonical local and public inventories for all three hosts. |
| <code>integration:smoke</code> | Real packed tarball, disposable install, cold CLI start, and packaged lifecycle runners. |
| <code>benchmark:fixture</code> | Offline committed general fixture with zero model or network calls. |
| <code>prepublishOnly</code> | Inventory, build, and full test publication gate. |

There is no root lint script. Do not invent or report one.

The fixture benchmark rewrites <code>benchmarks/results/fixture-report.json</code> with environment-sensitive values. Review and restore that generated diff unless refreshing the committed evidence is explicitly part of the task.

## LongMemEval-S reproduction

Preparation is the only networked step. It writes only below the gitignored <code>benchmarks/.cache/longmemeval/</code> boundary and verifies the pinned dataset revision and SHA-256 before evaluation.

~~~sh
pnpm run benchmark:prepare:longmemeval
pnpm run benchmark:longmemeval
pnpm run benchmark:compare:longmemeval
~~~

Evaluation is offline and uses disposable SQLite databases. Report paths are create-only; do not overwrite immutable evidence. The protocol, metric definitions, and headline reports are linked from the README.

Additional offline lanes:

~~~sh
pnpm run benchmark:observation
pnpm run benchmark:import-ranking -- --output /fresh/report/path.json
~~~

The import-ranking lane requires a prior build and an explicit nonexistent output path.

## Change discipline

- Read every touched file before editing it.
- Preserve unrelated and concurrent working-tree changes.
- Keep source-relative ESM imports explicit with <code>.js</code> extensions.
- Do not suppress TypeScript errors with unsafe directives or <code>any</code>.
- Never edit generated output directly.
- Treat setup, migration, release, publication, and real-host smoke as stateful operations requiring explicit scope.
- Use the narrowest focused check first and claim only checks that actually ran.

Start with [the agent context index](agent/index.md) for task-specific engineering, persistence, lifecycle, and test guidance.
