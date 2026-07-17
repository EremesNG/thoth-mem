# Packaging

## Requirements

### Requirement: Published Package MUST Contain Native Assets for All Three Harnesses
The published thoth-mem package MUST contain complete, host-discoverable integration assets for OpenCode, Codex, and Claude Code. OpenCode assets MUST support `thoth-mem setup opencode`; Codex assets MUST provide the marketplace/plugin identity and runtime content required by Codex plugin-manager installation and the packaged content required by the explicit legacy fallback; and Claude Code assets MUST support repository marketplace registration followed by `claude plugin install thoth-mem`. Modern Codex setup MUST make Codex consume and own its manager-installed content, while only the legacy strategy MAY direct-copy the packaged fallback content.

#### Scenario: OpenCode assets are discoverable
- GIVEN the published package is installed without a repository checkout
- WHEN OpenCode setup resolves its packaged integration
- THEN every required OpenCode manifest, hook, adapter asset, runner, and instruction MUST be present
- AND setup MUST resolve them from the installed package

#### Scenario: Modern Codex plugin identity is discoverable
- GIVEN the published package or controlled marketplace fixture is available without the development checkout
- WHEN a compatible Codex plugin manager resolves thoth-mem
- THEN the expected marketplace, plugin manifest, hook, skill, runner, and MCP declaration MUST be discoverable under the exact thoth-mem identity
- AND the Codex MCP descriptor MUST contain exactly one `mcpServers.thoth-mem` entry with command `thoth-mem` and args `["mcp", "--no-http"]`
- AND thoth-mem setup MUST NOT need to copy that manager-installed content into the legacy direct-install target

#### Scenario: Legacy Codex fallback assets are discoverable
- GIVEN plugin management is unavailable for the selected Codex version or scope
- WHEN `thoth-mem setup codex` selects the legacy strategy from an installed package
- THEN every asset required by the legacy installation MUST be present in the package
- AND setup MUST resolve those assets without a development checkout

#### Scenario: Claude marketplace and plugin assets are discoverable
- GIVEN the repository or a packed repository fixture is registered as a Claude Code marketplace
- WHEN `claude plugin install thoth-mem` resolves the plugin
- THEN the marketplace and plugin manifests MUST identify a valid thoth-mem plugin
- AND every declared hook, runner, skill, and adapter asset MUST be present at its declared packaged path

#### Scenario: Modern and legacy identities cannot diverge
- GIVEN the packed manager-facing descriptors and legacy fallback assets identify thoth-mem
- WHEN package integrity verification compares their version and stable content identity
- THEN the identities MUST be compatible with the packed package version
- AND verification MUST fail if the strategies would install conflicting plugin identities or runtime content

### Requirement: Hook Execution MUST Use Portable Node Runners
Every packaged harness hook MUST invoke a Node.js runner compatible with the package runtime floor and MUST NOT require Bash, PowerShell, a repository checkout, or the caller's current working directory. Runner resolution MUST work from global and project installations on Windows and POSIX systems, including paths containing spaces.

#### Scenario: Runner works from an unrelated working directory
- GIVEN a packed artifact is installed and the caller's current working directory is outside the package and target project
- WHEN a harness invokes a declared hook
- THEN the Node runner MUST resolve all required packaged assets
- AND it MUST NOT read a repository-relative runtime dependency

#### Scenario: Windows path with spaces is supported
- GIVEN the package or harness home is installed at a Windows path containing spaces
- WHEN a packaged hook invokes its runner
- THEN the intended Node runner MUST execute with intact arguments
- AND no PowerShell- or command-shell-specific wrapper MUST be required

#### Scenario: POSIX path with spaces is supported
- GIVEN the package or harness home is installed at a POSIX path containing spaces
- WHEN a packaged hook invokes its runner
- THEN the intended Node runner MUST execute with intact arguments
- AND no Bash-specific wrapper MUST be required

