# Packaging

## Requirements

### Requirement: Published Package MUST Contain Native Assets for All Three Harnesses

The published project MUST include repository-discoverable Codex and Claude Code marketplace catalogs plus a shared public plugin root containing each host's supported manifest, hooks, MCP registration, portable launcher, Skill, and references for the same v2 core version.

#### Scenario: US1 - Install thoth-mem publicly in Codex 1

- **GIVEN** a clean supported Codex installation
- **WHEN** the user adds `EremesNG/thoth-mem` as a marketplace and installs `thoth-mem`
- **THEN** Codex discovers one current plugin whose hooks, MCP descriptor, Skill, and runtime launcher resolve entirely from installed assets or the pinned public package

#### Scenario: US1 - Install thoth-mem publicly in Codex 2

- **GIVEN** the installed public Codex plugin and an unrelated current working directory
- **WHEN** Codex invokes a lifecycle hook or starts MCP
- **THEN** the invocation reaches the same v2 core without requiring `.thoth-mem-managed-v2.json`, a development checkout, or private canary configuration

#### Scenario: US2 - Install thoth-mem publicly in Claude Code 1

- **GIVEN** a clean supported Claude Code installation
- **WHEN** the user adds `EremesNG/thoth-mem` and installs `thoth-mem`
- **THEN** Claude Code accepts the marketplace, manifest, root-relative component paths, native hooks, MCP descriptor, and Skill

#### Scenario: US2 - Install thoth-mem publicly in Claude Code 2

- **GIVEN** the installed public Claude Code plugin
- **WHEN** a supported session lifecycle event occurs
- **THEN** its portable runner calls the v2 lifecycle contract and emits only host-shaped bounded output

### Requirement: Hook Execution MUST Use Portable Node Runners

Public plugin hooks MUST resolve the pinned published v2 runtime without a managed setup receipt, private environment override, source checkout, shell-specific wrapper, or caller working-directory assumption; receipt/local-runtime resolution MAY take precedence only inside explicitly managed canary installations.

#### Scenario: US1 - Install thoth-mem publicly in Codex 1

- **GIVEN** a clean supported Codex installation
- **WHEN** the user adds `EremesNG/thoth-mem` as a marketplace and installs `thoth-mem`
- **THEN** Codex discovers one current plugin whose hooks, MCP descriptor, Skill, and runtime launcher resolve entirely from installed assets or the pinned public package

#### Scenario: US1 - Install thoth-mem publicly in Codex 2

- **GIVEN** the installed public Codex plugin and an unrelated current working directory
- **WHEN** Codex invokes a lifecycle hook or starts MCP
- **THEN** the invocation reaches the same v2 core without requiring `.thoth-mem-managed-v2.json`, a development checkout, or private canary configuration

#### Scenario: US2 - Install thoth-mem publicly in Claude Code 1

- **GIVEN** a clean supported Claude Code installation
- **WHEN** the user adds `EremesNG/thoth-mem` and installs `thoth-mem`
- **THEN** Claude Code accepts the marketplace, manifest, root-relative component paths, native hooks, MCP descriptor, and Skill

#### Scenario: US2 - Install thoth-mem publicly in Claude Code 2

- **GIVEN** the installed public Claude Code plugin
- **WHEN** a supported session lifecycle event occurs
- **THEN** its portable runner calls the v2 lifecycle contract and emits only host-shaped bounded output

### Requirement: NPM Tarball MUST Include the Complete Integration Inventory

Packed-artifact verification MUST prove that every declared native hook, MCP registration, Skill/reference, adapter, runner, and setup receipt path exists exactly once under one harness owner and resolves inside the tarball.

#### Scenario: US1 - Resume useful project context in any supported coding agent 1

- **GIVEN** a project with prior durable memories and a supported host version
- **WHEN** a root session starts or resumes
- **THEN** the plugin supplies bounded, source-attributed recovery context through the shared lifecycle contract

#### Scenario: US1 - Resume useful project context in any supported coding agent 2

- **GIVEN** a host event that cannot be mapped safely
- **WHEN** the event is received
- **THEN** the plugin reports that capability as degraded without inventing success or disabling explicit MCP memory operations

#### Scenario: US7 - Ship only the first product boundary 1

- **GIVEN** the packed first-product artifact
- **WHEN** its required runtime inventory is validated
- **THEN** each of the three harnesses has hooks, MCP registration, and Skills that resolve to the same core

#### Scenario: US7 - Ship only the first product boundary 2

- **GIVEN** the installed first product
- **WHEN** it starts and serves MCP lifecycle operations
- **THEN** deferred dashboard, observatory, HTTP, and graph surfaces are neither required nor started

