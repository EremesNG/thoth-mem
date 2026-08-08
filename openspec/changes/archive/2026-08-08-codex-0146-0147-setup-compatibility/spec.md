# Feature Specification: Forced Codex version override

**Change ID**: `codex-0146-0147-setup-compatibility`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Operators running Codex versions outside thoth-mem's tested compatibility set need an explicit opt-in path to use a fully advertised and independently verifiable plugin-manager contract without weakening the safe default setup behavior.<br>
**Impact**: Codex setup preserves its current version gate by default. When the operator supplies `--force`, setup may bypass only that version gate, proceed through the existing evidence-gated plugin-manager flow, and render a bounded warning. Codex `0.146.x` and `0.147.x` are the required regression versions.<br>
**Affected capabilities**: `harness-integration`, `cli`

## User stories

### US1 - Force verified plugin-manager setup on newer Codex versions (Priority: P1)

As a thoth-mem operator using Codex `0.146.x` or `0.147.x`, I can explicitly pass `--force` so that setup uses the safely advertised plugin manager despite the untested version classification.

**Independent test**: Drive controlled global setup with `force=true` for each required minor, complete JSON-capable marketplace and plugin grammar, and absent or compatible manager state; assert `plugin_manager` selection and the normal evidence-derived result.

**Covers**: FR-001, FR-002, FR-004, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** Codex `0.146.x` advertises complete safe plugin-manager mutation and verification commands and exact manager state is classifiable, **When** setup runs with `--force`, **Then** it bypasses the version gate, selects `plugin_manager`, and emits a bounded warning instead of returning `requires_user_action` solely because of the version.
2. **Given** Codex `0.147.x` exposes the same complete safe contract, **When** setup runs with `--force`, **Then** it follows the same forced plugin-manager path and warning contract.
3. **Given** both marketplace and plugin state are already exactly present on either required newer minor, **When** setup runs with `--force`, **Then** it returns `complete` with `changed=false` and no manual recovery action.

### US2 - Keep the default version policy unchanged (Priority: P1)

As an operator who does not pass `--force`, I retain the existing fail-closed version behavior so that setup never silently expands its ownership policy.

**Independent test**: Run the same `0.146.x` and `0.147.x` controlled fixtures without force and compare strategy, status, diagnostics, manual actions, and mutation calls with the pre-change contract.

**Covers**: FR-003, SC-003

**Acceptance scenarios**:

1. **Given** Codex `0.146.x` or `0.147.x` is outside the tested compatibility set, **When** setup runs without `--force`, **Then** current version classification and strategy-selection behavior remains unchanged.
2. **Given** an untested version has compatible manager-owned state, **When** setup runs without `--force`, **Then** it still returns `requires_user_action` before mutation.
3. **Given** an untested version has safely absent manager state, **When** setup runs without `--force`, **Then** the existing legacy strategy behavior remains unchanged.

### US3 - Preserve every non-version safety gate (Priority: P1)

As an operator using `--force`, I can trust that the override does not create command, state, scope, cleanup, or ownership authority.

**Independent test**: Exercise forced accepted-version fixtures with missing grammar, malformed JSON, conflicting manager state, unsupported scope, and orphan ambiguity; assert none is promoted to successful modern setup.

**Covers**: FR-005, FR-006, FR-007, SC-004, SC-005, SC-006

**Acceptance scenarios**:

1. **Given** a forced Codex version lacks any required selected-scope mutation or verification capability, **When** setup classifies ownership, **Then** `--force` does not select `plugin_manager` from version override alone.
2. **Given** a forced version returns malformed, conflicting, or unclassifiable manager state, **When** setup evaluates the result, **Then** it retains fail-closed behavior and performs no unsafe cleanup or implicit legacy fallback.
3. **Given** forced modern setup needs no legacy filesystem changes, **When** an unrelated `config.toml` exists, **Then** output does not claim a configuration backup is required before mutation.

## Edge cases

- `--force` may bypass a tested-version allowlist mismatch or unknown version classification, but it cannot compensate for a failed version command, failed help/list probe, missing command grammar, or unverifiable state.
- Patch and prerelease versions remain governed by the existing parser; only the strategy's version-acceptance decision is overridable.
- Existing manager state that is partial may proceed only through independently planned, checkpointed, and reread operations.
- Existing manager or legacy residue ambiguity continues to outrank the non-blocking forced-version warning.
- The warning must not expose a home path, raw configuration, unrelated manager entries, or command output.
- `--force` must not authorize direct deletion, renaming, rewriting, or ownership inference for Codex-owned or legacy state.

