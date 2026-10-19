# Implementation Plan: SQLite-first persistent memory core v2

## Technical context

The current runtime concentrates persistence, migrations, vector loading, semantic indexing, FTS, KG/community state, maintenance, sync, and hybrid ranking in `src/store/index.ts`. `saveObservation` has roughly sixty callers and `hybridRetrieve` feeds MCP, HTTP, and eval surfaces. `src/tools/mem-recall.ts` describes and executes a four-lane vector/chunk/FTS/KG path, while `src/tools/mem-project.ts` exposes graph/community navigation. Native lifecycle code is already separated into `src/integration/core/`, `src/integration/adapters/`, and `src/integration/runtime/`, but packed source assets are incomplete and setup/package verification carries legacy ownership paths.

This change is a major reset, not an in-place refactor. A clean `src/memory-core/` module will be built behind a new service contract while the old runtime still exists only as a temporary branch-local reference. One cutover will switch MCP/CLI/plugin entry points to the new core; the same change then removes retired runtime, graph, HTTP, dashboard, semantic-index, compatibility, and legacy setup paths from compilation and packaging. There is no released dual-read/dual-write state.

Runtime constraints remain Node.js `>=22.12.0`, strict TypeScript/Node16 ESM, `better-sqlite3`, zod, pnpm `11.20.0`, and Vitest. Source imports keep explicit `.js` extensions. The default runtime makes no model, LLM, or network call.

### Implementation ownership

- **Artifacts and gates**: the root owns `openspec/changes/sqlite-first-memory-core/`, task state, requirement reconciliation, and archive coordination.
- **Product writer**: one deep implementation writer owns all mutable runtime, schema, tool, plugin, setup, packaging, benchmark-adapter, test, and routed-documentation surfaces for this change. The net gain is one correctness-critical reasoning chain across the clean schema, six public tools, three host adapters, and cutover; parallel product writers would create contract drift and shared-file conflicts.
- **Independent verification**: a fresh read-only Oracle owns each verification round. The product writer never judges its own completion.
- **Checks before dispatch**: the writer receives this spec/plan/tasks set, constitution 2.0.0, the four support contracts, the exact allowed production/test surfaces, the no-compatibility boundary, and the required focused/build/full/packed-artifact checks.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — FR-031 fixes the registry at the existing six workflow names and keeps setup, migration, projection administration, evaluation, and deferred graph behavior outside MCP.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — FR-001, FR-004–006, FR-011–017, and FR-024–030 make SQLite/FTS5 authoritative and independently useful while every optional lane is disposable, source-watermarked, asynchronous, and fail-open to lexical recall.
- **P3 — Harness-Agnostic Memory Contract**: PASS — `contracts/plugin-lifecycle-v2.md` maps three host adapters to one lifecycle intent set, `contracts/mcp-v2.md` defines one shared tool contract, and `contracts/importer-v2.md` preserves the old database without runtime shims.
- **P4 — Token-Efficient, Bounded Recall Outputs**: JUSTIFIED EXCEPTION — the compact→context→get funnel, deterministic snippet trimming, stable IDs, and payload metadata remain in FR-018 and FR-021–023, but the old sentence/chunk vector top-k and semantic-threshold implications are intentionally retired by FR-012–014 because P2 and the selected major reset prohibit them from being load-bearing.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — the spec enumerates breaking tool/storage/plugin behavior, forbids dual contracts, preserves the source DB, defines a one-way importer, and uses the prior package plus untouched database as rollback.

## Design

### Architecture and dependency direction

```text
OpenCode plugin ─┐
Codex plugin ────┼─> host adapter -> lifecycle intents ─┐
Claude plugin ───┘                                      │
                                                       v
MCP / CLI entrypoints -> six tool handlers -> MemoryService
                                             │
                         ┌───────────────────┼──────────────────┐
                         v                   v                  v
                  SQLite ledger       FTS5 retrieval    projection ports
                  (authority)         (core index)      (optional/off)
```