### Requirement: Manifest Versions and Paths MUST Be Internally Consistent

Codex and Claude Code marketplace entries, plugin manifests, component paths, and public runtime metadata MUST use current host contracts, remain contained within the distributed plugin root, and synchronize with the package version.

#### Scenario: US1 - Install thoth-mem publicly in Codex 1

- **GIVEN** a clean supported Codex installation
- **WHEN** the user adds `EremesNG/thoth-mem` as a marketplace and installs `thoth-mem`
- **THEN** Codex discovers one current plugin whose hooks, MCP descriptor, Skill, and runtime launcher resolve entirely from installed assets or the pinned public package

#### Scenario: US1 - Install thoth-mem publicly in Codex 2

- **GIVEN** the installed public Codex plugin and an unrelated current working directory
- **WHEN** Codex invokes a lifecycle hook or starts MCP
- **THEN** the invocation reaches the same v2 core without requiring `.thoth-mem-managed-v2.json`, a development checkout, or private canary configuration

#### Scenario: US2 - Install thoth-mem publicly in Claude Code 1

- **GIVEN** a clean supported Claude Code installation
- **WHEN** the user adds `EremesNG/thoth-mem` and installs `thoth-mem`
- **THEN** Claude Code accepts the marketplace, manifest, root-relative component paths, native hooks, MCP descriptor, and Skill

#### Scenario: US2 - Install thoth-mem publicly in Claude Code 2

- **GIVEN** the installed public Claude Code plugin
- **WHEN** a supported session lifecycle event occurs
- **THEN** its portable runner calls the v2 lifecycle contract and emits only host-shaped bounded output

#### Scenario: US4 - Publish coherent marketplace artifacts 1

- **GIVEN** a release version change
- **WHEN** integration assets are synchronized
- **THEN** plugin manifests, marketplace metadata, and pinned runtime metadata agree with `package.json`

#### Scenario: US4 - Publish coherent marketplace artifacts 2

- **GIVEN** a packed release with a missing, escaped, stale, or undeclared public plugin asset
- **WHEN** release verification runs
- **THEN** it fails with a bounded diagnostic before publication

### Requirement: Installation Smoke Tests MUST Execute From the Packed Artifact

Release verification MUST exercise repository marketplace discovery, plugin installation, native lifecycle execution, and MCP startup for Codex and Claude Code in isolated homes without reading or mutating real user configuration or resolving runtime files from the development checkout; it MUST also prove that receipt-owned `setup-v2` canary installation changes only its explicit local target and leaves committed public marketplace assets unchanged.

#### Scenario: US3 - Keep public and canary installations separate 1

- **GIVEN** the repository marketplaces and a local v2 build
- **WHEN** `setup-v2` installs a Codex or Claude canary target
- **THEN** only the explicit target receives receipt-owned local assets and the committed public catalogs remain unchanged

#### Scenario: US3 - Keep public and canary installations separate 2

- **GIVEN** both public and canary configurations
- **WHEN** their runtime resolution is inspected
- **THEN** public installation resolves the pinned published package while canary installation resolves the explicit local build

#### Scenario: US4 - Publish coherent marketplace artifacts 1

- **GIVEN** a release version change
- **WHEN** integration assets are synchronized
- **THEN** plugin manifests, marketplace metadata, and pinned runtime metadata agree with `package.json`

#### Scenario: US4 - Publish coherent marketplace artifacts 2

- **GIVEN** a packed release with a missing, escaped, stale, or undeclared public plugin asset
- **WHEN** release verification runs
- **THEN** it fails with a bounded diagnostic before publication

### Requirement: Disposable Per-Harness Verification MUST Prove Runtime Activation
Release verification MUST exercise the packed OpenCode, Codex, and Claude Code
assets in isolated disposable harness homes and MUST distinguish installed
assets from a verified active runtime lifecycle. For each harness, verification
MUST record detected version/payload capability evidence, declared asset
execution, and resulting activation classification. Verification MUST fail or
report capability as unproven when activation cannot be observed. It MUST not
require credentials, a development checkout, a real user home,
cross-repository mutation, or automatic external-server startup.

#### Scenario: Discoverable asset without execution fails activation proof
- GIVEN a packed harness asset is present in a disposable installation
- BUT no controlled runtime event produces observable activation evidence
- WHEN release verification evaluates that harness
- THEN it MUST not treat package discovery as activation success
- AND it MUST report failed or unproven activation evidence for that harness

#### Scenario: All three harnesses record isolated activation evidence
- GIVEN disposable OpenCode, Codex, and Claude Code homes with verified
  version/payload fixtures
- WHEN each packed integration handles its controlled activation event
- THEN verification MUST record a bounded activation result for each harness
- AND it MUST prove that no source-checkout or real-home dependency was used

