# Feature Specification: OpenCode packaged skill delivery

**Change ID**: `opencode-packaged-skill-delivery`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: OpenCode users currently receive the native plugin and MCP declaration without the packaged `thoth-mem` skill, so the agent lacks the required memory workflow after `thoth-mem setup opencode`.<br>
**Impact**: Project and global OpenCode setup will install the canonical packaged skill inside the receipt-owned plugin assets, and the installed plugin will expose that location to OpenCode at runtime without writing to the user's shared skills directory.<br>
**Affected capabilities**: `harness-integration`, `packaging`

## User stories

### US1 - Receive the memory skill with OpenCode setup (Priority: P1)

As an OpenCode user, I can run native setup and receive the `thoth-mem` skill with the plugin so that OpenCode can use the supported persistent-memory workflow immediately.

**Independent test**: Run project and global setup against isolated filesystem fixtures and verify the installed receipt-owned plugin assets contain the packaged skill and all declared references.

**Covers**: FR-001, FR-002, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** a packed `thoth-mem` distribution, **When** project-scoped OpenCode setup is applied, **Then** the installed plugin asset directory contains a byte-equivalent `thoth-mem` skill bundle sourced from the package.
2. **Given** a packed `thoth-mem` distribution, **When** global OpenCode setup is applied, **Then** the same skill bundle is installed under the global receipt-owned plugin asset directory rather than `~/.config/opencode/skills`.
3. **Given** a packaged skill source that is missing or incomplete, **When** setup inspection or application runs, **Then** setup reports the missing managed asset instead of claiming a complete installation.

### US2 - Discover the installed skill at OpenCode runtime (Priority: P1)

As an OpenCode user, I can load the installed plugin and have it register its bundled skill path so that OpenCode discovers `thoth-mem` without a separate manual skill installation.

**Independent test**: Load a copied production plugin from an isolated install layout, invoke its configuration hook, and assert that the absolute bundled skill parent is appended exactly once while existing skill paths remain unchanged.

**Covers**: FR-003, FR-004, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** an OpenCode configuration with no `skills` block, **When** the plugin configuration hook runs, **Then** it creates `skills.paths` containing the absolute bundled skill parent.
2. **Given** existing user-defined skill paths, **When** the plugin configuration hook runs, **Then** it preserves their order and values and appends only the missing bundled path.
3. **Given** the hook runs more than once, **When** the bundled path is already registered, **Then** the configuration remains unchanged and contains no duplicate path.
4. **Given** an installation path containing spaces or URL-encoded characters, **When** the plugin resolves its bundle, **Then** it registers a valid native absolute filesystem path.

### US3 - Preserve managed setup ownership (Priority: P1)

As an operator, I can inspect, upgrade, and roll back OpenCode setup as one managed installation so that bundled skill drift and cleanup follow the existing receipt contract.

**Independent test**: Exercise setup inspection, replacement, and rollback in isolated fixtures and verify skill changes affect only the receipt-owned plugin asset surface.

**Covers**: FR-005, FR-006, SC-005, SC-006

**Acceptance scenarios**:

1. **Given** a skill file is missing or modified inside the managed plugin assets, **When** setup is inspected, **Then** the installation is reported as drifted.
2. **Given** an older managed OpenCode installation without the bundled skill, **When** setup is applied again, **Then** the receipt-owned asset directory is upgraded to the complete current layout.
3. **Given** a managed installation with the bundled skill, **When** rollback is applied, **Then** the receipt-owned plugin assets are restored or removed according to the receipt and no shared OpenCode skill directory is mutated.

## Edge cases

- Existing `config.skills.paths` values may be absent, empty, relative, absolute, or already contain the bundled path.
- The installed plugin path may contain spaces or characters represented differently by file URLs.
- Setup may encounter a legacy receipt-owned asset directory that predates bundled skill delivery.
- A copied plugin runtime may be loaded from a temporary directory rather than the package source tree.
- Unrelated files under `~/.config/opencode/skills` belong to the user and must remain untouched.

## Functional requirements

- **FR-001 — Install packaged skill asset**: `[ADDED harness-integration]` OpenCode project and global setup MUST copy the packaged `thoth-mem` skill, including every declared reference, into the receipt-owned OpenCode plugin asset directory.
- **FR-002 — Validate setup source**: `[INTERNAL]` Setup inspection and application MUST treat the packaged skill source as a required OpenCode asset and MUST fail explicitly when it is unavailable.
- **FR-003 — Register bundled discovery path**: `[ADDED harness-integration]` The OpenCode plugin MUST register the native absolute parent directory of its bundled `thoth-mem` skill through the supported runtime configuration hook.
- **FR-004 — Preserve user skill configuration**: `[ADDED harness-integration]` Runtime registration MUST preserve existing `skills.paths` entries and MUST be idempotent across repeated hook execution.
- **FR-005 — Include skill in managed drift**: `[ADDED packaging]` OpenCode setup inspection and replacement MUST include the installed skill bundle in the existing receipt-owned asset comparison so missing, stale, or extra managed skill files are detected.
- **FR-006 — Keep rollback ownership bounded**: `[ADDED packaging]` OpenCode rollback MUST restore or remove the bundled skill only through the existing managed plugin asset receipt and MUST NOT create, edit, or delete the user's shared OpenCode skills directory.

## Success criteria

- **SC-001** `[buildable]`: Focused project and global setup tests assert that `opencode/skills/thoth-mem/SKILL.md` and all packaged references are installed from the packed distribution.
- **SC-002** `[buildable]`: A missing packaged skill source makes setup inspection or application fail with a specific managed-asset diagnostic.
- **SC-003** `[buildable]`: Every runtime test fixture resolves exactly 1 registered absolute native skill parent to the installed `thoth-mem/SKILL.md`.
- **SC-004** `[buildable]`: Runtime tests preserve every existing skill path and repeated configuration hooks leave exactly 1 bundled path entry.
- **SC-005** `[buildable]`: Focused setup and rollback tests all pass while proving bundled-skill drift is detected, repaired, and cleaned up solely within the receipt-owned plugin asset surface.
- **SC-006** `[buildable]`: Package verification, relevant integration/setup/packaging suites, type checking, build, and the full test suite pass.

## Assumptions

- OpenCode's supported plugin hook contract includes a configuration hook, and its configuration schema supports `skills.paths` entries.
- OpenCode discovers skills by scanning each configured path for child directories containing `SKILL.md`; therefore the plugin registers the bundled `skills` parent rather than the individual skill directory.
- The already packaged `plugin/skills/thoth-mem` tree remains the canonical published copy synchronized from `skills/thoth-mem`.
- Runtime path registration is preferable to persistent config ownership because it travels with the plugin and disappears when the plugin is removed.

## Dependencies

- Existing OpenCode native plugin and setup receipt engine.
- Existing canonical-to-plugin skill synchronization and package inventory verification.
- OpenCode configuration hook and `skills.paths` behavior validated during discovery.

## Out of scope

- Installing or managing unrelated skills under `~/.config/opencode/skills`.
- Persisting the bundled skill path into `opencode.json` or `opencode.jsonc`.
- Changing Codex or Claude Code plugin delivery.
- Publishing a release or running setup against the user's real OpenCode configuration.
- Supporting undocumented future OpenCode plugin-level skill manifest fields.
