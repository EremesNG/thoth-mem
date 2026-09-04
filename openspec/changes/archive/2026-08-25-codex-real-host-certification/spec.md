# Feature Specification: Codex real-host lifecycle certification

**Change ID**: `codex-real-host-certification`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: The packed Codex smoke used an invented `event_id` field that the official Codex hook schema does not provide, so the locally installed v2 runner rejects a real `SessionStart` payload before memory can be confirmed.<br>
**Impact**: The Codex bundle will accept only documented native hook fields, derive retry-safe lifecycle identity from host-stable evidence, emit current Codex hook output, and become eligible for an isolated real-host smoke without touching the published database.<br>
**Affected capabilities**: `harness-integration`, `packaging`

## User stories

### US1 - Accept documented Codex lifecycle payloads (Priority: P1)

As a Codex user, I can start, resume, clear, compact, submit a prompt, and end a session without supplying fields that Codex does not emit.

**Independent test**: Feed documented Codex hook payloads without `event_id` through the installed runner, assert valid host JSON/exit behavior, and inspect the isolated lifecycle receipts for confirmed or explicitly degraded outcomes rather than validation failure.

**Covers**: FR-001, FR-002, SC-001

**Acceptance scenarios**:

1. **Given** a documented `SessionStart` payload containing `session_id`, `cwd`, `hook_event_name`, `model`, `permission_mode`, and `source`, **When** the Codex adapter normalizes `startup`, `resume`, or `clear`, **Then** it produces a stable recovery request without requiring `event_id`; `compact` produces the post-compaction recovery intent.
2. **Given** a turn-scoped Codex event with `turn_id`, **When** the adapter derives retry identity, **Then** repeated delivery resolves to the same event key and a later distinct turn resolves to a different key.
3. **Given** a lifecycle event with no host-stable id, timestamp, sequence, or documented equivalent, **When** the adapter evaluates cross-restart idempotency, **Then** it reports degradation instead of inventing confirmed exactly-once behavior.

### US2 - Load one current canary hook bundle (Priority: P1)

As a maintainer, I can install the local Codex bundle from a separate marketplace while the published plugin hooks remain disabled.

**Independent test**: Codex ingests the local marketplace plugin, reports it enabled, reports the published plugin disabled, and the canary bundle declares current command-hook handler and output shapes.

**Covers**: FR-003, FR-004, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** the published and personal marketplaces are both configured, **When** Codex lists plugins, **Then** `thoth-mem@thoth-mem` is disabled and `thoth-mem@personal` is enabled.
2. **Given** the canary plugin bundle, **When** Codex parses its manifest and hooks, **Then** every hook uses a supported command-handler structure and resolves its runner inside the installed plugin.
3. **Given** a `SessionStart` recovery result, **When** the runner writes JSON to stdout, **Then** it uses `hookSpecificOutput.additionalContext` and never claims model consumption merely because context was emitted.

### US3 - Prove behavior in the real Codex host (Priority: P2)

As a maintainer, I can restart Codex and observe the canary lifecycle against an isolated database before promoting any package.

**Independent test**: A real Codex restart and controlled canary memory exercise prove hook execution, durable capture, recovery delivery, and model use while the published database remains unchanged.

**Covers**: FR-005, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** the canary plugin is installed and trusted, **When** Codex restarts, **Then** only canary lifecycle hooks execute and all writes remain under the certification data directory.
2. **Given** a unique canary decision stored before a second session, **When** the new `startup` session receives recovery context, **Then** the model uses that decision without the user repeating it.
3. **Given** the real-host evidence is incomplete or a hook is skipped, **When** certification is evaluated, **Then** the result remains an explicit risk and is not promoted as PASS.

## Edge cases