### Requirement: Disposable Runtime Verification MUST Validate Recovery and Compaction Capabilities
For every supported harness capability, packed-artifact verification MUST prove
bounded model-visible recovery delivery after activation or resume and ordered
checkpoint-plus-guidance behavior after compaction. When a host version or
payload does not safely support recovery injection or compaction guidance,
verification MUST assert the exact degraded or unsupported capability outcome
rather than skip the case or report successful delivery.

#### Scenario: Supported recovery and compaction paths are exercised
- GIVEN a disposable harness fixture supports verified recovery injection and
  compaction payloads
- WHEN the packed integration activates, resumes, and compacts an active root
  session
- THEN verification MUST observe bounded recovery delivery and a confirmed
  checkpoint before post-compaction guidance

#### Scenario: Unsupported delivery remains explicit in packed verification
- GIVEN a disposable harness fixture lacks verified recovery injection or
  compaction guidance capability
- WHEN the packed integration handles the corresponding lifecycle event
- THEN verification MUST assert a degraded or unsupported outcome
- AND it MUST not accept a success-like activation, context, or guidance claim

### Requirement: Packed Claude Code Setup Verification MUST Preserve Coexistence and Rollback Safety
Packaging verification MUST exercise managed Claude Code setup, coexistence,
and rollback using a disposable home and packed assets. It MUST prove that plan
mode is zero-write, compatible marketplace or manual configuration remains
preserved, only receipt-owned managed changes are reverted, and unavailable
manager capabilities return bounded manual guidance. The verification MUST NOT
use direct manager-cache cleanup, shell-specific wrappers, or a development
checkout as a runtime dependency.

#### Scenario: Disposable Claude setup preserves external state
- GIVEN a disposable Claude Code home contains marketplace-managed or unrelated
  manual configuration
- WHEN managed setup plans or applies a compatible installation from packed
  assets
- THEN verification MUST preserve the external state and avoid duplicate
  activation
- AND it MUST record ownership classification and final setup outcome

#### Scenario: Disposable Claude rollback is ownership-bounded
- GIVEN packed managed Claude Code setup created receipt-owned changes in a
  disposable home
- WHEN rollback runs
- THEN verification MUST confirm that only receipt-owned changes are restored
  or removed
- AND it MUST confirm that unrelated later configuration remains unchanged

### Requirement: Synchronize reference assets

The explicit integration synchronization command MUST copy every canonical harness reference into the shared plugin skill and report changed reference paths.

#### Scenario: US3 - Publish the complete skill bundle 1

- **GIVEN** canonical harness references
- **WHEN** integration assets are synchronized
- **THEN** the shared plugin skill contains byte-identical copies and reports each changed path

#### Scenario: US3 - Publish the complete skill bundle 2

- **GIVEN** a missing, stale, or undeclared packaged reference
- **WHEN** the read-only verifier runs
- **THEN** verification fails with a bounded asset error

### Requirement: Verify published references

Inventory and read-only package verification MUST declare and validate every published harness reference so missing or stale files fail delivery checks.

#### Scenario: US3 - Publish the complete skill bundle 1

- **GIVEN** canonical harness references
- **WHEN** integration assets are synchronized
- **THEN** the shared plugin skill contains byte-identical copies and reports each changed path

#### Scenario: US3 - Publish the complete skill bundle 2

- **GIVEN** a missing, stale, or undeclared packaged reference
- **WHEN** the read-only verifier runs
- **THEN** verification fails with a bounded asset error

### Requirement: Include skill in managed drift

OpenCode setup inspection and replacement MUST include the installed skill bundle in the existing receipt-owned asset comparison so missing, stale, or extra managed skill files are detected.

#### Scenario: US3 - Preserve managed setup ownership 1

- **GIVEN** a skill file is missing or modified inside the managed plugin assets
- **WHEN** setup is inspected
- **THEN** the installation is reported as drifted

#### Scenario: US3 - Preserve managed setup ownership 2

- **GIVEN** an older managed OpenCode installation without the bundled skill
- **WHEN** setup is applied again
- **THEN** the receipt-owned asset directory is upgraded to the complete current layout

#### Scenario: US3 - Preserve managed setup ownership 3

- **GIVEN** a managed installation with the bundled skill
- **WHEN** rollback is applied
- **THEN** the receipt-owned plugin assets are restored or removed according to the receipt and no shared OpenCode skill directory is mutated

### Requirement: Keep rollback ownership bounded

OpenCode rollback MUST restore or remove the bundled skill only through the existing managed plugin asset receipt and MUST NOT create, edit, or delete the user's shared OpenCode skills directory.

#### Scenario: US3 - Preserve managed setup ownership 1

