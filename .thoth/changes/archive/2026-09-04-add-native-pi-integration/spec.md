# Feature Specification: Native Pi Integration

**Change ID**: `add-native-pi-integration`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Pi users currently cannot install thoth-mem through the managed CLI or
receive the native lifecycle, memory tools, and Skill experience available in
the other supported coding-agent harnesses.<br>
**Impact**: The published thoth-mem package will become a native Pi package
whose extension exposes the existing six memory tools and maps Pi's documented
session, input, context, compaction, and shutdown events onto the shared
lifecycle contract. `thoth-mem setup pi` will install or repair that package
through Pi's own package manager with the same plan-only, ownership,
idempotency, rollback, and verification guarantees as other managed setup
paths. The current SQLite schema will advance one revision solely to widen the
persisted session harness constraint for `pi`, preserving all existing rows and
a verified pre-migration backup.<br>
**Affected capabilities**: `harness-integration`, `cli`, `packaging`

## User stories

### US1 - Install thoth-mem natively in Pi (Priority: P1)

As a Pi user, I can run `thoth-mem setup pi` so that the supported thoth-mem
package, extension, tools, and Skill are installed globally and verified
without manual file copying.

**Independent test**: Run public, explicit-local, plan-only, repeated, repair,
and injected-failure setup cases against a disposable Pi home and fake manager,
then inspect only the owned package and receipt state.

**Covers**: FR-001, FR-002, FR-003, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** Pi is installed with the supported package-manager contract,
   **When** `thoth-mem setup pi` runs for the public package, **Then** it asks Pi
   to install the exact thoth-mem package version globally and reports complete
   only after the package is independently visible and loadable.
2. **Given** a verified local thoth-mem build, **When** setup runs with the
   explicit local package-root option, **Then** it installs that absolute local
   package through Pi and records its distinct provenance.
3. **Given** plan mode or an already verified matching installation, **When**
   setup runs, **Then** plan mode performs zero writes and the repeated real
   setup performs zero mutations with `changed=false`.
4. **Given** unrelated Pi packages and configuration, **When** setup installs,
   repairs, or rolls back thoth-mem, **Then** it mutates only the exact managed
   thoth-mem package and its receipt-owned state.

### US2 - Use the existing memory tools from Pi (Priority: P1)

As a Pi agent, I can call thoth-mem's native tools and follow the same Skill so
that memory behavior is consistent across supported harnesses without a
community MCP adapter.

**Independent test**: Load the packed Pi extension in a disposable host,
enumerate its tools, invoke each tool through the extension boundary, and
compare the bundled Skill with the canonical thoth-mem Skill.

**Covers**: FR-004, FR-005, FR-010, FR-011, FR-012, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** the native Pi package is loaded, **When** Pi enumerates extension
   tools, **Then** it sees exactly `mem_save`, `mem_recall`, `mem_context`,
   `mem_get`, `mem_project`, and `mem_session` with the shared schemas and
   bounded structured results.
2. **Given** a valid tool call, **When** Pi executes it, **Then** the request
   crosses the package-relative Node boundary to the existing MCP server and
   uses the same storage, identity, privacy, validation, and error semantics as
   direct MCP use.
3. **Given** the packaged Pi Skill, **When** an agent reads its memory guidance,
   **Then** it retains the canonical recall, timeline, explicit save, handoff,
   privacy, confirmation, and verified-identity practices.

### US3 - Preserve memory across the Pi session lifecycle (Priority: P1)

As a Pi user, I receive bounded prior context and durable root-session evidence
across prompts and compaction so that restarts and long sessions preserve useful
continuity without automatically promoting arbitrary content.

**Independent test**: Drive one disposable Pi session through start, two root
inputs in one active turn, context preparation, successful and failed
compaction, retry, and shutdown, then inspect lifecycle receipts and injected
context.

**Covers**: FR-006, FR-007, FR-008, FR-009, FR-013, SC-005, SC-006, SC-009

**Acceptance scenarios**:

1. **Given** a root Pi session with a verified working directory and session
   ID, **When** the session starts and prepares model context, **Then** thoth-mem
   enrolls and recovers once and injects only a bounded, source-attributed,
   identity-validated recovery block.
2. **Given** two different interactive or RPC root inputs during one active
   agent cycle, **When** Pi admits them, **Then** both sanitized prompts receive
   distinct deterministic capture keys and each appends one ordered root-prompt
   evidence event; an exact retry remains a duplicate.
3. **Given** Pi is about to compact and later reports successful compaction,
   **When** the lifecycle hooks execute, **Then** thoth-mem checkpoints before
   compaction, guides after compaction, and refreshes the next bounded recovery
   block without treating Pi's generated compaction text as an automatic memory
   or supported session summary.
