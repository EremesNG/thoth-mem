# Feature Specification: Central Thoth plugin marketplace

**Change ID**: `centralize-thoth-plugin-marketplace`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: Codex can currently collapse the repeated marketplace/plugin name in a valid native cache path, so an agent first probes a nonexistent `SKILL.md` path before recovering. A single neutral Thoth marketplace also needs to remain aligned with independently versioned plugin releases without manual edits.<br>
**Impact**: Codex and Claude Code will register the remote `thoth-plugins` marketplace and install `thoth-mem` or `thoth-agents` from it. The marketplace keeps the host-required `$MARKETPLACE/$PLUGIN/$VERSION` topology, pins each plugin independently, and is updated by each repository's release flow only after its release tag exists. Each product's Codex CLI installer treats a stopped Codex host as an explicit precondition and, only after verifying its central installation, removes that product's exact legacy registrations, plugin cache, and marketplace snapshot while preserving the sibling product and unrelated state.<br>
**Affected capabilities**: `cli`, `packaging`

## User stories

### US1 - Resolve an installed Skill on the first path (Priority: P1)

As a coding agent, I can load a Thoth Skill from an unambiguous native cache path so that the session does not begin with a failed filesystem probe and recovery narrative.

**Independent test**: Install `thoth-mem@thoth-plugins` into disposable Codex state, catalog the installed Skill, and confirm that a fresh agent read targets the catalog-provided path containing distinct marketplace and plugin segments.

**Covers**: FR-001, FR-002, FR-004, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** marketplace `thoth-plugins`, plugin `thoth-mem`, and version `0.4.13`, **When** Codex derives the installed Skill path, **Then** it resolves `cache/thoth-plugins/thoth-mem/0.4.13/skills/thoth-mem/SKILL.md` without first probing a path that omits the plugin segment.
2. **Given** marketplace `thoth-plugins`, plugin `thoth-agents`, and an independently selected plugin version, **When** Codex or Claude Code installs it, **Then** the host retains `thoth-plugins` and `thoth-agents` as separate adjacent cache segments.

### US2 - Install either plugin from one canonical catalog (Priority: P1)

As an operator, I can register one Thoth marketplace in Codex or Claude Code and install either native plugin so that marketplace provenance and plugin identity are consistent across hosts.

**Independent test**: Run the native setup planners and disposable manager tests for both repositories and assert the remote catalog source plus the exact plugin identifiers `thoth-mem@thoth-plugins` and `thoth-agents@thoth-plugins`.

**Covers**: FR-001, FR-004, FR-005, FR-006, SC-003

**Acceptance scenarios**:

1. **Given** a host with no Thoth marketplace, **When** thoth-mem managed setup runs, **Then** it registers `https://github.com/EremesNG/thoth-plugins.git` as `thoth-plugins` and installs only `thoth-mem@thoth-plugins`.
2. **Given** the same canonical marketplace, **When** thoth-agents managed setup runs, **Then** it reuses or repairs that registration and installs only `thoth-agents@thoth-plugins`.
3. **Given** Codex and Claude Code on the same machine, **When** both setups complete, **Then** each host uses the internal marketplace name `thoth-plugins` while retaining its own native manager state.
4. **Given** Codex CLI `0.151.x` with the complete inspected native-manager capability contract, **When** thoth-mem setup runs without an override, **Then** it accepts the host; another Codex version fails closed unless an explicit force override verifies that same complete capability contract.
5. **Given** Windows has an npm `codex.cmd` for `0.151.x` earlier in `PATH` and a Desktop `codex.exe` for an older version later in `PATH`, **When** thoth-mem invokes the implicit `codex` command from Node, **Then** it observes the same command selected by `cmd.exe` rather than bypassing the earlier shim for the later executable.

### US3 - Publish a plugin version without manual catalog drift (Priority: P1)

As a maintainer, I can run a plugin repository's existing `release:*` command and have its central catalog entry published safely so that the two plugin versions remain current and independent.

