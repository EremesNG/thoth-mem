# Feature Specification: OpenCode managed setup convergence

**Change ID**: `opencode-managed-setup-convergence`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: Running `thoth-mem setup opencode` from a newly installed package currently rejects an existing managed OpenCode installation whenever its recorded package version differs, forcing manual deletion instead of performing the update the setup command owns.<br>
**Impact**: Global and project-scoped OpenCode setup will converge the canonical managed installation to the assets and configuration of the currently executing package. This is intentionally destructive inside the managed asset directory, permits both upgrades and downgrades, repairs same-version drift without `--force`, and removes durable rollback state after successful setup.<br>
**Affected capabilities**: `cli`, `packaging`

## User stories

### US1 - Converge an existing OpenCode installation (Priority: P1)

As an OpenCode user, I can run setup from the package version I intend to use so that an existing installation is upgraded, downgraded, adopted, or repaired without deleting plugin files manually.

**Independent test**: Run global and project-scoped setup against isolated targets containing older metadata, newer metadata, missing metadata, and same-version asset drift, then verify every target converges to the current package and a repeated run is a no-op.

**Covers**: FR-001, FR-002, FR-003, FR-010, SC-001, SC-006

**Acceptance scenarios**:

1. **Given** the canonical OpenCode managed asset target contains an older or newer package version, **When** setup runs without `--force`, **Then** setup replaces the complete managed directory and canonical plugin entry with the current package and reports `complete` with `changed=true`.
2. **Given** the managed asset target exists without valid installation metadata, **When** setup runs, **Then** directory existence authorizes adoption and setup writes current canonical metadata instead of requiring manual deletion.
3. **Given** metadata names the current package version but any managed asset, metadata field, plugin entry, or owned configuration value differs, **When** setup runs, **Then** setup repairs the full managed state automatically.
4. **Given** every current managed asset, metadata value, plugin entry, and owned configuration value matches, **When** setup runs again, **Then** it returns `complete` with `changed=false` and performs zero mutation.

### US2 - Survive interrupted replacement (Priority: P1)

As an operator, I can rerun setup after an I/O failure or process interruption so that the command restores a deterministic baseline and completes without manual filesystem surgery.

**Independent test**: Inject failures and interrupted journals at every OpenCode mutation boundary and verify immediate restoration, next-run restore-and-retry, invalid-journal discard, and exact post-state convergence.

**Covers**: FR-005, FR-006, FR-007, FR-008, SC-002, SC-004

**Acceptance scenarios**:

1. **Given** setup has begun replacing OpenCode state, **When** a filesystem mutation fails while the process remains alive, **Then** setup restores the complete pre-run state and returns `failed` without claiming completion.
2. **Given** a prior process stopped with a valid in-progress journal, **When** setup runs again, **Then** it restores the journal's verified pre-state and retries setup from a clean baseline.
3. **Given** an in-progress journal fails signature, path, topology, or hash validation, **When** setup runs again, **Then** it discards only canonical journal artifacts without following embedded paths and performs a fresh canonical installation.
4. **Given** setup verifies the new post-state, **When** completion succeeds, **Then** no durable OpenCode rollback receipt or pre-version backup for that target remains.
5. **Given** post-success cleanup cannot remove every journal or backup artifact, **When** setup renders its result, **Then** it returns `complete` with a bounded warning and retries canonical cleanup on the next run.

### US3 - Repair OpenCode configuration deterministically (Priority: P1)

As an OpenCode user, I can have setup restore its owned MCP activation while keeping recoverable evidence whenever unrelated configuration cannot be parsed.

**Independent test**: Exercise missing, valid JSON, valid JSONC, simultaneous JSON/JSONC, and malformed selected configuration fixtures and verify the selected file, preserved settings, backup, and canonical `mcp.thoth-mem` value.

**Covers**: FR-004, SC-003

**Acceptance scenarios**:

1. **Given** the selected OpenCode configuration parses successfully, **When** setup runs, **Then** it normalizes only `mcp.thoth-mem` and preserves unrelated settings.
2. **Given** both `opencode.json` and `opencode.jsonc` exist, **When** setup runs, **Then** it selects JSONC and leaves JSON unchanged.
3. **Given** the selected configuration is malformed, **When** setup runs, **Then** it persists a byte-exact non-colliding backup, recreates a minimal valid configuration containing canonical `mcp.thoth-mem`, and reports the backup path.