Dependencies point inward: plugins and tools depend on `MemoryService`; the service depends on ledger/retrieval ports; SQLite and optional projections implement those ports. Host payload types, MCP/Zod schemas, `better-sqlite3`, benchmark runners, and setup receipts do not enter the domain model.

### 1. Clean core module and schema

Create the public application boundary in `src/memory-core/service.ts` with types/ports in `src/memory-core/contracts.ts`. The service exposes evidence capture, memory promotion/supersession/outcome, compact recall, bounded context, full fetch, project briefing/lineage, and session lifecycle operations. It does not expose tables, vector providers, graph operations, or host payloads.

Implement the clean schema from `data-model.md` in:

- `src/memory-core/sqlite/schema.ts`
- `src/memory-core/sqlite/migrations.ts`
- `src/memory-core/sqlite/ledger.ts`
- `src/memory-core/sqlite/fts.ts`
- `src/memory-core/identity.ts`

Use a v2-only application/schema marker so the runtime fails clearly if pointed at an old database. Evidence content is immutable; memory corrections append a new row and close temporal validity on the superseded row in one transaction. FTS coverage is maintained in the same confirmed save transaction and can be rebuilt/verified from authoritative rows. Lifecycle receipts own event idempotency; the old 30-second byte-equality prompt heuristic is not carried forward.

### 2. Lexical-first progressive retrieval

Implement retrieval under `src/memory-core/retrieval/`:

- `query.ts`: input validation, exact ID/topic filters, safe FTS query construction;
- `lexical.ts`: FTS5 BM25 candidate retrieval and deterministic structured candidates;
- `ranking.ts`: explicit score components, current/history weighting, deterministic tie breaks;
- `snippets.ts`: surgical bounded matching-sentence/context extraction without an LLM;
- `context.ts`: required `mem_recall mode=compact`→`mem_recall mode=context`→`mem_get` budgets, separate `mem_context` recovery assembly, explicit `compression_ratio`, and project briefings;
- `projections.ts`: optional candidate interface, source-watermark/state checks, normalization, fusion, and truthful degradation metadata.

Default retrieval uses exact/structured/FTS5 only. Optional candidates cannot replace source IDs or authoritative content and participate only when ready and enabled by an admitted profile. Dense/graph/entity/reranker/HyDE implementations are not delivered in the first product; only the generic projection boundary and deletion/rebuild contract are tested.

### 3. Six-tool v2 cutover

Replace the existing handlers in `src/tools/mem-save.ts`, `mem-recall.ts`, `mem-context.ts`, `mem-get.ts`, `mem-project.ts`, and `mem-session.ts` so they depend only on `MemoryService` and the schemas in `contracts/mcp-v2.md`. Update `src/tools/index.ts`, `src/server.ts`, `src/index.ts`, and the relevant `src/cli.ts` commands to construct one core instance.

`mem_recall` MUST implement both P4 modes: compact returns surgical evidence with stable IDs, while context returns bounded surrounding evidence and an explicit `compression_ratio` against full source content. `mem_context` remains a separate project/session/current-work recovery assembler and does not replace query-specific `mem_recall mode=context`. `mem_project` keeps list/briefing/topic/history functions but removes graph/community/health actions whose meaning depended on deferred systems. Old v1 requests fail under bounded v2 validation; no alias, schema negotiation, or hidden old `Store` fallback is added. Structured JSON is authoritative and bounded text is a rendering of it.

### 4. Native plugins and shared lifecycle

Retain the useful host-neutral boundaries in `src/integration/core/`, but rewrite their memory port against `MemoryService` and the lifecycle intents in `contracts/plugin-lifecycle-v2.md`. Keep host payload parsing/capability evidence in `src/integration/adapters/{opencode,codex,claude-code}.ts` and command output in `src/integration/runtime/`.

The canonical source inventory becomes:

