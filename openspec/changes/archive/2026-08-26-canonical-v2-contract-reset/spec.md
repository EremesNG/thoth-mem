# Feature Specification: Canonical product contract reset

**Change ID**: `canonical-v2-contract-reset`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: The executable product is already a deliberately small SQLite-first memory plugin, but the active canonical specifications still describe retired dashboard, HTTP, graph, vector, semantic-indexing, sync, and observability systems. The replacement core is also still labeled “V2” throughout public and internal product surfaces even though it is now the only supported base.<br>
**Impact**: Replace the active OpenSpec corpus with a concise contract for the current product, delete retired capability specifications, and remove the transitional V2 naming from commands, envelopes, default paths, receipts, source/test names, Skills, documentation, and distribution assets. Numeric format or schema revisions remain only where they distinguish real persisted formats; no compatibility aliases are required for the retired names.<br>
**Affected capabilities**: `cli`, `config`, `evals`, `harness-integration`, `packaging`, `retrieval`, `store`, `tools`

## User stories

### US1 - Read one truthful canonical product contract (Priority: P1)

As a maintainer, I can read the active specifications and see only behavior implemented by the current SQLite-first product so that future changes are not planned against retired architecture.

**Independent test**: Enumerate `openspec/specs`, compare every retained capability and requirement with the active package/runtime inventory, and verify that retired capability directories and requirements are absent.

**Covers**: FR-001, FR-002, FR-008, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** the active canonical specification tree, **When** a maintainer inspects its capabilities, **Then** it contains only the CLI, configuration, evaluation, native-harness, packaging, retrieval, store, and tool contracts implemented or deliberately gated by the current product.
2. **Given** the retired V1 surfaces, **When** the canonical tree and OpenSpec context are searched, **Then** dashboard, HTTP, graph/KG, vector/embedding, HyDE, sync, observatory, and passive-capture requirements are absent except where a retained requirement explicitly prohibits or gates them.

### US2 - Treat the replacement architecture as the normal product base (Priority: P1)

As a user or integrator, I can use thoth-mem without transitional V2 terminology so that commands, files, schemas, Skills, and diagnostics describe one current product instead of a parallel generation.

**Independent test**: Exercise the CLI, MCP handlers, lifecycle runner, default database path, importer, setup receipts, native bundles, and Skills using the unversioned names and verify that the removed V2 aliases are not registered.

**Covers**: FR-003, FR-004, FR-005, FR-006, FR-007, FR-009, SC-003, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** a clean installation, **When** the MCP and native lifecycle paths execute, **Then** their public envelopes and commands use the current unversioned thoth-mem contract and persist to `memory.sqlite`.
2. **Given** an invocation using a removed transitional command or namespace, **When** it reaches the current package, **Then** it fails explicitly instead of entering a compatibility shim.
3. **Given** a legacy database selected for import, **When** the operator runs the current importer, **Then** `import-legacy` writes a distinct current database and preserves the source without describing the target as V2.

### US3 - Preserve technical version truth without product-generation branding (Priority: P1)

As a maintainer, I can retain real schema and report revision numbers while removing V2 branding so that migrations remain safe and machine formats remain discriminable without implying a supported legacy product line.

**Independent test**: Open current and migration fixtures, run setup and packed verification, and prove that numeric `schemaVersion`, SQLite migration revisions, and report-version fields retain their semantics while no active owned surface uses V2 as a product name.

**Covers**: FR-006, FR-007, FR-010, SC-004, SC-006

**Acceptance scenarios**:

1. **Given** an existing current database at an older internal SQLite revision, **When** startup migration runs, **Then** ordered idempotent migration still uses numeric revisions and preserves authoritative data.
2. **Given** a native manifest or import report that needs a machine-readable format discriminator, **When** it is emitted, **Then** it may retain a numeric version field but its command, filename, namespace, and prose do not call the product V2.

## Edge cases

- Historical artifacts under `openspec/changes/archive/` must remain immutable even when they contain V1 or V2 terminology.
- `legacy-v1.ts` identifies the source format accepted by the one-way importer and is not a name for the current product.
- Existing local databases and managed receipts may still use transitional filenames until the operator performs a new setup; runtime must never silently open the wrong database merely to preserve compatibility.
- OpenCode runs the native adapter in Bun, so renaming the lifecycle command must preserve the literal-Node SQLite boundary.
- Codex and Claude public runners must agree with the renamed lifecycle envelope and managed receipt path.
- Generated `dist/`, dependency metadata, Git history, and archived SDD evidence must not be edited as source-of-truth files merely to remove a historical literal.
- Removal of large canonical files must not erase the current identity, privacy, temporal-memory, six-tool, packaging, setup, or benchmark-promotion contracts.

## Functional requirements