**Independent test**: Against disposable local bare remotes, release one plugin version, verify that its tag is reachable before the catalog commit, and assert that only its two host entries changed while the other plugin version remained byte-equivalent.

**Covers**: FR-003, FR-004, FR-007, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** thoth-mem and thoth-agents at different versions, **When** thoth-mem completes `release:patch`, **Then** the source tag is pushed first and both central descriptors advance only the thoth-mem entry to that exact version and tag.
2. **Given** the plugin tag or packaged plugin manifest is absent or inconsistent, **When** catalog synchronization runs, **Then** it fails before committing or pushing a central catalog change.
3. **Given** the plugin tag was pushed but central publication failed, **When** the maintainer runs the dedicated catalog synchronization command again, **Then** it converges idempotently without creating another plugin version or tag.

### US4 - Retire owned legacy Codex state safely (Priority: P2)

As an existing operator, I can run either product's CLI with Codex closed and converge to only its central marketplace identity so that stale paths cannot remain discoverable.

**Independent test**: Seed a disposable Codex manager and filesystem with the product's old marketplace registrations, plugin snapshot, orphan cache, and unrelated entries; run setup; then verify the central installation first, exact owned legacy removal second, and byte-identical sibling/unrelated state. A simulated cleanup failure must retain the verified central installation and converge on retry.

**Covers**: FR-001, FR-006, SC-006

**Acceptance scenarios**:

1. **Given** `thoth-mem`, `thoth-mem-codex`, `thoth-agents`, or `thoth-agents-codex` residue and a stopped Codex host, **When** the corresponding product setup verifies its central plugin, **Then** it removes only that product's exact legacy plugin IDs and marketplace registrations through Codex and removes only still-orphaned exact product cache/snapshot roots beneath the resolved `CODEX_HOME`.
2. **Given** an existing central or legacy marketplace whose name has different provenance, **When** setup inspects it, **Then** setup fails closed before cleanup rather than silently replacing, trusting, or deleting it.
3. **Given** cleanup fails after the central installation is verified, **When** setup returns, **Then** it reports a bounded close-Codex-and-retry action, retains the central installation, and completes idempotently on a later retry.

## Edge cases

- One source repository has a valid release tag while its plugin manifest or Skill inventory reports a different version.
- A catalog update succeeds locally but its remote push is rejected; retry must not bump or retag the plugin.
- Two release processes update different plugin entries concurrently; a non-fast-forward retry must rebase or re-read and preserve the other entry rather than overwrite it.
- A native manager already maps `thoth-plugins` to a different source.
- A host is offline after the central marketplace was registered but before the selected plugin source was fetched.
- Legacy marketplace registrations and caches coexist with the new central installation.
- Codex remains open and owns a legacy cache file while cleanup runs.
- Process-name inspection differs by operating system or cannot prove that every Codex process is stopped.
- A legacy plugin was previously unregistered but its exact product cache root remains orphaned.
- A legacy marketplace name exists with provenance unrelated to the owning product repository.
- Windows exposes multiple Codex installations where direct Node process lookup selects a later `.exe` but the operator-visible command resolves an earlier `.cmd` shim.
- The thoth-agents working tree contains unrelated concurrent edits during implementation.

## Functional requirements

