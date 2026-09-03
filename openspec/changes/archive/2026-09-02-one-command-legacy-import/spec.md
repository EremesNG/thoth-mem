# Feature Specification: One-Command Legacy Import

**Change ID**: `one-command-legacy-import`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Importing the legacy memory database is a product operation, not an importer-development exercise. A normal user must not manually create plan paths, report paths, replay commands, or duplicate safety checks to preserve prior memories.<br>
**Impact**: `thoth-mem import-legacy` becomes the normal one-command migration path. It resolves the conventional legacy source and configured current target, privately orchestrates the existing audited plan/apply engine, retains its artifacts for diagnosis and recovery, and reports one bounded outcome. The existing `plan` and `apply` subcommands remain available as an advanced audit surface.<br>
**Affected capabilities**: `cli`

## User stories

### US1 - Import legacy memory with one command (Priority: P1)

As a thoth-mem user, I can run one CLI command so that my legacy memories are safely imported without manually coordinating internal artifacts or verification steps.

**Independent test**: Invoke the public CLI once against disposable legacy and configured-current SQLite fixtures, then verify the command commits through the existing importer, emits one bounded success result, and retains its plan, report, backup, and recovery references.

**Covers**: FR-001, SC-001, SC-002, SC-006

**Acceptance scenarios**:

1. **Given** the conventional legacy database and a configured current data directory, **When** `thoth-mem import-legacy` runs, **Then** it resolves both database paths, creates private run artifacts, plans, applies, verifies, and reports success in that single invocation.
2. **Given** a nonstandard legacy database or reviewed mapping manifest, **When** the operator passes the optional source, mapping, or data-directory override, **Then** the same one-command workflow binds those exact values into the audited plan.
3. **Given** a successful import, **When** the CLI returns, **Then** its bounded output identifies aggregate dispositions, retained plan/report locations, and nullable backup/recovery locations without exposing legacy prose.

### US2 - Fail safely without manual choreography (Priority: P1)

As an operator, I receive one actionable failure from the same command so that a locked, changed, invalid, or unsafe database cannot be partially imported.

**Independent test**: Run the one-command public CLI seam against locked, invalid, and replay fixtures and verify nonzero failures preserve both inputs while a repeated successful invocation produces no duplicate authoritative rows.

**Covers**: FR-001, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** the configured target is open or changes between internal planning and apply, **When** one-command import runs, **Then** it exits nonzero, reports a bounded close-host-or-retry action, and leaves the active target recoverable without claiming commit.
2. **Given** an invalid source, mapping, target alias, or unsafe artifact condition, **When** one-command import runs, **Then** it fails closed without requiring the user to inspect or repair an internal plan manually.
3. **Given** the same source fingerprint was already committed, **When** an equivalent one-command import is run again, **Then** it reads the committed plan hash from the target, selects that exact retained sealed plan from matching request custody, the existing importer receipts prevent duplicate authoritative rows, and the command reports the idempotent outcome.
4. **Given** a prior attempt failed safely because the uncommitted target changed after planning, **When** the target becomes stable and the same one-command request is retried, **Then** it creates or selects a fresh baseline-bound plan attempt and can complete without manual artifact cleanup.

### US3 - Retain advanced audit controls (Priority: P2)

As an advanced operator, I can still separate planning and application when an external review or custom custody workflow requires it.

**Independent test**: Execute the existing `import-legacy plan` and `import-legacy apply` CLI seams and verify their closed contracts and create-only behavior remain unchanged.

**Covers**: FR-001, SC-005

**Acceptance scenarios**:

1. **Given** an operator explicitly selects `plan` or `apply`, **When** that subcommand runs, **Then** the existing explicit paths, fingerprint binding, create-only artifacts, and stale-plan rejection remain authoritative.

## Edge cases