- **FR-001 — Canonical Capability Inventory MUST Match the Current Product**: `[INTERNAL]` `openspec/specs` and `openspec/config.yaml` MUST describe only the current SQLite-first core, exact six-tool MCP surface, scoped CLI/setup/importer, native OpenCode/Codex/Claude bundles, and equal-budget evaluation gate.
- **FR-002 — Retired Product Capabilities MUST Not Remain Canonical**: `[INTERNAL]` Active canonical specifications MUST remove dashboard, dashboard-design, dashboard-navigation, HTTP API, visualization, knowledge-graph, sync, observability, semantic-indexing, vector, embedding, HyDE, reranking-default, consolidation-default, and broad passive-capture requirements; optional retrieval complexity MAY re-enter only through a future benchmark-backed change.
- **FR-003 — Native Integrations MUST Use the Documented Tool Contracts**: `[MODIFIED tools]` Every native integration MUST consume the same closed six-tool request and response schemas under the current unversioned MCP namespace, and old V2 namespaces MUST NOT remain registered as aliases.
- **FR-004 — Runtime Lifecycle MUST Preserve the Core Contract**: `[MODIFIED harness-integration]` Start/resume recovery, root-prompt capture, compaction, finalization, and degraded diagnostics MUST use the shared unversioned lifecycle command and envelope while preserving identity, privacy, idempotency, temporal, and bounded-output behavior.
- **FR-005 — CLI MUST Provide Managed Setup for OpenCode, Codex, and Claude Code**: `[MODIFIED cli]` The CLI MUST retain scoped managed setup and expose the current commands `mcp`, `lifecycle`, and `import-legacy`; `lifecycle-v2` and `import-v2` MUST be removed without compatibility aliases.
- **FR-006 — Startup Migrations MUST Be Structured and Idempotent**: `[MODIFIED store]` Runtime MUST use `memory.sqlite` as the current default database, retain ordered numeric SQLite revisions for current-schema migration, and reject legacy databases without mutating or silently treating a transitional filename as authoritative.
- **FR-007 — Published Package MUST Contain Native Assets for All Three Harnesses**: `[MODIFIED packaging]` The packed release MUST keep one coherent OpenCode, Codex, and Claude distribution whose runners, receipts, Skills, schemas, and package inventory use the unversioned current contract while preserving numeric manifest schema versions where technically required.
- **FR-008 — MCP Surface MUST Be Compact and Workflow-Level**: `[MODIFIED tools]` The server MUST continue to expose exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`, with unversioned descriptions and envelopes and without reintroducing retired admin, graph, setup, migration, or diagnostic tools.
- **FR-009 — Every Native Plugin MUST Bundle Hooks, MCP, and Skills**: `[MODIFIED harness-integration]` Each host bundle MUST continue to package its supported hooks, one registration path for the shared six-tool MCP server, and the same memory Skill, with no V2 product-generation wording or stale copied contract.
- **FR-010 — Technical Revisions MUST Remain Explicit and Product-Neutral**: `[INTERNAL]` Numeric database, manifest, report, and migration versions MUST remain stable when they distinguish machine formats, but active owned source, tests, documentation, Skills, filenames, commands, default paths, receipts, and schema namespaces MUST not use V2 as the current product name.

## Success criteria

- **SC-001** `[buildable]`: 100% of the active canonical tree is limited to `cli`, `config`, `evals`, `harness-integration`, `packaging`, `retrieval`, `store`, and `tools`, and every requirement has an implementation, verification, or explicit future-promotion boundary in the current repository.
- **SC-002** `[buildable]`: 100% of the active canonical specifications and OpenSpec context pass a residue audit with zero affirmative requirements for dashboard, HTTP, graph/KG, sync, observability, vector/embedding, HyDE, semantic indexing, reranking, consolidation, or passive activity capture.
- **SC-003** `[buildable]`: 100% of the focused CLI, MCP, lifecycle, importer, setup, and packaging tests pass using `lifecycle`, `import-legacy`, `memory.sqlite`, unversioned managed receipts, and unversioned `thoth-mem.mcp.*` / `thoth-mem.lifecycle` envelopes, while the removed names fail explicitly.
- **SC-004** `[buildable]`: 100% of the existing numeric SQLite migration, manifest `schemaVersion`, and report-version tests pass without any product-generation V2 label or a compatibility alias.
- **SC-005** `[buildable]`: 100% of the canonical, source, test, documentation, Skill, integration, benchmark, schema, and package-manifest owned surfaces contain zero case-insensitive V2 product labels outside immutable archived changes and explicitly excluded generated/dependency material.
- **SC-006** `[buildable]`: 100% of `pnpm run build`, `pnpm test`, `pnpm run integration:verify`, `pnpm run integration:smoke`, `pnpm run benchmark:fixture`, `pnpm run prepublishOnly`, and `git diff --check` pass with exactly six MCP tools and no retired runtime surface restored.

## Assumptions

- Backward compatibility for commands, envelope namespaces, filenames, receipts, source imports, and internal symbols is intentionally not required.
- Existing useful data remains recoverable through the one-way legacy importer or an explicit operator-controlled file move; this change does not guess which local transitional database should become current.
- The current runtime and recently certified native distributions are the behavioral source for the compact replacement specifications.
- AgentMemory remains a reference for multi-host distribution and benchmark protocol, Engram for lifecycle/compaction patterns, and `master` only for integration archaeology already validated elsewhere.

## Dependencies

- Existing TypeScript, Vitest, SQLite, MCP, native-host, setup, package-inventory, and packed-smoke contracts.
- A local build; no network fetch, publication, or paid Claude execution is required.

## Out of scope

- Editing immutable archived OpenSpec changes or Git history to erase historical V2 wording.
- Changing numeric SQLite revisions, manifest schema versions, or report versions solely for cosmetic reasons.
- Adding vectors, graph, entities, reranking, consolidation, dashboard, HTTP, sync, observability, or an LLM hot path.
- Implementing LongMemEval-S or another external benchmark; that remains the next roadmap change after the canonical reset.
- Publishing a new npm version or mutating real user host installations during repository verification.