- **FR-001 — Setup MUST Merge Only Managed Configuration**: `[MODIFIED cli]` OpenCode setup MUST continue to own only exact thoth-mem plugin entries, the thoth-mem Skill tree, provider configuration fields, and its receipt. Codex and Claude Code setup MUST use their native managers to add, inspect, install, enable or repair, verify, and roll back only the canonical marketplace `thoth-plugins` at `https://github.com/EremesNG/thoth-plugins.git` and plugin `thoth-mem@thoth-plugins`. Codex CLI `0.151.x` MUST be accepted without an override only after the complete manager capability contract is observed; other versions MUST fail closed unless an explicit force override verifies that same complete contract. On Windows, the implicit `codex` command MUST use shell-compatible `cmd.exe` lookup without enabling Node `shell:true`, so an earlier `.cmd` shim is not bypassed for a later `.exe`; an explicit command override MUST remain literal, and non-Windows execution MUST remain direct. After Codex verifies `thoth-mem@thoth-plugins`, thoth-mem setup MUST remove only known thoth-mem legacy manager IDs and exact orphan roots, MUST preserve sibling/unrelated state, and MUST fail closed on conflicting provenance or unsafe path resolution.
- **FR-002 — NPM Tarball MUST Match One Canonical Integration Inventory**: `[MODIFIED packaging]` Every packaged native asset MUST continue to appear exactly once under one harness owner or the declared shared owner, and package, setup, and smoke verification MUST consume the same plugin inventory. Marketplace descriptors MUST have exactly one canonical owner in the `thoth-plugins` repository, MUST retain plugin and Skill identifiers `thoth-mem` and `thoth-agents`, and MUST keep each `thoth-plugins/<plugin>` cache segment pair distinct. Plugin package tarballs MUST NOT publish competing per-repository marketplace catalogs.
- **FR-003 — Plugin Releases MUST Publish Their Catalog Version**: `[ADDED packaging]` Each plugin repository's `release:patch`, `release:minor`, and `release:major` flow MUST push and verify the new source tag before updating the central catalog, MUST update only that plugin's Codex and Claude Code entries to the exact released version and tag, and MUST provide an idempotent catalog-only retry command that does not create a new plugin version. A catalog publication failure MUST be reported as an incomplete release operation.
- **FR-004 — Central catalog has one identity and two independent plugins**: `[INTERNAL]` `thoth-plugins` MUST contain valid Codex and Claude Code marketplace descriptors whose internal name is exactly `thoth-plugins`, whose visible metadata is Thoth-wide rather than plugin-specific, and whose `thoth-mem` and `thoth-agents` sources are independently pinned git subdirectories of their authoritative release tags.
- **FR-005 — thoth-agents uses the canonical marketplace**: `[INTERNAL]` The thoth-agents Codex and Claude Code installers MUST register the same canonical remote and install or repair only `thoth-agents@thoth-plugins`, while preserving the rest of each host's existing setup contract and unrelated working-tree changes. After Codex verifies the central plugin, the thoth-agents Codex installer MUST remove only known thoth-agents legacy manager IDs and exact orphan roots.
- **FR-006 — Codex migration removes owned legacy state and preserves unowned state**: `[INTERNAL]` Each product's Codex setup MUST require the operator to close Codex, MUST install and verify the central identity before destructive cleanup, MUST use official plugin and marketplace removal commands for known legacy identities, and MUST delete only exact still-orphaned roots for that product after validating that they are non-symlink descendants of the resolved `CODEX_HOME`. It MUST NOT remove the sibling product, unrelated manager entries, arbitrary cache paths, or legacy Claude Code state. Because no portable race-free Codex-process signal exists, setup MUST state the stopped-host precondition and convert filesystem-lock failures into bounded retry guidance rather than claiming process detection.
- **FR-007 — Catalog publication is validated and concurrency-safe**: `[INTERNAL]` Before a central catalog commit, publication tooling MUST verify the requested source tag, plugin manifest name and version, required Skill entrypoints, cross-host descriptor agreement, and unchanged non-target plugin entry. It MUST reject stale-base or non-fast-forward publication rather than force-push or overwrite a concurrent release.

### Immutable Codex legacy target sets

The only destructive identities and roots authorized by FR-006 are:

| Owner | Plugin IDs | Marketplace names and required provenance | Cache roots relative to `CODEX_HOME` | Snapshot roots relative to `CODEX_HOME` |
| --- | --- | --- | --- | --- |
| thoth-mem | `thoth-mem@thoth-mem`, `thoth-mem@thoth-mem-codex` | `thoth-mem`, `thoth-mem-codex` from `https://github.com/EremesNG/thoth-mem.git` | `plugins/cache/thoth-mem`, `plugins/cache/thoth-mem-codex` | `.tmp/marketplaces/thoth-mem`, `.tmp/marketplaces/thoth-mem-codex` |
| thoth-agents | `thoth-agents@thoth-agents`, `thoth-agents@thoth-agents-codex` | `thoth-agents`, `thoth-agents-codex` from `https://github.com/EremesNG/thoth-agents.git` | `plugins/cache/thoth-agents`, `plugins/cache/thoth-agents-codex` | `.tmp/marketplaces/thoth-agents`, `.tmp/marketplaces/thoth-agents-codex` |