- `integrations/shared/hook-runner.mjs` and shared Skill content/reference templates;
- `integrations/opencode/` with native plugin/event handler, MCP setup descriptor, Skill/reference, and manifest metadata;
- `integrations/codex/` with `.codex-plugin` metadata, `hooks/hooks.json`, MCP descriptor, Skill/reference, and portable runner declarations;
- `integrations/claude-code/` with `.claude-plugin` metadata, hooks, `.mcp.json`, Skill/reference, and portable runner declarations;
- `integrations/inventory.json` as the single package/setup inventory.

Update `src/setup/engine.ts`, `src/setup/harnesses/`, `src/setup/paths.ts`, and receipt logic to install only receipt-owned v2 assets while preserving unrelated user configuration. Remove OpenCode's model-callable identity tool and resolve bounded parent/root identity inside its adapter. Hooks that run before MCP use the packaged command/core path; responses distinguish hook execution, memory confirmation, context delivery, and model consumption.

### 5. One-way importer

Add a CLI-only implementation under `src/memory-core/import/legacy-v1.ts` and `src/memory-core/import/report.ts`, exposed by a scoped command in `src/cli.ts`. It opens the legacy source read-only, recognizes supported schema signatures, maps only sessions/prompts/observations and directly attributable temporal metadata, ignores derived indexes/graphs/telemetry, and writes a separate clean v2 target through the core ledger.

The importer resolves absolute paths before mutation, rejects source/target aliasing, stages/transactions the target, validates FTS/foreign keys/lineage/counts, verifies the source is unchanged, and emits the schema in `contracts/importer-v2.md`. The v2 server never imports or links the legacy reader.

### 6. Benchmark and promotion harness

Add a dev-only harness under `benchmarks/`:

- `benchmarks/manifest.json`: datasets, budgets, metrics, thresholds, versions, and lane availability;
- `benchmarks/provider.mjs`: JSONL/subprocess adapter over the built v2 core;
- `benchmarks/adapters/`: thin upstream-compatible adapters, including Python only where an upstream runner requires it;
- `benchmarks/run.mjs`: orchestration, hashing, resource measurement, schema validation, and durable report writing;
- `benchmarks/report.schema.json`: `contracts/benchmark-report-v1.md` as machine validation;
- `benchmarks/results/.gitkeep`: reports are generated explicitly; decision reports are committed only when selected by a reviewed change.

Add package scripts for local benchmark preparation/run that do not execute in normal build, test, install, or startup. Public datasets/runners are downloaded or cloned only by an explicit benchmark preparation command, never vendored silently or fetched during tests.

### 7. Cutover and retirement

After focused core/tool/plugin/importer suites pass, first add a packed-artifact acceptance test that remains red while the legacy package boundary exists, then update only the synchronization and disposable-host verifier plumbing. Atomically switch active runtime entrypoints to `MemoryService`, delete retired runtime source, and update the package manifest, frozen lockfile, workspace manifest, published configuration schema, Vitest runner inventory, and CI/release workflows so the active runtime/package/CI acceptance test turns green against the real offline tarball. Only after that boundary is clean is the dashboard application tree deleted and an active-surface residue check run. V1-only tests and documentation residue are removed afterward by their own tasks; the final verification task performs the first repository-wide deleted-reference audit. This ordering prevents an intermediate task from claiming repository-wide cleanliness before test and documentation owners have executed.

The cutover deletes or removes from compilation/package:

- legacy `src/store/`, `src/retrieval/`, `src/indexing/`, `src/sync/`, KG/community/maintenance/semantic-atlas modules and their v1-only tests;
- `src/http-*.ts`, HTTP/dashboard CLI commands, visualization API, `dashboard/`, and observability/dashboard build dependencies/scripts;
- v1 compatibility setup branches, OpenCode identity tool assets, old hook/skill mirrors, vector/embedding/HyDE dependencies and configuration;
- dashboard workspace ownership in `pnpm-workspace.yaml`, stale dependency resolutions in `pnpm-lock.yaml`, and removed runtime keys in `config.schema.json`;
- browser/dashboard Vitest configurations and patterns plus CI/release/dashboard-performance workflow references to deleted scripts;
- canonical documentation and root `AGENTS.md` guidance that describe removed runtime surfaces.