4. **Given** the root Pi session shuts down, **When** the shutdown event fires,
   **Then** thoth-mem finalizes once; agent-settled or failed-compaction events
   do not falsely finalize the root session.
5. **Given** a valid revision-9 database containing existing sessions and their
   dependent evidence, events, summaries, and receipts, **When** the Pi-capable
   runtime opens it, **Then** one verified revision-10 migration locks and
   rechecks the live source against its retained backup before mutation,
   preserves every authoritative row and relation, and allows a new `pi`
   session; a structurally valid but logically different backup is rejected.

### US4 - Fail safely without blocking Pi (Priority: P1)

As a Pi user, I can continue working when thoth-mem is unavailable or returns
invalid data so that memory enrichment never makes a valid prompt unusable.

**Independent test**: Inject child launch, timeout, protocol, oversized-output,
identity, and concurrent cold-start failures while executing input, context,
tool, compaction, and shutdown hooks.

**Covers**: FR-007, FR-009, FR-010, SC-006, SC-007, SC-008

**Acceptance scenarios**:

1. **Given** the thoth-mem child cannot start, times out, exits nonzero, or
   returns an invalid or oversized envelope, **When** a Pi prompt or lifecycle
   hook continues, **Then** no unverified memory is injected, the prompt is not
   rejected, and only a bounded diagnostic is emitted.
2. **Given** the MCP child and lifecycle child reach a fresh shared data
   directory concurrently, **When** both initialize, **Then** schema bootstrap
   converges safely or one path degrades truthfully without corrupting the
   database or blocking Pi.
3. **Given** a delegated, ambiguous, incomplete, or child-key-mismatched Pi
   identity, **When** lifecycle attempts root-only capture or recovery, **Then**
   it receives no root authority and injects no unverified context.

## Edge cases

- Pi is absent, its version output is malformed, or its package-manager
  capabilities differ from the certified contract.
- Pi already has thoth-mem from a different public version, local path, or
  conflicting package provenance.
- A local package path is relative, missing, unbuilt, or identifies a different
  package.
- One Pi process reloads or disables the extension while a managed MCP child is
  starting, serving a tool call, or shutting down.
- Multiple `context` events occur without new input, or the same `input` event
  is retried.
- A compaction attempt fails after the pre-compaction checkpoint, succeeds
  without a usable summary, or is followed immediately by shutdown.
- The current directory is non-Git, a linked worktree, moved, or renamed.
- Tool results or recovery output approach Pi's or thoth-mem's size limits.
- Pi runs on supported Windows or Linux layouts where its executable is a shell
  shim rather than a direct binary.
- A revision-9 database contains sessions referenced by evidence, ordered
  events, summaries, or lifecycle receipts when the harness constraint widens.
- Migration is interrupted after its verified backup or during the sessions
  table rebuild.

## Functional requirements