- The conventional legacy source does not exist, is not a regular SQLite file, or aliases the configured target.
- The configured target is absent, populated, in WAL mode, changes after planning, or is locked by Codex, OpenCode, Claude Code, or another process.
- The generated artifacts root or run path already exists, is not writable, or aliases an input database.
- A reviewed mapping is malformed, changes during planning, or resolves ambiguous project identity.
- Planning succeeds but apply fails; the command must retain bounded failure evidence without reporting completion.
- Human-readable and JSON output must never include raw legacy memory content.

## Functional requirements

- **FR-001 — Legacy Import MUST Be Explicit and Non-Destructive**: `[MODIFIED cli]` `import-legacy` MUST make one explicit CLI invocation the normal migration workflow; default the source to the conventional legacy database under the user home and the target to `memory.sqlite` under the resolved runtime data directory; accept bounded source, mapping, and data-directory overrides; bind the complete canonical mapping request, including null versus empty mode, inside the sealed plan hash recorded by the target receipt; internally create and retain importer-owned request custody with immutable baseline-bound plan attempts and create-only reports; use a fresh attempt while no matching source import is committed; read the committed plan hash from the target and reuse only that exact retained sealed plan for an equivalent replay; execute the existing fingerprint-bound plan and verified atomic apply operations without manual artifact choreography; emit bounded aggregate success or actionable failure output; preserve advanced `plan` and `apply` subcommands; reject changed, locked, aliased, invalid, tampered, substituted, or unsafe inputs before claiming commit; allow a later stable retry after an uncommitted stale-plan failure; preserve recoverable backup/publication behavior; and keep repeated imports idempotent.

## Success criteria

- **SC-001** `[buildable]`: One `runCli(['import-legacy', ...])` invocation imports a supported disposable legacy fixture into the configured target and returns zero without a caller-supplied target, plan, report, backup, replay, or verification command.
- **SC-002** `[buildable]`: Every successful one-command result reports exact imported/quarantined/skipped aggregate counts, retained plan/report paths, and nullable backup/recovery paths while emitting no source memory content.
- **SC-003** `[buildable]`: Locked, changed, aliased, malformed, or unavailable inputs return nonzero, never claim success, and preserve source and active-target logical state.
- **SC-004** `[buildable]`: Repeating an equivalent committed request selects the exact retained plan named by the target receipt, produces zero duplicate authoritative memory/FTS rows, and reports an idempotent outcome; an uncommitted target-change failure can succeed on one later stable retry with a fresh baseline-bound attempt; changed source, path, mapping input, policy, or tampered custody never reuses a committed plan.
- **SC-005** `[buildable]`: All existing explicit `plan` and `apply` CLI contract tests remain unchanged and pass.
- **SC-006** `[outcome]`: The authorized real legacy cutover completes from a stopped host with one documented `thoth-mem import-legacy` invocation and its resulting report passes post-cutover integrity and recall inspection.

## Assumptions

- The existing planner, candidate writer, verifier, backup, atomic publication, recovery, and receipt implementation remain the sole import engine; the plan contract advances to v4 only to seal the canonical mapping request, while the report remains v3 and no second migration path is added.
- The core may expose a bounded read-only lookup for the committed import's plan hash so the CLI can select exact retained custody without duplicating receipt SQL or mutation behavior.
- Running the one-command form is itself explicit authorization to apply; `plan` remains the zero-write choice for operators who want a review gate.
- A host holding the target open cannot be closed safely by the importer; the CLI must detect or surface that condition before claiming success and tell the user to close the host and rerun the same command.

## Dependencies

- Existing verified `planLegacyImport` and `applyLegacyImport` contracts, runtime data-directory resolution, and revision-9 import receipts.

## Out of scope

- Automatically terminating Codex, OpenCode, Claude Code, or arbitrary processes.
- Changing legacy taxonomy, quarantine policy, project mappings, ranking, SQLite schema, MCP tools, or import eligibility.
- Removing the advanced `plan` and `apply` subcommands.
