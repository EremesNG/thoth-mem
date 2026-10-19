# Delta for Packaging

## ADDED Requirements

None.

## MODIFIED Requirements

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

## REMOVED Requirements

None.

## Assumptions

- The published package continues to carry Codex integration descriptors and runtime assets even though the modern setup route delegates installation and cache ownership to Codex.
- Controlled Codex fixtures are authoritative automated acceptance evidence until a separately authorized real smoke run is available.
- Project-scoped manager operations are exercised only when the controlled capability fixture proves that scope; otherwise the legacy strategy is tested for that scope.
- Modern and legacy assets share one stable package/plugin identity and compatible runtime content rather than becoming independent release products.

## handoffHints

- Design MUST keep one canonical packaged identity while making modern manager consumption and legacy direct-copy consumption distinct.
- Design MUST ensure packed smoke fixtures cover modern, legacy, proven dual-state, ambiguous, project/global, repeat no-op, and executable-path variation cases.
- Design MUST keep automated Codex verification isolated and credential-free; real mutation remains a separate user-authorized gate.
- Design MUST preserve checkout independence and existing OpenCode/Claude packed-install coverage.

