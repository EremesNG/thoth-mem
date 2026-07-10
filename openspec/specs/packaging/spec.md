# Packaging

## Requirements

### Requirement: Published Package MUST Contain Native Assets for All Three Harnesses
The published thoth-mem package MUST contain complete, host-discoverable integration assets for OpenCode, Codex, and Claude Code. OpenCode assets MUST support `thoth-mem setup opencode`; Codex assets MUST support `thoth-mem setup codex`; and Claude Code assets MUST support repository marketplace registration followed by `claude plugin install thoth-mem`.

#### Scenario: OpenCode assets are discoverable
- GIVEN the published package is installed without a repository checkout
- WHEN OpenCode setup resolves its packaged integration
- THEN every required OpenCode manifest, hook, adapter asset, runner, and instruction MUST be present
- AND setup MUST resolve them from the installed package

#### Scenario: Codex assets are discoverable
- GIVEN the published package is installed without a repository checkout
- WHEN Codex setup resolves its packaged integration
- THEN every required Codex plugin, hook, skill, adapter asset, runner, and instruction MUST be present
- AND setup MUST resolve them from the installed package

#### Scenario: Claude marketplace and plugin assets are discoverable
- GIVEN the repository or a packed repository fixture is registered as a Claude Code marketplace
- WHEN `claude plugin install thoth-mem` resolves the plugin
- THEN the marketplace and plugin manifests MUST identify a valid thoth-mem plugin
- AND every declared hook, runner, skill, and adapter asset MUST be present at its declared packaged path

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
The npm tarball MUST include every manifest, marketplace descriptor, plugin descriptor, hook declaration, skill, adapter entry point, Node runner, setup asset, and packaged instruction required by the three native integrations. Package-content verification MUST evaluate one canonical inventory whose entries each contain exactly one harness owner (`opencode`, `codex`, `claude`), one role, and one unique package-relative path. Every runtime-declared asset MUST appear exactly once in that inventory, and every inventory entry MUST exist in the tarball. Verification MUST fail for a missing, duplicate, undeclared, or extra required runtime asset or when a declared runtime path resolves outside the tarball.

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
Release verification MUST install and exercise the actual npm tarball in isolated harness homes and project directories. Smoke tests MUST prove OpenCode global and project setup, Codex global and project setup result handling, and Claude Code marketplace/plugin installation without resolving runtime files from the source checkout.

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

#### Scenario: Codex setup exercises packed assets and explicit result states
- GIVEN an isolated Codex home, a controlled Codex CLI capability fixture, and an installed thoth-mem tarball
- WHEN `thoth-mem setup codex` runs
- THEN setup MUST resolve only packed integration assets
- AND the observed result MUST be one of `complete`, `partial`, or `requires_user_action` according to independently verified steps

#### Scenario: Codex project scope leaves global state unchanged
- GIVEN an isolated project and clean global Codex home
- WHEN Codex setup runs for that explicit project scope from the tarball
- THEN managed filesystem state MUST remain inside the project scope
- AND global Codex configuration MUST remain unchanged except for explicitly selected external registration operations

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
