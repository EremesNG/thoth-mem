# Feature Specification: Disambiguate native plugin cache paths

**Change ID**: `disambiguate-native-plugin-cache-paths`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Codex and Claude Code currently give the marketplace and plugin the same `thoth-mem` identifier. Both hosts use marketplace/plugin/version cache topology, producing adjacent identical path segments that agents can incorrectly collapse while resolving the cataloged Skill path.<br>
**Impact**: Codex installations use marketplace `thoth-mem-codex`, Claude Code installations use marketplace `thoth-mem-claude`, and both retain plugin and Skill name `thoth-mem`. Existing installations require an explicitly authorized manager migration; this change does not mutate a real host home.<br>
**Affected capabilities**: `cli`, `packaging`

## User stories

### US1 - Manage each native host identity safely (Priority: P1)

As a Codex or Claude Code operator, I can use managed setup with an exact host-specific marketplace identity so that installation, verification, repair, and rollback preserve unrelated state.

**Independent test**: Exercise managed setup through the injected native-manager executor to prove exact `thoth-mem@thoth-mem-codex` and `thoth-mem@thoth-mem-claude` behavior, legacy preservation, provenance collision handling, and rollback without touching a real host home.

**Covers**: FR-001, SC-001

**Acceptance scenarios**:

1. **Given** a Codex manager with no thoth-mem marketplace or plugin, **When** managed setup installs the package, **Then** it adds marketplace `thoth-mem-codex`, installs and verifies `thoth-mem@thoth-mem-codex`, and never edits the manager cache directly.
2. **Given** a Claude Code manager with no thoth-mem marketplace or plugin, **When** managed setup installs the package, **Then** it adds marketplace `thoth-mem-claude`, installs and verifies `thoth-mem@thoth-mem-claude`, and never edits the manager cache directly.
3. **Given** unrelated plugins, Skills, comments, and provider fields, **When** setup installs or repairs thoth-mem, **Then** unrelated state remains byte-identical.
4. **Given** a real existing native installation, **When** this repository change is verified, **Then** no marketplace, plugin, cache, receipt, or home state is mutated without separate explicit authorization.

### US2 - Resolve every packaged native Skill unambiguously (Priority: P1)

As a Codex or Claude Code user, I can load thoth-mem from a host-specific marketplace whose identifier differs from the plugin identifier so that the cataloged Skill path is unambiguous without weakening the canonical integration inventory.

**Independent test**: Inspect both packed marketplace fixtures, derive their cache paths, resolve the declared Skill files, and reject missing inventory assets or repeated marketplace/plugin segments.

**Covers**: FR-002, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** the packed Codex and Claude Code marketplace descriptors, **When** either host derives its cache topology, **Then** each marketplace segment is host-specific, each plugin segment is `thoth-mem`, and the Skill remains named `thoth-mem`.
2. **Given** a declared inventory path absent from the tarball, **When** integration verification runs, **Then** packaging fails before publication or host installation.
3. **Given** one later separately authorized installation per host, **When** each host restarts and catalogs thoth-mem, **Then** Codex resolves `cache/thoth-mem-codex/thoth-mem/<version>/skills/thoth-mem/SKILL.md` and Claude resolves `cache/thoth-mem-claude/thoth-mem/<version>/skills/thoth-mem/SKILL.md` without collapsing a segment.

## Edge cases

- Either host may report its new marketplace name with different provenance; setup must preserve it and require user action.
- A legacy `thoth-mem@thoth-mem` installation is externally owned residue and must not be deleted merely by name.
- Host-specific identity selection must not cross-wire the Codex and Claude marketplace names in commands or verification.
- Plan-only setup must describe the correct host-specific identity while performing zero writes.

## Functional requirements

- **FR-001 — Setup MUST Merge Only Managed Configuration**: `[MODIFIED cli]` OpenCode setup MUST own only exact thoth-mem plugin entries, the thoth-mem Skill tree, provider configuration fields, and its receipt. Codex and Claude Code setup MUST use their native managers. Managed Codex setup MUST add, inspect, install, enable or repair, verify, and roll back only marketplace `thoth-mem-codex` and plugin `thoth-mem@thoth-mem-codex`; managed Claude Code setup MUST do the same only for marketplace `thoth-mem-claude` and plugin `thoth-mem@thoth-mem-claude`; neither host setup may edit manager caches directly or delete legacy/unrelated state by name alone.
- **FR-002 — NPM Tarball MUST Match One Canonical Integration Inventory**: `[MODIFIED packaging]` Every packaged native asset MUST appear exactly once under one harness owner or the declared shared owner, and package, setup, and smoke verification MUST consume the same inventory. Within that inventory, the Codex and Claude Code marketplace descriptors MUST identify marketplaces `thoth-mem-codex` and `thoth-mem-claude` respectively, MUST retain plugin and Skill identifier `thoth-mem`, and MUST make each marketplace/plugin cache segment pair distinct.

## Success criteria

- **SC-001** `[buildable]`: All focused setup tests pass while proving every planned and executed marketplace/plugin command and every structured-state verification uses the correct host-specific qualified plugin identity and preserves legacy or conflicting state without mutation.
- **SC-002** `[buildable]`: All packaging verification passes while proving both cache topologies derived from packed descriptors have distinct adjacent marketplace and plugin segments and still resolve `skills/thoth-mem/SKILL.md` from the declared plugin root.
- **SC-003** `[outcome]`: In at least one later separately authorized real installation per host, each cataloged thoth-mem Skill path resolves without collapsing an adjacent repeated marketplace/plugin segment.

## Assumptions

- Codex and Claude Code native manager cache topologies use marketplace, plugin, and version identifiers in that order.
- Marketplace identifiers are distribution metadata; changing them does not rename the thoth-mem product, plugin, MCP server, or Skill.
- Backward compatibility is not required, but externally owned legacy manager state remains protected from implicit deletion.

## Dependencies

- Native plugin-manager support for repository marketplaces and qualified plugin identifiers in Codex and Claude Code.
- Existing injected manager fixtures and packed integration verification.

## Out of scope

- Mutating, reinstalling, removing, or migrating any real Codex or Claude Code marketplace/plugin state.
- Renaming the thoth-mem plugin, Skill, MCP server, or npm package.
- Changing persistence, retrieval, lifecycle, or the exact six-tool MCP contract.