- **FR-001 — CLI MUST Provide Managed Setup for OpenCode, Codex, Claude Code, and Pi**: `[RENAMED cli FROM CLI MUST Provide Managed Setup for OpenCode, Codex, and Claude Code]` The CLI MUST retain current runtime, import, project administration, and existing managed setup behavior while accepting `thoth-mem setup pi` as a global managed Pi-package installation path with public and explicit-local provenance.
- **FR-002 — Setup MUST Merge Only Managed Configuration**: `[MODIFIED cli]` OpenCode, Codex, and Claude Code setup MUST preserve their current ownership contracts. Pi setup MUST use Pi's native package manager to inspect, install, repair, and verify only the exact thoth-mem package, MUST record only receipt-owned thoth-mem state, and MUST preserve unrelated Pi packages, extensions, Skills, settings, and files during success or rollback.
- **FR-003 — Pi setup verification**: `[INTERNAL]` Pi setup MUST fail closed before mutation when the executable, version, package-manager capabilities, requested public version, or explicit local package provenance cannot be verified; MUST obey the existing zero-write plan, atomic mutation, receipt, rollback, and idempotency contracts; MUST report completion only after an independent installed-state check; and MUST treat an independently verified committed receipt as terminal so later unrelated package-manager drift or cleanup failure cannot trigger rollback of the valid managed package.
- **FR-004 — Every Native Plugin MUST Bundle Hooks, MCP, and Skills**: `[MODIFIED harness-integration]` Every supported host bundle, including Pi, MUST package its supported lifecycle hooks, one registration path for the shared exact six-tool memory surface, and the same canonical memory Skill without stale copied contracts. Pi MUST expose the tools through its native extension API while delegating execution to the existing MCP server rather than requiring a community MCP adapter or importing the SQLite runtime into the Pi process.
- **FR-005 — Pi native tool bridge**: `[INTERNAL]` The Pi extension MUST derive all six native tool definitions from the authoritative thoth-mem tool contracts, MUST forward validated calls across a bounded package-relative Node protocol to one managed MCP server child, MUST return bounded Pi-shaped success and error results, and MUST stop or release the child on extension/session teardown without creating a seventh public tool.
- **FR-006 — Runtime Lifecycle MUST Preserve the Core Contract**: `[MODIFIED harness-integration]` OpenCode, Codex, Claude Code, and Pi lifecycle adapters MUST normalize only fields their supported native contracts actually provide and MUST apply shared privacy sanitation before content-derived identity. Pi MUST map documented session start, admitted root input, context preparation, pre-compaction, successful compaction, failed compaction, settled-agent, and shutdown events onto enroll, recover, capture-root, checkpoint-pre-compact, guide-post-compact, non-finalizing degradation or flush, and finalize semantics without automatically promoting prompt, model, tool, summary, or lifecycle content.
- **FR-007 — Root Session Identity MUST Be Verified and Host-Specific Only at the Adapter**: `[MODIFIED harness-integration]` Native adapters, including Pi, MUST resolve the Git common-directory UUID or explicit non-Git path identity from the host working directory, pass an initial display-name hint only for adoption, and preserve the exact canonical project key with a stable root session identity. Pi MUST use its documented session identity and working directory, while delegated, ambiguous, incomplete, or child-key-mismatched identity MUST NOT receive root authority.
- **FR-008 — Lifecycle Events MUST Be Idempotent and Truthful**: `[MODIFIED harness-integration]` Stable capture keys MUST identify distinct sanitized root-user submissions rather than only their enclosing turn. A native immutable message ID MUST be used when available; otherwise, including for Pi root input, a deterministic key MUST bind documented stable session or turn fields with the sanitized prompt fingerprint so different prompts remain distinct and exact retries remain idempotent.
- **FR-009 — Pi recovery and compaction context**: `[INTERNAL]` The Pi adapter MUST cache only validated bounded recovery output, MUST inject or replace only its own source-attributed context block during documented context preparation, MUST refresh that block after successful compaction, MUST preserve an existing safe block when no newer verified response exists, and MUST never inject output whose returned project/session identity disagrees with local dispatch.
- **FR-010 — Native Failures MUST Degrade Without Blocking the Host Prompt**: `[MODIFIED harness-integration]` Child launch, timeout, nonzero exit, protocol failure, oversized output, invalid envelope, tool bridge failure, or unverifiable identity in any native adapter, including Pi, MUST produce bounded safe diagnostics, inject no unverified memory, and MUST NOT reject an otherwise valid host prompt. The Pi extension MUST NOT open SQLite directly, and concurrent MCP/lifecycle cold start MUST preserve the database bootstrap safety contract.
- **FR-011 — Published Package MUST Contain Native Assets for Every Supported Harness**: `[RENAMED packaging FROM Published Package MUST Contain Native Assets for All Three Harnesses]` The packed release MUST keep one coherent OpenCode, Codex, Claude Code, and Pi distribution whose runners or extensions, receipts, Skills, schemas, package metadata, and inventory use the current thoth-mem contract while preserving numeric manifest schema versions where technically required.
- **FR-012 — Packed Verification MUST Exercise Every Host in Disposable State**: `[MODIFIED packaging]` Release verification MUST import the native OpenCode and Pi entries, execute the CLI, validate public and local setup, synchronize Skills, cold-start MCP, and execute lifecycle runners or native extension fixtures for OpenCode, Codex, Claude Code, and Pi without reading or mutating real user homes. The prepublication Pi public-source case MUST resolve `npm:thoth-mem@<candidate-version>` through an ephemeral loopback npm-compatible registry that serves the exact candidate tarball plus a complete, exact runtime dependency closure materialized from the frozen installed graph; MUST deny or detect non-loopback package egress; and MUST prove the installed source, version, manifest, extension, Skill, dependency versions, and integrity ledger came from that hermetic fixture rather than a previously published artifact. It MUST retain supported Windows/Linux portability, strict package-record parsing, exact six-tool assertions, and clear failure for unavailable or ambiguous CLI/package records.
- **FR-013 — Existing session data MUST migrate safely for Pi**: `[INTERNAL]` The SQLite schema MUST advance one revision to widen the `sessions.harness` constraint from the frozen revision-9 allowlist to the current allowlist containing `pi`; MUST create or reuse a retained pre-revision-10 backup and verify that it is structurally valid and logically identical to the exact live revision-9 source while holding a write-excluding migration lock before mutation; MUST reject a valid but mismatched backup or detected source drift; MUST preserve every existing session and dependent authoritative row, identifier, relation, sequence, state, timestamp, receipt, summary, evidence record, and FTS result; MUST fail transactionally with foreign-key and integrity verification; and MUST allow a subsequent idempotent open plus a new Pi lifecycle session.

