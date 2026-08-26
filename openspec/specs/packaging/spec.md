# Packaging

## Requirements

### Requirement: Published Package MUST Contain Native Assets for All Three Harnesses

The packed release MUST expose a native OpenCode npm plugin entry plus repository-discoverable Codex and Claude Code marketplaces; each host path MUST provide one lifecycle-hook path, one registration path for the shared exact six-tool MCP server, and the v2 memory Skill over the same core version without requiring another host's loader topology.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US6 - Run native OpenCode hooks safely inside Bun 1

- **GIVEN** OpenCode loads the native plugin inside Bun
- **WHEN** a root lifecycle event requires persistence or recovery
- **THEN** the Bun bundle sends one bounded v2 JSON request to the package-relative `node dist/index.js lifecycle-v2` entry and never imports or instantiates `better-sqlite3` or `MemoryService` itself

#### Scenario: US6 - Run native OpenCode hooks safely inside Bun 2

- **GIVEN** Node is missing, exits nonzero, times out, or returns malformed output
- **WHEN** a lifecycle hook runs
- **THEN** thoth-mem fails closed without injecting unverified recovery and without rejecting the user's OpenCode prompt

### Requirement: Hook Execution MUST Use Portable Node Runners

OpenCode hook adapters MUST execute inside the Bun-loaded native package, but every SQLite-backed lifecycle operation MUST cross a bounded JSON-stdio boundary to the package-relative `node dist/index.js lifecycle-v2` entry without a receipt, CWD assumption, or child `npx`; Codex and Claude hooks plus MCP registration MUST enter through their root-relative portable runner, which resolves the exact pinned npm runtime for public installs or a verified absolute checkout build for explicit local development. The MCP descriptor MUST NOT bypass that provenance decision with a direct public-package command.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US6 - Run native OpenCode hooks safely inside Bun 1

- **GIVEN** OpenCode loads the native plugin inside Bun
- **WHEN** a root lifecycle event requires persistence or recovery
- **THEN** the Bun bundle sends one bounded v2 JSON request to the package-relative `node dist/index.js lifecycle-v2` entry and never imports or instantiates `better-sqlite3` or `MemoryService` itself

#### Scenario: US6 - Run native OpenCode hooks safely inside Bun 2

- **GIVEN** Node is missing, exits nonzero, times out, or returns malformed output
- **WHEN** a lifecycle hook runs
- **THEN** thoth-mem fails closed without injecting unverified recovery and without rejecting the user's OpenCode prompt

### Requirement: NPM Tarball MUST Include the Complete Integration Inventory

Packed verification MUST prove the native OpenCode main entry, CLI bin, canonical OpenCode Skill source, Codex/Claude marketplaces and shared plugin root, every declared hook/MCP/Skill/runner, and the exact shared core version; no host asset may resolve from the development checkout during public packed smoke.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US6 - Run native OpenCode hooks safely inside Bun 1

- **GIVEN** OpenCode loads the native plugin inside Bun
- **WHEN** a root lifecycle event requires persistence or recovery
- **THEN** the Bun bundle sends one bounded v2 JSON request to the package-relative `node dist/index.js lifecycle-v2` entry and never imports or instantiates `better-sqlite3` or `MemoryService` itself

#### Scenario: US6 - Run native OpenCode hooks safely inside Bun 2

- **GIVEN** Node is missing, exits nonzero, times out, or returns malformed output
- **WHEN** a lifecycle hook runs
- **THEN** thoth-mem fails closed without injecting unverified recovery and without rejecting the user's OpenCode prompt

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

Release verification MUST import the packed native OpenCode main, execute its packed CLI bin, exercise public exact-version and explicit local-file config planning plus Skill synchronization in disposable homes, and run Codex/Claude marketplace, lifecycle, and MCP smoke without reading real homes or resolving public runtime files from the source checkout. The removed `setup-v2` copied canary MUST NOT be exercised.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

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

The explicit integration synchronization command MUST copy the canonical Skill body into all three harness Skill roots, preserve the OpenCode reference in its native integration, copy the canonical Codex and Claude references into the shared public Codex/Claude plugin Skill, and leave every destination byte-stable on repeated execution.

#### Scenario: US3 - Ship one behaviorally consistent Skill 1

- **GIVEN** the canonical Skill changes
- **WHEN** integration assets are synchronized
- **THEN** the OpenCode, Codex, and Claude Code Skill bodies are byte-identical to the canonical body, every integration retains its own host reference, and the shared public Codex/Claude plugin retains byte-identical Codex and Claude references

#### Scenario: US3 - Ship one behaviorally consistent Skill 2

- **GIVEN** a distributed Skill omits semantic-boundary persistence, confirmation, identity ownership, or the progressive recall funnel
- **WHEN** package verification runs
- **THEN** it fails with a bounded contract error

#### Scenario: US3 - Ship one behaviorally consistent Skill 3

- **GIVEN** synchronization has already converged every Skill
- **WHEN** it runs again
- **THEN** it produces no content drift

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

OpenCode inspection MUST compare the packaged canonical thoth-mem Skill source with the exact globally synchronized `skills/thoth-mem` tree so missing, stale, extra, or linked managed entries are reported without scanning or claiming sibling Skills.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Keep rollback ownership bounded

OpenCode rollback MUST restore or remove only the exact prior thoth-mem plugin entry and receipt-owned `skills/thoth-mem` tree; it MUST preserve unrelated global Skills, config entries, comments, and later user changes.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Verify current packed-package convergence

Packed verification MUST exercise public exact-version and explicit local-file OpenCode convergence, Skill synchronization, duplicate/drift repair, unrelated-state preservation, exact repeated no-op, native plugin import, MCP startup, and lifecycle execution in disposable homes; it MUST also verify Codex/Claude native manager packages without mutating real homes.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

#### Scenario: US6 - Run native OpenCode hooks safely inside Bun 1

- **GIVEN** OpenCode loads the native plugin inside Bun
- **WHEN** a root lifecycle event requires persistence or recovery
- **THEN** the Bun bundle sends one bounded v2 JSON request to the package-relative `node dist/index.js lifecycle-v2` entry and never imports or instantiates `better-sqlite3` or `MemoryService` itself

#### Scenario: US6 - Run native OpenCode hooks safely inside Bun 2

- **GIVEN** Node is missing, exits nonzero, times out, or returns malformed output
- **WHEN** a lifecycle hook runs
- **THEN** thoth-mem fails closed without injecting unverified recovery and without rejecting the user's OpenCode prompt

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
