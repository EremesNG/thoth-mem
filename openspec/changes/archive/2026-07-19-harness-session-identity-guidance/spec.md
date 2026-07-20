# Feature Specification: Harness session identity guidance

**Change ID**: `harness-session-identity-guidance`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Root agents need a deterministic way to recover the stable root session ID and project name instead of declining durable lifecycle work when a harness uses its own identity field names.<br>
**Impact**: Native recovery context will make verified identity visible to the root agent, the memory skill will route to one harness-specific lookup guide, and every published plugin copy will include those guides.<br>
**Affected capabilities**: `harness-integration`, `packaging`

## User stories

### US1 - Resolve identity in the active harness (Priority: P1)

As a root coding agent, I can follow one harness-specific identity procedure so that I use the real root session and project identifiers without guessing.

**Independent test**: Inspect the canonical skill and each harness reference and verify that routing, source priority, parameter mapping, and rejected identifiers are explicit.

**Covers**: FR-001, FR-002, FR-003, FR-004, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** a root agent running in Codex, **When** no verified identity block is already visible, **Then** the guide directs it to check `CODEX_THREAD_ID`, optionally cross-check an unambiguous current thread, derive the project consistently, and reject turn, agent, tool, shell-session, and Codex saved-project identifiers.
2. **Given** a root agent running in Claude Code or OpenCode, **When** it needs stable identity, **Then** it reads only that harness reference and uses verified native lifecycle identity before any documented manual fallback.
3. **Given** an unsupported or ambiguous identity source, **When** the agent cannot prove root identity, **Then** it reports degradation and does not invent continuity.

### US2 - Receive verified identity from native lifecycle context (Priority: P1)

As a root coding agent with working native hooks, I can see the exact identity already verified by the lifecycle integration so that manual discovery is unnecessary.

**Independent test**: Drive the public lifecycle handler through a supported recovery event and assert that its bounded host-output directive contains the verified root session ID, project name, and existing recovery context.

**Covers**: FR-005, FR-006, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** confirmed enrollment and recovery context, **When** native host output is ready, **Then** the emitted context begins with the verified root session ID and project and retains bounded memory context.
2. **Given** identity plus recovery text near the output limit, **When** host output is built, **Then** it stays within the existing bound without truncating or fabricating the identity.
3. **Given** an identity header that cannot fit safely, **When** host output is built, **Then** output is reported unavailable rather than emitting a partial identity.

### US3 - Publish the complete skill bundle (Priority: P1)

As a plugin consumer, I receive the same harness references that the canonical skill links so that installed Codex and Claude plugins never contain broken or incomplete guidance.

**Independent test**: Run asset synchronization in a disposable fixture and package verification against inventory-declared reference files.

**Covers**: FR-007, FR-008, SC-005, SC-006

**Acceptance scenarios**:

1. **Given** canonical harness references, **When** integration assets are synchronized, **Then** the shared plugin skill contains byte-identical copies and reports each changed path.
2. **Given** a missing, stale, or undeclared packaged reference, **When** the read-only verifier runs, **Then** verification fails with a bounded asset error.

## Edge cases

- Codex exposes multiple active threads; thread inventory is not accepted unless the current root thread is unambiguous.
- `CODEX_THREAD_ID` is absent even though other `CODEX_*` variables exist.
- The working directory is nested below a repository root or is not a Git checkout.
- Recovery context is already at the 1,000-code-point host-output limit.
- A session ID or project value is too long to fit a complete verified identity header.
- Native enrollment or prompt capture is already confirmed and must not be duplicated manually.

## Functional requirements

- **FR-001 — Progressive harness routing**: `[ADDED harness-integration]` The canonical memory skill MUST keep shared lifecycle invariants in `SKILL.md`, identify the active harness from verified ambient context, and instruct the agent to read exactly one matching harness reference before declaring stable identity unavailable.
- **FR-002 — Codex identity procedure**: `[ADDED harness-integration]` The Codex reference MUST prioritize a verified model-visible identity block, define `CODEX_THREAD_ID` as the explicit root-agent recovery check, permit current-thread inventory only as an unambiguous cross-check, map the resolved ID to `mem_session.id` and other tools' `session_id`, and distinguish the project name from Codex's saved-project ID.
- **FR-003 — Claude Code identity procedure**: `[ADDED harness-integration]` The Claude Code reference MUST identify the verified native `session_id` and `cwd` lifecycle fields, reuse model-visible verified identity when present, and forbid invented environment-variable or nearby-ID fallbacks.
- **FR-004 — OpenCode identity procedure**: `[ADDED harness-integration]` The OpenCode reference MUST identify the verified root session fields and project/worktree context used by the native adapter, reject delegated session identity, and forbid invented environment-variable or nearby-ID fallbacks.
- **FR-005 — Verified identity header**: `[ADDED harness-integration]` Confirmed native recovery and post-compaction host output MUST prepend the lifecycle-resolved root session ID and project name to model-visible memory context.
- **FR-006 — Preserve bounded output truth**: `[ADDED harness-integration]` Identity-aware host output MUST preserve the existing 1,000-code-point bound, keep the identity complete, retain as much recovery context as fits, and return unavailable when the complete identity header cannot fit.
- **FR-007 — Synchronize reference assets**: `[ADDED packaging]` The explicit integration synchronization command MUST copy every canonical harness reference into the shared plugin skill and report changed reference paths.
- **FR-008 — Verify published references**: `[ADDED packaging]` Inventory and read-only package verification MUST declare and validate every published harness reference so missing or stale files fail delivery checks.

## Success criteria

- **SC-001** `[buildable]`: Canonical `SKILL.md` links exactly 3 harness references and requires selecting only the active harness reference.
- **SC-002** `[buildable]`: Every reference contains an ordered identity procedure, exact MCP parameter mapping, project derivation guidance, and an explicit rejection list without duplicating the common memory workflow.
- **SC-003** `[buildable]`: All focused lifecycle tests observe the exact verified identity header plus recovery context through the existing public handler result.
- **SC-004** `[buildable]`: Focused boundary tests prove emitted host text never exceeds 1,000 Unicode code points and never contains a truncated identity value.
- **SC-005** `[buildable]`: Focused synchronization and inventory/package tests fail before implementation and pass with byte-identical packaged references.
- **SC-006** `[buildable]`: `pnpm run integration:verify`, the relevant integration/packaging suites, type checking, build, and the full test suite pass.

## Assumptions

- The current Codex runtime exposes `CODEX_THREAD_ID` to root-agent shell commands; this is documented in the reference as verified current-runtime behavior, not as a public cross-version Codex contract.
- Official Codex command hooks expose `session_id` and `cwd`; the native integration remains the primary identity authority.
- Claude Code and OpenCode references rely only on native fields already validated by their repository adapters unless stronger documented evidence is added.
- The approved seams are the lifecycle handler result, canonical skill bundle, and published plugin bundle.

## Dependencies

- Existing six-tool MCP contract and lifecycle identity resolver.
- Existing host-output readiness and 1,000-code-point limit.
- Existing integration inventory, synchronization script, and package verifier.

## Out of scope

- Adding a seventh MCP tool or changing MCP parameter schemas.
- Automatically starting or duplicating sessions/prompts already confirmed by native hooks.
- Inventing undocumented Claude Code or OpenCode environment variables.
- Changing database identity schemas or historical session records.
- Publishing, releasing, installing, or smoke-testing the plugin in a real external host.
