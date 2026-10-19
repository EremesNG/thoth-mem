# Feature Specification: Public plugin marketplace distribution

**Change ID**: `public-plugin-marketplace-distribution`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Public users must be able to discover and install thoth-mem for Codex and Claude Code directly from the repository, as they can with AgentMemory or Engram, without reproducing the private local-canary setup used during development.<br>
**Impact**: Restore repository-owned marketplace catalogs and a distributable plugin root, adapt them to the SQLite-first v2 runtime, and retain `setup-v2` as a separate receipt-owned development/canary path. Backward compatibility with the removed v1 runtime is not required.<br>
**Affected capabilities**: `packaging`, `harness-integration`

## User stories

### US1 - Install thoth-mem publicly in Codex (Priority: P1)

As a Codex user, I can add the thoth-mem repository marketplace and install its plugin so that hooks, the six-tool MCP server, and the memory Skill become available without a local checkout or manual asset copy.

**Independent test**: Add the repository marketplace and install the plugin in an isolated Codex home, then exercise its declared MCP and lifecycle runner from outside the source checkout.

**Covers**: FR-001, FR-002, FR-003, FR-005, SC-001, SC-005

**Acceptance scenarios**:

1. **Given** a clean supported Codex installation, **When** the user adds `EremesNG/thoth-mem` as a marketplace and installs `thoth-mem`, **Then** Codex discovers one current plugin whose hooks, MCP descriptor, Skill, and runtime launcher resolve entirely from installed assets or the pinned public package.
2. **Given** the installed public Codex plugin and an unrelated current working directory, **When** Codex invokes a lifecycle hook or starts MCP, **Then** the invocation reaches the same v2 core without requiring `.thoth-mem-managed-v2.json`, a development checkout, or private canary configuration.

### US2 - Install thoth-mem publicly in Claude Code (Priority: P1)

As a Claude Code user, I can add the thoth-mem repository marketplace and install its plugin so that native hooks, MCP, and the memory Skill load through Claude Code's supported plugin contract.

**Independent test**: Add and install the repository marketplace in an isolated Claude Code home, validate the plugin, and exercise a host-shaped lifecycle event and MCP handshake.

**Covers**: FR-001, FR-002, FR-003, FR-005, SC-001, SC-006

**Acceptance scenarios**:

1. **Given** a clean supported Claude Code installation, **When** the user adds `EremesNG/thoth-mem` and installs `thoth-mem`, **Then** Claude Code accepts the marketplace, manifest, root-relative component paths, native hooks, MCP descriptor, and Skill.
2. **Given** the installed public Claude Code plugin, **When** a supported session lifecycle event occurs, **Then** its portable runner calls the v2 lifecycle contract and emits only host-shaped bounded output.

### US3 - Keep public and canary installations separate (Priority: P1)

As a thoth-mem developer, I can install a local canary bundle without changing the repository-distributed plugin or the public marketplace registration so that host certification never tests the published runtime accidentally.

**Independent test**: Install `setup-v2` into an isolated local marketplace and prove its receipt/local runtime path differs from the immutable public catalog and pinned public runtime metadata.

**Covers**: FR-004, SC-003

**Acceptance scenarios**:

1. **Given** the repository marketplaces and a local v2 build, **When** `setup-v2` installs a Codex or Claude canary target, **Then** only the explicit target receives receipt-owned local assets and the committed public catalogs remain unchanged.
2. **Given** both public and canary configurations, **When** their runtime resolution is inspected, **Then** public installation resolves the pinned published package while canary installation resolves the explicit local build.

### US4 - Publish coherent marketplace artifacts (Priority: P2)

As a maintainer, I can verify and version the public plugin artifacts with the npm release so that repository discovery never advertises stale, missing, or checkout-dependent assets.

**Independent test**: Pack the project, validate all declared marketplace/plugin paths and synchronized versions, then run isolated installation and process-level smoke checks using only packed/repository-distribution assets.

**Covers**: FR-003, FR-004, SC-002, SC-004

**Acceptance scenarios**:

1. **Given** a release version change, **When** integration assets are synchronized, **Then** plugin manifests, marketplace metadata, and pinned runtime metadata agree with `package.json`.
2. **Given** a packed release with a missing, escaped, stale, or undeclared public plugin asset, **When** release verification runs, **Then** it fails with a bounded diagnostic before publication.

## Edge cases