### Requirement: NPM Tarball MUST Include the Complete Integration Inventory
The npm tarball MUST include every manifest, marketplace descriptor, plugin descriptor, hook declaration, skill, adapter entry point, Node runner, setup asset, and packaged instruction required by the three native integrations. Package-content verification MUST evaluate one canonical inventory whose entries each contain exactly one harness owner (`opencode`, `codex`, `claude`), one role, and one unique package-relative path. Every runtime-declared asset MUST appear exactly once in that inventory, and every inventory entry MUST exist in the tarball. Codex MCP verification MUST require a top-level `mcpServers` object containing exactly one `thoth-mem` server and MUST reject flat root declarations. Verification MUST fail for a missing, duplicate, undeclared, or extra required runtime asset or when a declared runtime path resolves outside the tarball.

#### Scenario: Complete tarball passes inventory verification
- GIVEN the package is packed using the release packaging flow
- WHEN package-content verification inspects the tarball
- THEN every required integration inventory item for OpenCode, Codex, and Claude Code MUST be present
- AND every declared runtime path MUST resolve to an item inside the unpacked artifact

#### Scenario: Missing asset fails packaging verification
- GIVEN a required hook runner or manifest is omitted from the tarball
- WHEN package-content verification runs
- THEN verification MUST fail
- AND it MUST identify the missing harness, asset, and declared path

#### Scenario: Source-tree-only asset is rejected
- GIVEN a manifest references a file that exists in the repository but is excluded from the tarball
- WHEN package-content verification runs against the packed artifact
- THEN verification MUST fail
- AND source-tree presence MUST NOT satisfy the packed-artifact requirement

#### Scenario: Canonical inventory rejects duplicate or undeclared runtime assets
- GIVEN two inventory entries use the same package-relative path or a manifest declares a runtime asset absent from the inventory
- WHEN package-content verification runs
- THEN verification MUST fail
- AND it MUST identify the duplicate or undeclared path and owning harness

### Requirement: Manifest Versions and Paths MUST Be Internally Consistent
Every version-bearing native manifest MUST equal the packed `package.json` version exactly, and every manifest path MUST resolve to the intended asset within the package or marketplace root. Both normalized lexical paths and resolved real paths after following links MUST remain within the applicable root. Packaging verification MUST reject version ranges, stale versions, missing targets, absolute checkout paths, lexical traversal, link-based escapes, and harness declarations that disagree about the installed plugin identity.

#### Scenario: Versions and plugin identity agree
- GIVEN a thoth-mem package tarball and its native manifests
- WHEN integrity verification runs
- THEN every version-bearing manifest MUST match or explicitly declare compatibility with the package version
- AND every harness MUST identify the integration as thoth-mem

#### Scenario: Stale version is rejected
- GIVEN a native manifest declares an incompatible or stale thoth-mem version
- WHEN integrity verification runs
- THEN verification MUST fail
- AND it MUST identify the manifest and conflicting versions

#### Scenario: Escaping or absolute checkout path is rejected
- GIVEN a native manifest declares an absolute repository path or a relative path that escapes the package or marketplace root
- WHEN integrity verification runs
- THEN verification MUST fail
- AND the unsafe path MUST NOT be executed during smoke testing

#### Scenario: Link-based path escape is rejected
- GIVEN a declared package-relative asset resolves through a link to a target outside the package or marketplace root
- WHEN integrity verification runs
- THEN verification MUST fail
- AND the external target MUST NOT be executed or accepted as packaged content

### Requirement: Installation Smoke Tests MUST Execute From the Packed Artifact
Release verification MUST install and exercise the actual npm tarball in isolated harness homes and project directories. Automated smoke tests MUST use controlled filesystem and command-executor fixtures for Codex and MUST NOT mutate a real personal/global Codex installation. They MUST prove OpenCode global and project setup, modern and legacy Codex ownership behavior, dual-state migration and idempotency, Codex global/project scope confinement, and Claude Code marketplace/plugin installation without resolving runtime files from the source checkout. A real Codex smoke mutation MAY run only after separate explicit user authorization and MUST use disposable controlled homes/projects.

