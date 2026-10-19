# Feature Specification: Portable PR Verification

**Change ID**: `fix-pr-21-linux-ci-portability`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: PR #21 fails its Ubuntu `verify` job even though most affected checks pass on the Windows development host. The verification code and fixtures currently assume a sibling marketplace checkout, one Windows-specific npm installation layout and response shape, Windows-like fixture paths, and an environment without an ambient XDG configuration root.<br>
**Impact**: Packaging smoke, marketplace publication tests, public-runner tests, and native-manager tests will become self-contained and portable across the supported Node runtime on Windows and Linux. Product runtime contracts, package contents, marketplace publication behavior, lifecycle identity validation, and setup ownership remain unchanged.<br>
**Affected capabilities**: `packaging`

## User stories

### US1 - Verify the packed package on supported hosts (Priority: P1)

As a maintainer, I can run the package boundary and packed smoke checks on Windows or Linux so that a valid release is not rejected by host-specific npm assumptions.

**Independent test**: Run the packaging boundary and public marketplace smoke suites with the active supported Node/npm installation and verify that packing, inventory inspection, installation, CLI cold start, and all three lifecycle fixtures complete from disposable state.

**Covers**: FR-001, FR-004, SC-001, SC-004

**Acceptance scenarios**:

1. **Given** npm is installed in the normal Windows layout or the normal Unix global layout, **When** packed verification locates and invokes npm, **Then** it finds a real CLI without assuming it is below the Node executable's `bin` directory.
2. **Given** `npm pack --json` returns either the supported array envelope or keyed package object envelope, **When** verification reads the result, **Then** it identifies exactly one package record and validates its filename and file inventory.
3. **Given** disposable host homes and a freshly packed tarball, **When** the smoke runner exercises OpenCode, Codex, and Claude Code, **Then** no real user home is read or mutated and every lifecycle/MCP assertion passes.

### US2 - Exercise lifecycle and setup with host-native fixtures (Priority: P1)

As a maintainer, I can run identity and setup tests under either path model and ambient environment so that fixtures measure the production contract instead of leaking assumptions from the development machine.

**Independent test**: Run the public plugin runner and native manager suites with platform-native disposable paths and explicitly isolated configuration roots, then verify the same identity-only degradation, recovery, receipt, and local-runtime expectations.

**Covers**: FR-002, FR-004, SC-002, SC-004

**Acceptance scenarios**:

1. **Given** a platform-native nonexistent absolute fixture directory, **When** the public runner validates lifecycle identity, **Then** the expected `path:` key is derived from that same normalized absolute directory on Windows and Linux.
2. **Given** the process has an unrelated ambient `XDG_CONFIG_HOME`, **When** a native-manager test targets a disposable home, **Then** its explicit isolated environment keeps provider configuration and journals inside that disposable home.
3. **Given** an invalid or incomplete lifecycle identity, **When** the runner degrades, **Then** it still injects no unverified memory and preserves the established bounded fallback behavior.

### US3 - Test marketplace publication without a sibling checkout (Priority: P1)

As a maintainer, I can run release publication tests in a clean single-repository checkout so that CI does not require an untracked neighboring `thoth-plugins` repository.

**Independent test**: Run `tests/release-marketplace.test.ts` from a checkout whose parent contains no marketplace repository and verify publication, idempotent retry, missing-tag rejection, and push-race rejection against a disposable synthetic central repository.

**Covers**: FR-003, FR-004, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** only the thoth-mem checkout, **When** the release test constructs its central fixture, **Then** it creates the required catalog scripts, descriptors, registry, and tests entirely beneath a disposable directory.
2. **Given** thoth-mem and thoth-agents entries in the synthetic registry, **When** thoth-mem publication succeeds, **Then** only the three owned catalog files change and the thoth-agents entry remains byte-equivalent in meaning.
3. **Given** a missing tag or concurrent central push, **When** publication runs, **Then** the existing fail-closed and non-force-push behavior remains covered.

## Edge cases