### US4 - Preview and verify destructive convergence (Priority: P2)

As an operator, I can preview and inspect setup results so that destructive replacement, recovery, cleanup, and host restart requirements are explicit and testable from a packed artifact.

**Independent test**: Compare plan, human, and JSON results from isolated source and packed-package fixtures while asserting plan mode writes nothing and changed results request an OpenCode restart.

**Covers**: FR-009, FR-011, SC-005, SC-007

**Acceptance scenarios**:

1. **Given** a target requires replacement or repair, **When** setup runs with `--plan`, **Then** it reports the selected config, whole managed-directory replacement, plugin-entry replacement, temporary recovery evidence, cleanup, and restart requirement while performing zero writes.
2. **Given** mutating setup changes OpenCode state successfully, **When** results are rendered, **Then** human and JSON output agree on `complete`, `changed=true`, bounded warnings, and the manual OpenCode restart action.
3. **Given** the current package lacks a required OpenCode source asset, **When** setup inspects the package, **Then** it fails before creating a journal, backup, or target mutation.

## Edge cases

- Metadata may be absent, malformed, legacy-named, current, older, or newer than the executing package.
- The canonical managed asset path may be missing, a regular file, a directory, a symlink, a junction, or another reparse-point-like entry.
- The managed directory may contain modified, missing, obsolete, or foreign files; successful convergence deletes all of them.
- The canonical plugin entry may be missing, stale, modified, linked, or unrelated; selected-scope setup replaces it.
- Both OpenCode config candidates may exist, and the selected JSONC file may itself be malformed.
- A malformed config backup path may already exist; setup must choose a non-colliding path and disclose it.
- A process may fail before journal creation, after any checkpoint, after post-state verification, or during cleanup.
- Receipt storage may contain valid, invalid, stale, or unrelated harness/scope/target receipts; cleanup must remain target-bounded.
- Packaged paths and targets may contain spaces and must work on Windows and POSIX systems.
- Concurrent setup attempts must remain serialized by the existing setup lock.

## Functional requirements

- **FR-001 — Converge installer-owned OpenCode state**: `[ADDED cli]` Global and project-scoped OpenCode setup MUST treat any existing canonical `.thoth-mem` asset-path entry as installer-owned and MUST converge it, the canonical `plugins/thoth-mem.js` entry, installation metadata, and `mcp.thoth-mem` configuration to the currently executing package without requiring metadata validity, receipt proof, manual deletion, or `--force`.
- **FR-002 — Repair every non-current state**: `[ADDED cli]` OpenCode setup MUST replace or repair its managed state for any package-version mismatch, including a downgrade, and for any same-version content or configuration divergence; it MUST mutate nothing only when the complete desired state already matches exactly.
- **FR-003 — Replace the whole managed asset target safely**: `[ADDED packaging]` Convergence MUST delete every prior entry inside the selected-scope managed asset target and install only the current packaged layout; if the target itself is a symlink, junction, or equivalent link, setup MUST remove the link without traversing or modifying its destination before creating a normal directory.
- **FR-004 — Select and repair configuration deterministically**: `[ADDED cli]` Setup MUST prefer `opencode.jsonc` when both config candidates exist, MUST preserve unrelated settings when the selected file parses, and MUST persist a byte-exact non-colliding backup before replacing a malformed selected file with a minimal valid configuration containing canonical `mcp.thoth-mem`.
- **FR-005 — Journal replacement before mutation**: `[ADDED cli]` Before the first OpenCode mutation, setup MUST durably persist target-bounded temporary journal and backup evidence sufficient to restore every selected pre-run state; an in-process failure MUST restore that state before returning `failed` whenever restoration remains possible.
- **FR-006 — Recover interrupted setup automatically**: `[ADDED cli]` A subsequent setup run MUST validate any canonical in-progress OpenCode journal, restore its verified pre-state, and retry from a clean baseline; an invalid journal MUST be discarded without following any embedded path before a fresh canonical installation proceeds.
- **FR-007 — Remove durable rollback state after success**: `[ADDED cli]` After exact post-state verification, setup MUST remove temporary journal data plus all prior setup receipts and backups bound to the same OpenCode harness, scope, and target so no successful OpenCode setup retains a usable durable rollback to the prior installation.
- **FR-008 — Degrade cleanup without false installation failure**: `[ADDED cli]` If verified setup succeeds but target-bounded receipt or backup cleanup is incomplete, setup MUST still return `complete`, MUST emit a bounded warning naming only safe cleanup context, and MUST retry cleanup before declaring a later no-op.
- **FR-009 — Preserve truthful planning and results**: `[ADDED cli]` Plan mode MUST report deterministic convergence, recovery, cleanup, and restart actions with zero writes; a changed successful result MUST request an OpenCode restart without attempting process control, while an exact no-op MUST return `complete` with `changed=false` and no restart action.
- **FR-010 — Verify current packed-package convergence**: `[ADDED packaging]` Packed-artifact verification MUST exercise global and project OpenCode convergence from older, newer, missing, malformed, and same-version-diverged metadata and assets, and MUST prove an exact repeated no-op without using the source checkout or a real user home.
- **FR-011 — Preflight authoritative package assets**: `[INTERNAL]` Setup MUST validate every required current OpenCode package asset and canonical target boundary before creating recovery state or mutating configuration, plugin entries, assets, or metadata.