#### Scenario: OpenCode installs globally from the tarball
- GIVEN an isolated clean OpenCode home and an installed thoth-mem tarball
- WHEN `thoth-mem setup opencode` runs
- THEN setup MUST verify a global installation using only packed assets
- AND an identical second run MUST be a verified no-op

#### Scenario: OpenCode installs only in explicit project scope
- GIVEN an isolated project and clean global OpenCode home
- WHEN OpenCode setup runs for that explicit project scope from the tarball
- THEN all managed installation state MUST remain inside the project scope
- AND the global OpenCode home MUST remain unchanged

#### Scenario: Controlled modern Codex setup uses manager ownership
- GIVEN an isolated Codex home, a controlled modern Codex capability fixture, and an installed thoth-mem tarball
- WHEN global or supported project-scoped Codex setup runs
- THEN it MUST verify the manager-owned marketplace and installed-and-enabled plugin state
- AND it MUST create no legacy direct-copy directory or legacy activation block
- AND an identical second run MUST be a verified no-op

#### Scenario: Controlled legacy Codex setup uses packaged fallback assets
- GIVEN an isolated Codex home, a controlled fixture without safe plugin management for the selected scope, and an installed thoth-mem tarball
- WHEN Codex setup runs
- THEN it MUST install and verify only the explicit legacy-owned state using packed assets
- AND an identical second run MUST be a verified no-op

#### Scenario: Controlled dual-owned fixture migrates safely
- GIVEN an isolated usable dual-owned Codex fixture with verified manager state and provably thoth-owned legacy state
- WHEN Codex setup runs without force
- THEN it MUST preserve manager-owned and unrelated state
- AND it MUST remove only proven legacy state after the required checkpoint
- AND a repeated run MUST verify a modern no-op

#### Scenario: Controlled ambiguous migration performs zero mutation
- GIVEN an isolated Codex fixture contains a legacy lookalike whose ownership cannot be proven
- WHEN Codex setup runs with or without `--force`
- THEN it MUST return `requires_user_action` before migration mutation
- AND the complete controlled filesystem and manager state MUST remain unchanged

#### Scenario: Project-scoped Codex verification leaves global state unchanged
- GIVEN an isolated project and isolated global Codex home
- WHEN a controlled project-scoped modern or legacy setup runs
- THEN every direct filesystem mutation MUST remain within the project scope
- AND global Codex state MUST remain unchanged except for an explicitly selected and supported project-scoped manager operation

#### Scenario: Executable-path variation does not create false legacy drift
- GIVEN a packed legacy installation is verified through one executable path
- AND the repeat setup uses a different controlled shim path with the same package/content identity
- WHEN the packed setup is repeated
- THEN it MUST return a verified no-op
- AND it MUST not rewrite the installation solely because the executable path changed

#### Scenario: Claude plugin installs from repository marketplace assets
- GIVEN an isolated Claude Code home and the packaged marketplace repository fixture
- WHEN the marketplace is added and `claude plugin install thoth-mem` runs
- THEN Claude Code MUST validate and install the thoth-mem plugin
- AND its declared hooks MUST resolve portable Node runners without the development checkout

#### Scenario: Packed installation detects external checkout dependency
- GIVEN a smoke environment cannot access the development repository
- WHEN any integration attempts to load a non-packed runtime file
- THEN the smoke test MUST fail
- AND it MUST identify the referencing harness and unresolved path

#### Scenario: Automated Codex verification never mutates a real home
- GIVEN automated package verification runs in a developer or CI environment
- WHEN Codex ownership and migration scenarios execute
- THEN they MUST use isolated controlled homes and injected or controlled command behavior
- AND they MUST NOT read credentials from or mutate a real personal/global Codex installation

#### Scenario: Real Codex smoke requires explicit authorization
- GIVEN deterministic controlled verification has passed
- WHEN a real Codex mutation smoke test is considered
- THEN it MUST NOT run without separate explicit user authorization
- AND any authorized run MUST target disposable controlled global and project homes

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