## Functional requirements

- **FR-001 — Add an explicit version-gate override**: `[ADDED harness-integration]` When Codex setup is requested with `--force`, it MUST allow plugin-manager strategy selection without requiring the detected Codex version to belong to the tested compatibility set, provided all existing selected-scope capability and manager-state requirements are satisfied.
- **FR-002 — Proceed through the existing modern flow**: `[ADDED harness-integration]` A forced version override that proves complete safe mutation and independent verification capabilities and classifiable manager state MUST select and retain `plugin_manager`, and MUST derive `complete`, `partial`, `failed`, or `requires_user_action` from the existing operation and ambiguity evidence rather than rejecting solely because of version classification.
- **FR-003 — Preserve unforced setup behavior**: `[ADDED harness-integration]` When `--force` is absent, Codex setup MUST retain the existing tested-version classification, ownership strategy selection, status, diagnostics, manual actions, and mutation boundaries.
- **FR-004 — Render a bounded forced-version warning**: `[ADDED cli]` Human and JSON setup results that use the forced version override to select `plugin_manager` MUST include exactly one bounded diagnostic naming the detected Codex version when available and stating that the version gate was overridden in favor of verified plugin-manager capabilities, without changing the evidence-derived status or adding a manual action solely for the warning.
- **FR-005 — Preserve non-version safety and ownership gates**: `[ADDED harness-integration]` `--force` MUST NOT relax exact JSON or recognized legacy parsing, selected-scope capability verification, conflict classification, checkpointing, reconciliation, legacy ownership proof, containment, or the prohibition on implicit legacy fallback and direct manager-state cleanup.
- **FR-006 — Report only applicable mutation requirements**: `[ADDED cli]` Forced Codex setup MUST report manager-state inspection according to classified evidence and MUST emit the configuration-backup diagnostic only when the selected strategy actually plans a legacy configuration mutation.
- **FR-007 — Verify override behavior in isolated controlled execution**: `[ADDED cli]` Automated Codex setup verification MUST cover forced and unforced `0.146.x` and `0.147.x` through injected controlled executors, including compatible state, absent state, incomplete capability, and unsafe-state cases, without reading or mutating a real Codex home.

## Success criteria

- **SC-001** `[buildable]`: 100% of the four forced combinations formed by `0.146.x` and `0.147.x` with absent and compatible manager state select `plugin_manager` when complete safe capabilities are present.
- **SC-002** `[buildable]`: Both forced already-compatible required-minor cases return `complete`, `changed=false`, zero manual actions, and exactly one bounded forced-version diagnostic per result.
- **SC-003** `[buildable]`: 100% of paired unforced `0.146.x` and `0.147.x` regression cases retain their pre-change strategy, status, diagnostics, manual actions, and zero unexpected mutations.
- **SC-004** `[buildable]`: 100% of forced fixtures with incomplete capabilities, malformed or conflicting state, unsupported scope, or ownership ambiguity preserve the expected safe legacy or `requires_user_action` outcome and execute zero unauthorized mutations.
- **SC-005** `[buildable]`: Forced modern no-file-change results contain zero `Backup required before mutation` diagnostics, while the controlled legacy existing-config mutation case contains exactly one.
- **SC-006** `[buildable]`: Human and JSON renderings have zero mismatches in forced-version warning, final status, ordered steps, and manual actions across `0.146.x` and `0.147.x`.

## Assumptions

- The public `--force` flag already reaches the setup engine as `SetupRequest.force`; no new CLI option is required.
- Codex `0.146.x` is locally observable with the same complete structured marketplace and plugin contract parsed by thoth-mem.
- Codex `0.147.x` is validated through controlled contract fixtures unless a separately authorized disposable real-host smoke is provided.
- The public setup result schema remains unchanged; forced-version warnings use the existing `diagnostics` array.

## Dependencies

- Existing version parsing, help-based grammar discovery, selected-scope list verification, controlled command executor, setup result rendering, and setup test fixtures.

## Out of scope

- Adding `0.146.x`, `0.147.x`, or arbitrary future Codex minors to the default tested compatibility set.
- Letting `--force` authorize unsafe command shapes, ambiguous ownership, direct cleanup, or implicit legacy fallback.
- Changing marketplace or plugin identities, command shapes, receipt schemas, rollback ownership, or legacy asset contents.
- Mutating the user's real Codex home during automated verification.
- Changing OpenCode or Claude setup behavior.