## Success criteria

- **SC-001** `[buildable]`: Focused setup tests cover both scopes and at least older-version, newer-version, missing-metadata, malformed-metadata, same-version-drift, and exact-current fixtures; every non-current fixture converges with `changed=true`, and every repeated exact run returns `changed=false`.
- **SC-002** `[buildable]`: Failure-injection tests at every OpenCode mutation checkpoint restore the byte-equivalent pre-run state, and valid interrupted journals restore then retry successfully while invalid journals are discarded without traversing embedded paths.
- **SC-003** `[buildable]`: All configuration tests pass while proving JSONC precedence, unrelated-setting preservation for parseable input, byte-exact backup plus minimal recreation for malformed input, and canonical `mcp.thoth-mem` verification.
- **SC-004** `[buildable]`: A successful OpenCode setup leaves zero usable receipts or pre-version backups for its target; injected cleanup failure still returns `complete` with a warning and a later run removes the residue.
- **SC-005** `[buildable]`: Plan snapshots prove zero writes and enumerate replacement/recovery/cleanup/restart actions; human and JSON changed results agree and expose the restart action.
- **SC-006** `[buildable]`: Packed-install tests update an isolated prior-release-shaped OpenCode target using only tarball assets, verify the complete current layout and metadata, and prove at least 1 immediate repeated packed setup run is a no-op.
- **SC-007** `[buildable]`: Focused setup, rollback/recovery, and packed-install suites pass together with `pnpm run build` and the full `pnpm test` suite.

## Assumptions

- The canonical `.thoth-mem` asset target and `plugins/thoth-mem.js` entry are exclusively owned by thoth-mem setup within the selected global or project OpenCode scope.
- The package executing setup is the user's authoritative desired version; replacing a newer installed version with an older executing package is intentional.
- The current package contents, not a network registry or historical manifest, define the desired installed layout.
- A durable backup of malformed unrelated OpenCode configuration is required even though successful plugin setup retains no durable version rollback.
- Existing setup locking remains the concurrency boundary for inspection, recovery, mutation, verification, and cleanup.

## Dependencies

- Existing OpenCode setup inspection, configuration merge, filesystem transaction, setup lock, signed receipt/journal, and packed-install verification infrastructure.
- Current packaged OpenCode plugin, shared runtime assets, and bundled skill inventory.

## Out of scope

- Changing Codex or Claude Code setup, ownership, receipt, or rollback behavior.
- Downloading or resolving updates from a registry or network endpoint.
- Preserving files inside the canonical OpenCode managed asset directory.
- Retaining post-success OpenCode rollback receipts or backups.
- Automatically stopping or restarting OpenCode processes.
- Mutating shared user skill directories outside the managed plugin asset target.
