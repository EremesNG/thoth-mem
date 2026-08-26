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

Every packaged native asset MUST appear exactly once under one harness owner or the declared shared owner, and package, setup, and smoke verification MUST consume the same inventory.

#### Scenario: Inventory references a missing asset

- **GIVEN** a declared path absent from the tarball
- **WHEN** integration verification runs
- **THEN** packaging fails before publication or host installation

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