Git history and the prior released package are the source-code rollback. The old database remains the data rollback. No dormant source tree or runtime feature flag preserves the old product inside v2.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001–003, SC-001 | Evidence/memory/lineage tables and append-oriented service transactions | `src/memory-core/contracts.ts`, `service.ts`, `sqlite/{schema,ledger,fts}.ts`, `data-model.md` | Ledger contract tests prove support, outcome, supersession, current/history, immutability |
| FR-004–010, SC-002, SC-010, SC-011 | No required vec tables; clean v2 schema; projection lineage; explicit identity; read-only one-way importer | `src/memory-core/sqlite/`, `identity.ts`, `import/`, `contracts/importer-v2.md` | Initialize without sqlite-vec; projection rebuild hash; frozen-source importer fixture and source hash |
| FR-011–020, SC-003, SC-004 | Exact/structured/FTS5 baseline, current/history ranking, bounded progressive context, deterministic briefing | `src/memory-core/retrieval/`, `contracts/mcp-v2.md` | Same-transaction recall, punctuation/code queries, deterministic ordering, budget and lineage tests |
| FR-021–023, SC-013 | Correlated privacy-safe payload and escalation telemetry | `src/memory-core/retrieval/context.ts`, `src/tools/`, benchmark provider | Compact/context/get traces and compaction fixture report source/evidence/returned/injected separately |
| FR-024–030, SC-010 | Asynchronous disposable projection port with readiness/watermark; no KG/LLM save work | `src/memory-core/retrieval/projections.ts`, optional job boundary | Delete/rebuild equivalence; stale/failure cases leave lexical output stable |
| FR-031–038, SC-003 | Exact six-tool v2 registry; remove graph actions and v1 contract fallback | `src/tools/*.ts`, `src/tools/index.ts`, `src/server.ts`, `src/index.ts` | Registry snapshot and per-tool v2 schema/behavior tests |
| FR-039–049, SC-005, SC-006, SC-009 | Three hook+MCP+Skills bundles; internal adapter identity; bounded capture and lifecycle receipts | `src/integration/`, `integrations/`, `src/setup/`, `contracts/plugin-lifecycle-v2.md` | Host fixtures, duplicate/restart/compaction/degraded tests, absence of identity tool and passive rows |
| FR-050–052, SC-005, SC-007 | Single exact tarball inventory; deferred runtimes absent from startup/package | `integrations/inventory.json`, `scripts/{sync,verify}-integration-*.mjs`, `package.json` | `npm pack` inventory/runtime smoke in disposable homes; dependency/startup assertions |
| FR-053–063, SC-008, SC-012–014 | Equal-budget adapter, metric namespaces, resource envelope, fail-closed promotion | `benchmarks/`, `contracts/benchmark-report-v1.md`, package benchmark scripts | Schema validation, control/candidate budget equality, unavailable-lane behavior, durable report |

## Optional support artifacts

- `research.md`: created because the user explicitly requested broader repository/eval analysis and the adopt/reject evidence controls the product boundary.
- `data-model.md`: created because a clean schema, temporal lineage, and one-way migration are correctness-critical and cannot be left to task-time inference.
- `contracts/`: created for the breaking MCP v2 envelope, host-neutral plugin lifecycle, non-destructive importer, and benchmark report/promotion gate.
- `quickstart.md`: not needed before implementation; packed-host and importer commands do not exist yet, and inventing them now would create stale operator guidance.

## Verification strategy