- **GIVEN** a skill file is missing or modified inside the managed plugin assets
- **WHEN** setup is inspected
- **THEN** the installation is reported as drifted

#### Scenario: US3 - Preserve managed setup ownership 2

- **GIVEN** an older managed OpenCode installation without the bundled skill
- **WHEN** setup is applied again
- **THEN** the receipt-owned asset directory is upgraded to the complete current layout

#### Scenario: US3 - Preserve managed setup ownership 3

- **GIVEN** a managed installation with the bundled skill
- **WHEN** rollback is applied
- **THEN** the receipt-owned plugin assets are restored or removed according to the receipt and no shared OpenCode skill directory is mutated

### Requirement: Replace the whole managed asset target safely

Convergence MUST delete every prior entry inside the selected-scope managed asset target and install only the current packaged layout; if the target itself is a symlink, junction, or equivalent link, setup MUST remove the link without traversing or modifying its destination before creating a normal directory.

#### Scenario: US1 - Converge an existing OpenCode installation 1

- **GIVEN** the canonical OpenCode managed asset target contains an older or newer package version
- **WHEN** setup runs without `--force`
- **THEN** setup replaces the complete managed directory and canonical plugin entry with the current package and reports `complete` with `changed=true`

#### Scenario: US1 - Converge an existing OpenCode installation 2

- **GIVEN** the managed asset target exists without valid installation metadata
- **WHEN** setup runs
- **THEN** directory existence authorizes adoption and setup writes current canonical metadata instead of requiring manual deletion

#### Scenario: US1 - Converge an existing OpenCode installation 3

- **GIVEN** metadata names the current package version but any managed asset, metadata field, plugin entry, or owned configuration value differs
- **WHEN** setup runs
- **THEN** setup repairs the full managed state automatically

#### Scenario: US1 - Converge an existing OpenCode installation 4

- **GIVEN** every current managed asset, metadata value, plugin entry, and owned configuration value matches
- **WHEN** setup runs again
- **THEN** it returns `complete` with `changed=false` and performs zero mutation

### Requirement: Verify current packed-package convergence

Packed-artifact verification MUST exercise global and project OpenCode convergence from older, newer, missing, malformed, and same-version-diverged metadata and assets, and MUST prove an exact repeated no-op without using the source checkout or a real user home.

#### Scenario: US1 - Converge an existing OpenCode installation 1

- **GIVEN** the canonical OpenCode managed asset target contains an older or newer package version
- **WHEN** setup runs without `--force`
- **THEN** setup replaces the complete managed directory and canonical plugin entry with the current package and reports `complete` with `changed=true`

#### Scenario: US1 - Converge an existing OpenCode installation 2

- **GIVEN** the managed asset target exists without valid installation metadata
- **WHEN** setup runs
- **THEN** directory existence authorizes adoption and setup writes current canonical metadata instead of requiring manual deletion

#### Scenario: US1 - Converge an existing OpenCode installation 3

- **GIVEN** metadata names the current package version but any managed asset, metadata field, plugin entry, or owned configuration value differs
- **WHEN** setup runs
- **THEN** setup repairs the full managed state automatically

#### Scenario: US1 - Converge an existing OpenCode installation 4

- **GIVEN** every current managed asset, metadata value, plugin entry, and owned configuration value matches
- **WHEN** setup runs again
- **THEN** it returns `complete` with `changed=false` and performs zero mutation

### Requirement: First Product Package MUST Exclude Deferred Runtime Surfaces

The default package and startup path MUST NOT require or automatically start a dashboard, observatory, HTTP service, graph engine, external database, embedding model, reranker, or LLM; experimental packages MAY be added later without becoming core dependencies.

#### Scenario: US1 - Resume useful project context in any supported coding agent 1

- **GIVEN** a project with prior durable memories and a supported host version
- **WHEN** a root session starts or resumes
- **THEN** the plugin supplies bounded, source-attributed recovery context through the shared lifecycle contract

#### Scenario: US1 - Resume useful project context in any supported coding agent 2

- **GIVEN** a host event that cannot be mapped safely
- **WHEN** the event is received
- **THEN** the plugin reports that capability as degraded without inventing success or disabling explicit MCP memory operations

#### Scenario: US7 - Ship only the first product boundary 1

- **GIVEN** the packed first-product artifact
- **WHEN** its required runtime inventory is validated
- **THEN** each of the three harnesses has hooks, MCP registration, and Skills that resolve to the same core

#### Scenario: US7 - Ship only the first product boundary 2

- **GIVEN** the installed first product
- **WHEN** it starts and serves MCP lifecycle operations
- **THEN** deferred dashboard, observatory, HTTP, and graph surfaces are neither required nor started