Before any manager mutation, setup MUST reject a listed legacy marketplace whose normalized provenance differs, an unresolved `CODEX_HOME`, an existing target that is not a directory, any symlink/junction target, any real path outside the real `CODEX_HOME`, or an orphan root whose manifest does not identify the owning product/legacy marketplace. The cleanup set MUST be compiled from this table, never from manager-returned paths, directory enumeration, or globs.

## Success criteria

- **SC-001** `[buildable]`: Central descriptor validation passes for both native hosts with exactly two plugin entries, independent exact release tags, and expected cache paths containing separate marketplace and plugin segments.
- **SC-002** `[outcome]`: After an authorized real Codex installation and restart, a fresh session reads the cataloged thoth-mem `SKILL.md` on its first filesystem attempt with zero missing-plugin-segment probes or recovery messages.
- **SC-003** `[buildable]`: All disposable setup tests for both repositories and both native hosts, including unforced Codex CLI `0.151.x` capability coverage and Windows `.cmd`-before-`.exe` resolution, emit only `thoth-mem@thoth-plugins` or `thoth-agents@thoth-plugins`, with zero executable setup paths referencing a former host-specific marketplace ID.
- **SC-004** `[buildable]`: All release tests pass for tag-before-catalog ordering, target-only descriptor updates, mismatch rejection, concurrency rejection, and idempotent catalog-only retry.
- **SC-005** `[outcome]`: The initial validated catalog containing thoth-mem `0.4.13` and thoth-agents `0.3.11` is committed and pushed to the default branch of `https://github.com/EremesNG/thoth-plugins.git`.
- **SC-006** `[outcome]`: With Codex closed, authorized real-host migration verifies the selected product under `thoth-plugins`, removes that product's former plugin IDs, marketplace registrations, cache roots, and snapshots, preserves sibling/unrelated state byte-for-byte, and leaves no old product Skill path discoverable after restart.

## Assumptions

- The existing release tags `v0.4.13` for thoth-mem and `v0.3.11` for thoth-agents contain their valid `plugin/` distributions.
- The two plugins continue to version independently; the central catalog has no shared product version.
- Codex CLI `0.151.x` is the supported unforced native-manager family for this cut; the existing explicit force path remains capability-gated for any other family.
- On Windows, the operator-visible implicit `codex` command is the `cmd.exe` `PATH` contract; explicit executable overrides are intentional and bypass that lookup.
- Local release commands authenticate to the three Git remotes through the maintainer's existing Git credentials, so cross-repository publication does not require a stored application secret.
- A plugin tag may already be public if the later catalog push fails; the supported recovery is the idempotent catalog-only command, not tag rewriting.
- The operator closes every Codex process before a non-dry-run migration. Cross-platform process enumeration is advisory and race-prone, so the installers rely on this explicit precondition plus bounded cleanup errors rather than a false proof that Codex is stopped.

## Dependencies

- Existing writable remote `https://github.com/EremesNG/thoth-plugins.git` and push authorization supplied by the repository owner.
- Official Codex and Claude Code native marketplace managers and their supported remote git-subdirectory source formats.
- Reachable authoritative plugin repositories and exact release tags during catalog validation and publication.

## Out of scope

- Automatically deleting sibling-product, unrelated, ambiguously sourced, or legacy Claude Code state.
- Treating process-name enumeration as a portable or security-relevant proof that Codex is stopped.
- Merging thoth-mem and thoth-agents into one source repository or coupling their versions.
- Rewriting or force-moving an existing plugin release tag.
- Publishing to a public marketplace directory beyond the user-owned Git repository.
- Changing the plugin names, Skill names, memory protocol, or orchestration behavior.
- Refactoring unrelated dirty work in thoth-agents.