- npm is available but its CLI is installed under a Unix `lib/node_modules` prefix instead of beside `node.exe`.
- npm changes only the top-level JSON envelope while retaining the package record fields needed by verification.
- A pack command succeeds but returns zero or multiple package records.
- A Windows-looking string is not an absolute path on a Unix host.
- The CI process exports `XDG_CONFIG_HOME`, while a test also supplies a disposable `homeDir`.
- The repository is checked out without the optional sibling `thoth-plugins` development repository.

## Functional requirements

- **FR-001 — Packed Verification MUST Exercise Every Host in Disposable State**: `[MODIFIED packaging]` Release verification MUST continue to import the native OpenCode entry, execute the CLI, validate public and local setup, synchronize Skills, cold-start MCP, and execute lifecycle runners for OpenCode, Codex, and Claude Code without reading or mutating real user homes. It MUST run on supported Windows and Linux Node installations without assuming one platform-specific npm CLI layout, MUST accept only recognized single-record `npm pack --json` envelopes, and MUST fail clearly when the CLI or package record is unavailable or ambiguous.
- **FR-002 — Platform-Native Lifecycle and Setup Fixtures**: `[INTERNAL]` Cross-platform tests MUST derive expected path identities from platform-native disposable absolute paths and MUST explicitly isolate configuration environment variables whenever they assert files beneath a supplied disposable home.
- **FR-003 — Self-Contained Marketplace Publication Fixture**: `[INTERNAL]` Marketplace publication tests MUST synthesize the minimal valid central catalog inside their disposable root and MUST NOT read a sibling checkout, network resource, real marketplace, or user-owned configuration.
- **FR-004 — Preserve Existing Runtime and Release Semantics**: `[INTERNAL]` The correction MUST preserve package inventory, public/local runtime provenance, verified identity fail-closed behavior, native-manager ownership and recovery, tag-first marketplace publication, catalog-only idempotency, and normal non-force push rejection.

## Success criteria

- **SC-001** `[buildable]`: `tests/packaging/first-product.test.ts` and `tests/integration/public-marketplace-smoke.test.ts` pass while accepting the supported npm pack envelopes and rejecting missing, empty, or ambiguous results.
- **SC-002** `[buildable]`: Every test in `tests/integration/public-plugin-runner.test.ts` and `tests/setup/native-managers.test.ts` passes with expected path/config locations computed from isolated platform-native fixtures rather than host-specific literals or ambient XDG state.
- **SC-003** `[buildable]`: Every test in `tests/release-marketplace.test.ts` passes with no sibling `thoth-plugins` directory and still proves the exact three-file update, unaffected adjacent plugin entry, idempotent retry, missing-tag rejection, and push-race failure.
- **SC-004** `[buildable]`: The focused five-suite reproduction passes, followed by `pnpm run build`, `pnpm test`, `pnpm run integration:verify`, `pnpm run integration:smoke`, `pnpm run benchmark:fixture`, `pnpm run prepublishOnly`, and `git diff --check`, with no product runtime or package inventory regression.

## Assumptions

- Node `>=22.12.0` remains the supported runtime floor; the fix may normalize compatible npm JSON envelopes but does not promise compatibility with arbitrary malformed output.
- `XDG_CONFIG_HOME` remains authoritative production input when provided. Tests that intend `homeDir/.config` own the responsibility to supply an isolated environment.
- A platform-native nonexistent absolute path is sufficient to exercise non-Git `path:` identity without weakening production identity verification.

## Dependencies

- Existing `npm pack` semantics, pinned pnpm installation, Vitest, Git, and disposable filesystem helpers already used by the repository.
- Existing central catalog contract exercised by `scripts/publish-marketplace.mjs`; no network access or real catalog clone is required for tests.

## Out of scope

- Changing the six MCP tools, SQLite schema, retrieval behavior, lifecycle payloads, setup commands, or package inventory.
- Changing marketplace release ownership, repository URLs, tag ordering, force-push policy, or real central catalog contents.
- Adding a new package manager dependency or supporting Node versions below the declared engine floor.
- Pushing commits, rerunning remote CI, publishing a package, or executing a real marketplace release as part of local implementation.
