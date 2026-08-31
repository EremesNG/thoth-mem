# Packaging

## Requirements

### Requirement: Published Package MUST Contain Native Assets for All Three Harnesses

The packed release MUST keep one coherent OpenCode, Codex, and Claude distribution whose runners, receipts, Skills, schemas, and package inventory use the unversioned current contract while preserving numeric manifest schema versions where technically required.

#### Scenario: US2 - Treat the replacement architecture as the normal product base 1

- **GIVEN** a clean installation
- **WHEN** the MCP and native lifecycle paths execute
- **THEN** their public envelopes and commands use the current unversioned thoth-mem contract and persist to `memory.sqlite`

#### Scenario: US2 - Treat the replacement architecture as the normal product base 2

- **GIVEN** an invocation using a removed transitional command or namespace
- **WHEN** it reaches the current package
- **THEN** it fails explicitly instead of entering a compatibility shim

#### Scenario: US2 - Treat the replacement architecture as the normal product base 3

- **GIVEN** a legacy database selected for import
- **WHEN** the operator runs the current importer
- **THEN** `import-legacy` writes a distinct current database and preserves the source without describing the target as a replacement generation

#### Scenario: US3 - Preserve technical version truth without product-generation branding 1

- **GIVEN** an existing current database at an older internal SQLite revision
- **WHEN** startup migration runs
- **THEN** ordered idempotent migration still uses numeric revisions and preserves authoritative data

#### Scenario: US3 - Preserve technical version truth without product-generation branding 2

- **GIVEN** a native manifest or import report that needs a machine-readable format discriminator
- **WHEN** it is emitted
- **THEN** it may retain a numeric version field while its command, filename, namespace, and prose remain free of transitional generation labels

### Requirement: NPM Tarball MUST Match One Canonical Integration Inventory

Every packaged native asset MUST continue to appear exactly once under one harness owner or the declared shared owner, and package, setup, and smoke verification MUST consume the same plugin inventory. Marketplace descriptors MUST have exactly one canonical owner in the `thoth-plugins` repository, MUST retain plugin and Skill identifiers `thoth-mem` and `thoth-agents`, and MUST keep each `thoth-plugins/<plugin>` cache segment pair distinct. Plugin package tarballs MUST NOT publish competing per-repository marketplace catalogs.

#### Scenario: US1 - Resolve an installed Skill on the first path 1

- **GIVEN** marketplace `thoth-plugins`, plugin `thoth-mem`, and version `0.4.13`
- **WHEN** Codex derives the installed Skill path
- **THEN** it resolves `cache/thoth-plugins/thoth-mem/0.4.13/skills/thoth-mem/SKILL.md` without first probing a path that omits the plugin segment

#### Scenario: US1 - Resolve an installed Skill on the first path 2

- **GIVEN** marketplace `thoth-plugins`, plugin `thoth-agents`, and an independently selected plugin version
- **WHEN** Codex or Claude Code installs it
- **THEN** the host retains `thoth-plugins` and `thoth-agents` as separate adjacent cache segments

### Requirement: OpenCode MUST Keep SQLite Behind a Literal Node Boundary

The native OpenCode plugin MAY execute in Bun, but every SQLite-backed MCP or lifecycle operation MUST cross bounded JSON stdio to literal Node and the package-relative built entry. The Bun bundle MUST NOT import `better-sqlite3` or instantiate the memory service.

#### Scenario: Execute a packed OpenCode lifecycle hook

- **GIVEN** a Bun-loaded native bundle and valid root event
- **WHEN** recovery runs
- **THEN** the adapter spawns literal Node `lifecycle`, validates the bounded current envelope, and returns host-shaped output

### Requirement: Public and Local Runtime Provenance MUST Be Explicit

Public Codex and Claude runners MUST resolve the exact package version declared by the plugin runtime. Explicit local setup MAY use only an absolute verified checkout build. OpenCode public setup MUST use an exact npm entry and local setup one canonical absolute file URL.

#### Scenario: Local runtime identity does not match the plugin

- **GIVEN** a configured local entry from a different package name or version
- **WHEN** a native runner validates provenance
- **THEN** it fails closed before executing that entry

### Requirement: Managed Setup MUST Own Only Declared Installation State

Setup receipts MUST identify exact owned configuration, Skill, provider, and manager operations and use `.thoth-mem-managed.json` for copied integration fixtures. Unrelated state and stale unowned residue MUST not be deleted by name alone.

#### Scenario: Stale unowned plugin residue exists

- **GIVEN** an old directory not referenced by current config or a valid receipt
- **WHEN** setup inspects the host
- **THEN** it reports bounded cleanup guidance without claiming ownership or deleting the directory

### Requirement: First Product Package MUST Exclude Deferred Runtime Surfaces

The default package and startup path MUST NOT require or start dashboard, observatory, network service, graph engine, external database, embedding model, reranker, or LLM components.

#### Scenario: Cold-start with network and models unavailable

- **GIVEN** a clean installed tarball with no network or model runtime
- **WHEN** MCP and lifecycle start
- **THEN** the six tools and lexical memory workflow remain operational

### Requirement: Packed Verification MUST Exercise Every Host in Disposable State

Release verification MUST import the native OpenCode entry, execute the CLI, validate public/local setup planning, synchronize Skills, cold-start MCP, and execute lifecycle runners for all three hosts without reading or mutating real user homes.

#### Scenario: Run packed smoke

- **GIVEN** a freshly built tarball and disposable homes
- **WHEN** integration smoke runs
- **THEN** OpenCode, Codex, and Claude inventories and lifecycle fixtures pass with exactly six MCP tools

### Requirement: Plugin Releases MUST Publish Their Catalog Version

Each plugin repository's `release:patch`, `release:minor`, and `release:major` flow MUST push and verify the new source tag before updating the central catalog, MUST update only that plugin's Codex and Claude Code entries to the exact released version and tag, and MUST provide an idempotent catalog-only retry command that does not create a new plugin version. A catalog publication failure MUST be reported as an incomplete release operation.

#### Scenario: US3 - Publish a plugin version without manual catalog drift 1

- **GIVEN** thoth-mem and thoth-agents at different versions
- **WHEN** thoth-mem completes `release:patch`
- **THEN** the source tag is pushed first and both central descriptors advance only the thoth-mem entry to that exact version and tag

#### Scenario: US3 - Publish a plugin version without manual catalog drift 2

- **GIVEN** the plugin tag or packaged plugin manifest is absent or inconsistent
- **WHEN** catalog synchronization runs
- **THEN** it fails before committing or pushing a central catalog change

#### Scenario: US3 - Publish a plugin version without manual catalog drift 3

- **GIVEN** the plugin tag was pushed but central publication failed
- **WHEN** the maintainer runs the dedicated catalog synchronization command again
- **THEN** it converges idempotently without creating another plugin version or tag