## Success criteria

- **SC-001** `[buildable]`: CLI and setup tests prove `setup pi` help, parsing, public and explicit-local provenance, version/capability rejection, plan-only zero writes, exact-package ownership, rollback, repair, independent verification, and repeated `changed=false` behavior against disposable state.
- **SC-002** `[buildable]`: All setup integration cases pass while proving Pi manager commands work through supported Windows and Linux executable layouts and preserve every unrelated package and file byte-for-byte.
- **SC-003** `[buildable]`: All Pi extension tests pass while loading the built entry through the native extension contract and proving exactly six registered tool names whose valid calls reach the existing MCP handlers with unchanged schemas and structured semantics.
- **SC-004** `[buildable]`: Skill and package-inventory tests prove Pi discovers the canonical thoth-mem Skill and that the packed tarball contains every required Pi asset with no community MCP adapter or duplicate memory implementation.
- **SC-005** `[buildable]`: Every lifecycle case passes for start/recover, multiple distinct root inputs, exact retry, bounded context injection, pre/post/failed compaction behavior, non-finalizing settled events, shutdown finalization, Git/worktree/path identity, and privacy sanitation through Pi's documented event shapes.
- **SC-006** `[buildable]`: Failure tests inject every bounded child/protocol/identity fault and prove valid Pi prompts continue with no unverified context; a concurrent fresh-data-directory MCP/lifecycle test proves safe bootstrap and usable subsequent memory access.
- **SC-007** `[buildable]`: With installed Pi `0.84.4`, disposable Pi configuration/data/npm directories, and an ephemeral loopback registry seeded from the just-built candidate tarball plus its complete lock-verified runtime dependency closure, the packed public and local package smoke proves Pi installs the exact candidate source/version/assets and dependency ledger with no non-loopback package request, loads the extension and Skill, invokes all six tools, exercises representative lifecycle events, rejects candidate or closure metadata/integrity mismatch, and leaves the real user home unchanged.
- **SC-008** `[buildable]`: Focused suites pass followed by `pnpm run build`, `pnpm test`, `pnpm run integration:verify`, `pnpm run integration:smoke`, `pnpm run benchmark:fixture`, `pnpm run prepublishOnly`, the thoth-sdd validator, and `git diff --check`.
- **SC-009** `[buildable]`: All revision-9-to-10 migration cases pass while proving one retained backup that is structurally valid and logically identical to the locked live source, rejection of a valid-but-mismatched backup and source drift before mutation, byte-equivalent logical contents for every pre-existing authoritative table and FTS result, zero foreign-key failures, rollback on injected interruption, idempotent reopening, and successful creation of one Pi session.

## Assumptions

- Pi `0.84.4` is the initially certified host contract and is available locally
  for disposable real-host smoke verification.
- Pi's documented native extension and package APIs remain the authoritative
  integration boundary: `pi.registerTool`, lifecycle event handlers, package
  metadata, and `pi install`/package inspection commands.
- Managed setup remains global/user-scoped, matching the current setup command;
  Pi project-local installation is not implied by `thoth-mem setup pi`.
- The existing MemoryService, lifecycle command, six MCP schemas/handlers, and
  project identity resolver remain authoritative. Pi requires only the narrow
  revision-10 harness-constraint migration, not Pi-specific tables or row
  semantics.
- Pi has no built-in delegated-agent identity contract; a normal native Pi
  session is root, while any future or community-spawned child must provide a
  separately verified delegation contract before receiving root authority.

## Dependencies

- Pi Agent Harness `0.84.4` extension, package, session, context, compaction,
  shutdown, native-tool, and package-manager contracts.
- The current thoth-mem Node runtime, lifecycle command, MCP server, tool
  schemas, native identity resolver, privacy sanitizer, and bounded envelope
  validators.
- The current revision-9 migration chain, backup verification conventions, and
  sessions/dependent-row integrity checks.
- Existing setup journal, receipt, capability-gate, provenance, rollback, and
  disposable integration-test infrastructure.

## Out of scope

- Adding MCP support to Pi itself or depending on a community MCP adapter.
- Adding a seventh MCP/Pi tool or changing SQLite beyond the declared
  revision-10 session-harness constraint; changing retrieval ranking, memory
  taxonomy, privacy policy, or promotion semantics.
- Teaching community Pi subagent extensions to propagate thoth-mem root
  authority without a verified delegation contract.
- Project-local `pi install -l`, automatic migration of manually copied Pi
  extensions, or removal of unowned Pi files/packages.
- Publishing a new npm release, installing into the real Pi home, or mutating
  the user's current Pi package inventory during implementation.