- Repository marketplace installation does not create the managed receipt used by `setup-v2`.
- Plugin paths contain spaces on Windows or POSIX and hooks run from an unrelated working directory.
- `npx` performs a first-run download, uses its cache later, or cannot resolve the exact pinned package version.
- A public plugin and a private canary plugin coexist; their hook and MCP ownership must remain distinguishable.
- Codex and Claude Code use different marketplace anchors, manifest fields, MCP shapes, root variables, and lifecycle payloads while sharing one public plugin root.
- A package version changes without synchronized marketplace/runtime metadata.
- Marketplace validation succeeds but runtime activation or MCP handshake fails; installation alone must not be reported as functional certification.

## Functional requirements

- **FR-001 — Published Package MUST Contain Native Assets for All Three Harnesses**: `[MODIFIED packaging]` The published project MUST include repository-discoverable Codex and Claude Code marketplace catalogs plus a shared public plugin root containing each host's supported manifest, hooks, MCP registration, portable launcher, Skill, and references for the same v2 core version.
- **FR-002 — Hook Execution MUST Use Portable Node Runners**: `[MODIFIED packaging]` Public plugin hooks MUST resolve the pinned published v2 runtime without a managed setup receipt, private environment override, source checkout, shell-specific wrapper, or caller working-directory assumption; receipt/local-runtime resolution MAY take precedence only inside explicitly managed canary installations.
- **FR-003 — Manifest Versions and Paths MUST Be Internally Consistent**: `[MODIFIED packaging]` Codex and Claude Code marketplace entries, plugin manifests, component paths, and public runtime metadata MUST use current host contracts, remain contained within the distributed plugin root, and synchronize with the package version.
- **FR-004 — Installation Smoke Tests MUST Execute From the Packed Artifact**: `[MODIFIED packaging]` Release verification MUST exercise repository marketplace discovery, plugin installation, native lifecycle execution, and MCP startup for Codex and Claude Code in isolated homes without reading or mutating real user configuration or resolving runtime files from the development checkout; it MUST also prove that receipt-owned `setup-v2` canary installation changes only its explicit local target and leaves committed public marketplace assets unchanged.
- **FR-005 — Every Native Plugin MUST Bundle Hooks, MCP, and Skills**: `[MODIFIED harness-integration]` The public Codex and Claude Code plugin distribution MUST expose exactly one host-appropriate hook registration, one registration path for the shared exact six-tool MCP server, and the v2 memory Skill, with host-specific lifecycle mapping over the same core.

## Success criteria

- **SC-001** `[buildable]`: Exactly two repository marketplace anchors—Codex and Claude Code—resolve exactly one shared public plugin root, and 100% of declared component paths pass containment and existence validation.
- **SC-002** `[buildable]`: Package/version synchronization and prepublication verification exit nonzero for every fixture that makes one marketplace, plugin manifest, MCP runtime version, Skill/reference, hook, or launcher missing or stale, and exit zero for the synchronized release fixture.
- **SC-003** `[buildable]`: One automated canary-isolation test records identical pre/post hashes for both committed marketplace files, confines every created file to the explicit `setup-v2` target, and proves its receipt references the local runtime rather than the pinned public package.
- **SC-004** `[buildable]`: Isolated packed/repository-distribution smoke tests execute one host-shaped lifecycle event and one successful MCP initialize handshake for each of Codex and Claude Code with zero source-checkout reads and zero real-home mutations.
- **SC-005** `[outcome]`: In one clean real Codex profile, repository marketplace add plus plugin install/enable succeeds, and one restarted session reproduces a unique seeded memory absent from its user prompt; any missing step remains `RISK`, not `PASS`.
- **SC-006** `[outcome]`: In one clean real Claude Code profile, repository marketplace add plus plugin install/enable succeeds, and one new session reproduces a unique seeded memory absent from its user prompt; any missing step remains `RISK`, not `PASS`.

## Assumptions

- `thoth-mem` remains the public npm package and repository identity.
- Public plugin runtime resolution may use an exact package version through `npx`; local canary resolution must avoid that published path.
- The historical shared `plugin/` layout is reusable as a distribution concept, but its v1 lifecycle code is not restored unchanged.
- Codex real-host certification already establishes the current hook contract for the local v2 bundle; public-distribution certification remains a distinct outcome.

## Dependencies

- Current Codex plugin/marketplace loader and Claude Code plugin marketplace contracts.
- A published npm version matching the committed public plugin metadata for final public-host outcome certification.
- Node.js `>=22.12.0` and npm/npx availability for the public runtime path.

## Out of scope

- Publishing a new npm release or Git tag during implementation.
- Migrating legacy v1 databases or preserving v1 plugin/setup compatibility.
- Public marketplace distribution for OpenCode; its existing native bundle remains in scope only for regression verification.
- Submission to an official OpenAI or Anthropic curated marketplace.
- Dashboard, observatory, HTTP, graph, vector, reranking, or consolidation features.