1. Load the mandatory `tdd` skill before behavior implementation; write the nearest failing contract test before each production slice.
2. Run focused suites in order: schema/ledger → retrieval/projection → tools → lifecycle/adapters → setup/package → importer → benchmark schema/adapters.
3. Run `pnpm run build`, then the full verified `pnpm test` command defined by `docs/agent/testing.md`.
4. Run packed-artifact verification from the produced tarball in disposable OpenCode/Codex/Claude homes; do not touch real user host state.
5. Run `pnpm run prepublishOnly` only after package scripts are updated and focused packed verification passes.
6. Load `simplify` after implementation and simplify only changed v2 surfaces without changing behavior; rerun affected focused suites and build.
7. A fresh Oracle audits spec/plan/task coverage, removed dependency/runtime reachability, source-database safety, diff hygiene, focused/full/packed evidence, and returns PASS/FAIL. Root records `verify-report.md`.

## Risks and migrations

- **Cutover breadth**: deleting the giant Store and secondary surfaces can reveal hidden imports late. Mitigation: build the new module independently, use TypeScript/build plus CodeGraph/IDE reference checks at the atomic cutover, and delete in dependency order. Rollback is the previous commit/package, not a feature flag.
- **Lexical quality**: FTS5 may underperform semantic candidates on paraphrase. Mitigation: commit the baseline first, use exact topic/project structure signals and deterministic snippets, then promote optional lanes only from equal-budget evidence. Product correctness does not depend on a speculative score.
- **Temporal mapping**: old overwritten observations may not contain recoverable prior content. Mitigation: import only source-attributable history, report unrecoverable/ignored derived history, and never synthesize a prior fact from graph output alone.
- **Identity drift across hosts**: host payloads and project paths differ. Mitigation: one resolver, stable root session/project keys, adapter-only parent traversal, lifecycle receipts, and versioned capability fixtures.
- **Hook/MCP ordering**: some host hooks run before MCP is connected. Mitigation: packaged Node command/core fallback, explicit confirmation/delivery/consumption states, and no claim that model context was consumed without evidence.
- **Privacy/noise**: automatic activity capture can recreate the original complexity and store sensitive streams. Mitigation: root prompts/checkpoints only, bounded sanitizer, explicit agent `mem_save` for reusable learning, and tests proving zero passive tool/subagent rows.
- **Benchmark availability/cost**: external datasets or runners can disappear or be too large for routine CI. Mitigation: version/hash manifests, explicit preparation, adapters that fail unavailable, a small committed contract fixture for CI, and full decision runs outside default tests.
- **Native dependency/package size**: removing semantic/dashboard dependencies can expose accidental package imports. Mitigation: tarball inventory, clean install, cold start with network/model denial, and byte inventory in benchmark/package reports.
- **Migration safety**: path aliasing or a corrupt source could overwrite user data. Mitigation: resolved-path inequality, read-only source, staging target, pre/post source identity, transaction/integrity checks, and explicit incomplete-target cleanup only.
- **Destructive canonical deltas**: archive will remove/rename public requirements. Mitigation: the user selected a major reset, constitution 2.0.0 records the exception, source DB and prior release remain rollback, and archive must emit the configured destructive-delta warning.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the design changes only the six handlers and registry construction, explicitly deletes graph/admin/setup behavior from MCP, and verifies the exact registry from the packed product.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — `src/memory-core/sqlite/` and `retrieval/` own immediate SQLite/FTS5 operation; `projections.ts` is one-way derived, source-watermarked, delete/rebuild tested, absent by default, and excluded from authoritative transactions.
- **P3 — Harness-Agnostic Memory Contract**: PASS — plugin assets terminate in adapters, adapters emit only six host-neutral lifecycle intents, every memory operation reaches `MemoryService`, and legacy schema knowledge exists only in the CLI importer.
- **P4 — Token-Efficient, Bounded Recall Outputs**: JUSTIFIED EXCEPTION — `contracts/mcp-v2.md` and `retrieval/{snippets,context}.ts` preserve compact/context/get, deterministic trimming, bounds, and correlated payload metrics; only vector-specific thresholds/top-k are retired, with future alternatives gated by the benchmark manifest.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — the cutover removes v1 handlers/runtime dependencies and deferred surfaces, package verification proves the clean boundary, importer writes a distinct target, and rollback uses the untouched old DB and prior package rather than dormant compatibility code.