- `SessionStart` has no `turn_id`; repeated startup, resume, clear, or compact delivery must remain idempotent without suppressing current recovery generation.
- `UserPromptSubmit`, `PreCompact`, `PostCompact`, and `SessionEnd` differ in their documented stable fields; derivation must be event-specific.
- `Stop` is a turn-completion event and MUST NOT finalize the durable root session; `SessionEnd` owns session finalization.
- Plugin hook sources are additive, so disabling only an MCP server does not disable published hooks.
- Hook trust is hash-bound; a rebuilt or reinstalled canary must require review again when its definition changes.
- A failed real-host hook must not write to or migrate `C:\Users\EremesNG\.thoth`.

## Functional requirements

- **FR-001 — Duplicate Events and Retries MUST Be Idempotent**: `[MODIFIED harness-integration]` The Codex adapter MUST derive lifecycle event identity from documented host-stable evidence without requiring an undocumented `event_id`; turn-scoped events MUST require `turn_id` for confirmed identity, session-start events MUST use stable session, source, and lifecycle intent evidence, and session finalization MUST use documented `SessionEnd` evidence rather than `Stop`.
- **FR-002 — Runtime Activation MUST Be Evidenced Separately From Asset Installation**: `[MODIFIED harness-integration]` A Codex lifecycle capability MUST be classified as active only when the current documented payload is accepted, the installed runner executes, memory confirms the operation, and any recovery context is emitted through the documented Codex output channel.
- **FR-003 — Manifest Versions and Paths MUST Be Internally Consistent**: `[MODIFIED packaging]` The Codex plugin manifest and hook definitions MUST use fields and nesting accepted by the current Codex plugin and hook loaders, resolve only installed bundle assets, and remain version-consistent with the package.
- **FR-004 — Official-payload regression coverage**: `[INTERNAL]` Automated tests MUST use documented Codex payloads without `event_id` and MUST fail if fixtures reintroduce an invented required field.
- **FR-005 — Isolated certification configuration**: `[INTERNAL]` The authorized real-host smoke MUST keep the published npm MCP and database as a disabled-hook control while the local canary plugin alone owns lifecycle hooks and writes only to `C:\Users\EremesNG\.thoth-canary-v2-codex-cert`.

## Success criteria

- **SC-001** `[buildable]`: All five documented Codex event types—`SessionStart`, `UserPromptSubmit`, `PreCompact`, `PostCompact`, and `SessionEnd`—plus the four-value `SessionStart` source matrix pass without `event_id`, and duplicate checks produce exactly one canonical lifecycle effect wherever documented stable evidence exists.
- **SC-002** `[buildable]`: Plugin validation and `codex plugin add thoth-mem@personal` both exit `0`, and the installed bundle contains exactly one accepted manifest plus one accepted hook source for the five declared lifecycle event types.
- **SC-003** `[buildable]`: Installed-runner preflight exits `0` with valid event-appropriate Codex JSON for every supported fixture, the isolated lifecycle receipt records a confirmed or explicitly degraded result for 100% of cases, and stdout emits documented `SessionStart` recovery JSON when at least one recovery item exists.
- **SC-004** `[outcome]`: After a real Codex restart, `/hooks` reports zero enabled published thoth-mem hooks and exactly one enabled canary handler per declared event, while every file under `C:\Users\EremesNG\.thoth` retains its pre-smoke byte size and modification timestamp.
- **SC-005** `[outcome]`: In one controlled second-session task, the model reproduces a unique canary decision that is absent from the user prompt and present in recovered context; delivery without the correct response remains `RISK`, not `PASS`.

## Assumptions

- The official Codex hooks documentation retrieved on 2026-08-25 is the authoritative payload and output contract for this change.
- The user has authorized mutation of the real Codex plugin configuration and a subsequent restart, but not mutation of the published thoth-mem database.
- The existing local checkout and generated `dist/` are the canary implementation under test.

## Dependencies

- Codex plugin manager and `/hooks` trust review.
- Published `thoth-mem@0.4.13` as the stable MCP control.
- Explicit user confirmation after restarting Codex.

## Out of scope

- OpenCode and Claude Code real-host certification.
- Publishing a new npm version.
- Migrating or deleting any legacy database.
- Enabling dense, hybrid, graph, reranking, dashboard, or HTTP features.
