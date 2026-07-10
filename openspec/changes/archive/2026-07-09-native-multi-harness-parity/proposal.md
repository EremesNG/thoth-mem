# Proposal: Native Multi-Harness Parity

## Intent

Make thoth-mem directly installable and behaviorally consistent across OpenCode,
Codex, and Claude Code without requiring a separate orchestration plugin to own
memory lifecycle behavior. The change will move the reusable, memory-only
lifecycle behavior into thoth-mem, ship native harness assets, and provide safe
setup flows for OpenCode and Codex while supporting Claude Code's repository
marketplace installation flow.

This closes the current gap between the documented manual MCP configuration and
the desired deterministic integration experience. It preserves the existing
SQLite memory model, stable identity resolver, retrieval behavior, and compact
six-tool MCP contract.

## Scope

### In Scope

- Extract and adapt a thoth-mem-owned, host-neutral memory lifecycle core that
  contains only reusable memory behavior: root-session enrollment, stable
  project/session identity propagation, memory protocol guidance, bounded
  lifecycle state, prompt normalization, privacy filtering, tool-result
  normalization, recall nudges, compaction handling, and session finalization.
- Define native adapters and packaged assets for all three target harnesses:
  - an OpenCode plugin/hook integration installable through
    `thoth-mem setup opencode`;
  - a Codex plugin/hook/skill integration installable through
    `thoth-mem setup codex`, with best-effort CLI registration;
  - Claude Code marketplace/plugin manifests and portable hooks that make
    `claude plugin marketplace add EremesNG/thoth-mem && claude plugin install thoth-mem`
    a supported installation path.
- Add a managed setup engine for OpenCode and Codex with global scope as the
  default and an explicit project scope. The engine will calculate and report a
  plan, merge owned configuration without replacing unrelated user settings,
  create backups before mutation, record enough ownership metadata for rollback,
  support rollback, and require an explicit force option for managed conflicts.
- Make Codex setup attempt both marketplace registration and plugin installation
  when the detected CLI exposes those operations. Because plugin installation is
  not a stable documented Codex CLI contract, setup will finish with an explicit
  `complete`, `partial`, or `requires_user_action` state and show precise manual
  actions instead of reporting false success.
- Automatically persist only genuine root-user prompts. Prompt capture will strip
  private-tagged content, apply a documented bound, preserve the root session and
  project identity, and exclude sub-agent prompts, generated handoffs, assistant
  text, tool scaffolding, and other non-user input. Persisted rows remain subject to
  the existing `Store.savePrompt` canonical-row behavior: byte-identical content in
  the same session within 30 seconds resolves to the existing row rather than
  creating a second row.
- Use portable Node-based hook runners and path resolution so packaged integrations
  do not depend on Bash, PowerShell, a repository checkout, or the caller's current
  working directory.
- Extend package/build/release inputs so all required manifests, skills, hooks,
  runners, and adapter entry points are present in the published artifact.
- Add isolated adapter contract tests, setup transaction tests, package-content
  checks, packed-artifact installation smoke tests, and documentation for native,
  partial, and manual-completion flows.

Material behavior changes:

- **From:** each harness must be configured manually and deterministic memory hooks
  are not owned by the thoth-mem package. **To:** thoth-mem ships a shared memory
  lifecycle core plus native per-harness adapters. **Reason:** memory behavior
  should remain consistent without harness-specific reimplementation. **Impact:**
  lifecycle behavior, adapter assets, package contents, integration tests, and
  installation documentation become thoth-mem responsibilities.
- **From:** OpenCode and Codex setup requires users to locate and merge configuration
  themselves. **To:** `thoth-mem setup opencode` and `thoth-mem setup codex` provide
  planned, scoped, reversible managed installation. **Reason:** native integration
  must be safe enough for existing user configurations. **Impact:** the public CLI
  gains additive setup and rollback behavior, configuration ownership receipts,
  backups, conflict detection, and explicit result states.
- **From:** prompt capture behavior can vary by harness and may observe generated or
  delegated traffic. **To:** all adapters apply one root-user-only, privacy-sanitized
  capture contract while preserving the Store's existing same-session,
  byte-identical-content collapse within 30 seconds. **Reason:** prompt persistence
  is user intent and must not be polluted by agent-generated content, while current
  storage compatibility remains authoritative. **Impact:** hook event mapping and
  tests must prove prompt ownership, privacy, bounds, duplicate-delivery suppression,
  and the canonical-row collapse across harnesses.

### Deferred / Needs Discovery

- The exact native event-to-lifecycle mapping and capability/version matrix for
  each harness needs specification and design against the APIs available at
  implementation time. Missing lifecycle events must degrade explicitly rather
  than being simulated as successful events.
- Codex marketplace and plugin-add command discovery needs a bounded compatibility
  strategy because the plugin-add surface is not a stable documented contract.
  The required product outcome is fixed: attempt supported commands, preserve
  diagnostics, and return one of the three explicit setup states.
- The final packaging topology for the shared core and adapters (single bundled
  package versus package-internal entry points/assets) needs build and packed-tarball
  proof. All target harness assets remain in the accepted scope regardless of the
  selected topology.
- Exact retry, terminal-session, duplicate-event, malformed-private-tag, and
  process-restart state transitions need scenario-level specification. Design must
  ensure a failed memory operation does not advance lifecycle state as if it had
  succeeded.
- Repointing or retiring overlapping memory behavior in the separate thoth-agents
  repository remains a visible downstream follow-up unless design proves that a
  minimal compatibility edit is indispensable to avoid two active owners.

### Out of Scope

- Adding, removing, renaming, or splitting MCP tools. The public MCP surface remains
  exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and
  `mem_session`.
- SQLite schema changes, data migrations, observation taxonomy changes, retrieval
  lane/ranking changes, sync-format changes, or new HTTP memory semantics.
- Adding an optional prompt idempotency key, changing prompt storage cardinality,
  bypassing the existing 30-second canonical-row collapse, or expanding any public
  MCP tool request/response contract to distinguish intentional byte-identical
  repeats.
- Agent rosters, sub-agent dispatch, phase reminders, terminal multiplexing, SDD
  routing, or any other orchestration behavior from a larger harness plugin.
- Trust or permission bypasses, automatic approval of external commands, silent
  installation outside the selected scope, or modification of unrelated user
  configuration.
- Silent retirement, deletion, or broad refactoring of the separate thoth-agents
  repository.
- Editing generated `dist/` output directly or treating a local repository checkout
  as a runtime dependency.
- Publishing with user credentials or performing remote marketplace/release actions;
  this change prepares and verifies the repository artifacts and documented flows.

## Approach

1. Specify a small harness-neutral lifecycle contract around the existing six MCP
   operations and stable identity resolver. Keep adapter-facing events normalized
   and make state transitions conditional on confirmed operation outcomes. Stable
   event/message identity suppresses duplicate delivery and duplicate lifecycle
   effects, but it does not override the Store's canonical-row collapse or promise
   two stored rows for intentional byte-identical repeats inside 30 seconds.
2. Implement thin OpenCode, Codex, and Claude Code adapters that translate native
   events into that contract. Harness-specific SDK types, configuration shapes, and
   command detection remain at adapter boundaries.
3. Implement setup as a transaction-like workflow: inspect capabilities and current
   configuration, produce a deterministic plan, validate ownership/conflicts, back
   up affected files, apply managed merges, verify the resulting installation, and
   emit a receipt and explicit final state. Rollback consumes that receipt and
   restores only managed changes.
4. Package integrations through Node entry points and repository-owned manifests,
   then test the actual packed artifact in isolated temporary harness homes and
   project directories.
5. Document native setup, project-scoped setup, plan-only inspection, rollback,
   force semantics, Claude Code marketplace installation, and manual recovery for
   partial Codex capability.

## Affected Areas

- `src/cli.ts`, `src/index.ts`, and new focused CLI setup/rollback modules for
  command parsing, scope selection, result reporting, and failure exit behavior.
- New thoth-mem-owned lifecycle-core and harness-adapter modules; exact paths and
  public/internal boundaries are a design decision.
- OpenCode plugin/hook assets, Codex plugin/skill/hook assets, Claude Code
  `.claude-plugin` marketplace/plugin manifests, and portable Node hook runners.
- `src/store/identity.ts` as a reused identity contract; behavioral changes to the
  resolver are not expected unless later specification proves a compatibility gap.
- `package.json`, `scripts/build.mjs`, package file allowlists, executable entry
  points, and release/package smoke validation.
- `skills/thoth-mem/SKILL.md`, README installation guidance, and harness-specific
  operator documentation where packaging and lifecycle instructions must agree.
- Tests for CLI routing, plan/merge/backup/rollback/force behavior, adapter lifecycle
  parity, privacy and root ownership, package contents, and installation from the
  packed artifact.
- OpenSpec domains expected in the next phase: `harness-integration`, `cli`,
  `packaging`, and a constrained delta to `tools` that preserves the six-tool
  registry.

## Risks

- Harness event and plugin APIs can change independently. Mitigation: keep a stable
  internal lifecycle contract, isolate version/capability checks in adapters, and
  report unsupported capabilities explicitly.
- Managed setup could corrupt or overwrite user configuration. Mitigation: parse
  before writing, produce a plan, merge only owned keys, use atomic writes and
  backups, verify after mutation, and refuse conflicts without force.
- Best-effort Codex command execution could claim installation when only marketplace
  registration succeeded. Mitigation: derive the final state from independently
  verified steps and expose `partial` or `requires_user_action` with exact recovery
  instructions.
- Automatic prompt hooks could persist private or generated content. Mitigation:
  centralize root-user ownership checks, private-tag sanitization, content bounds,
  event deduplication, and negative fixtures for delegated/generated traffic.
- Users could interpret distinct event identity as a guarantee of distinct stored
  rows for intentional byte-identical prompts. Mitigation: document and test that
  event identity prevents duplicate delivery/effects while `Store.savePrompt`
  preserves one canonical row for same-session identical content inside 30 seconds.
- Lifecycle state could drift after failed calls, duplicate events, restart, or
  deletion. Mitigation: advance state only on confirmed success, make operations
  idempotent where possible, define retries and terminal events explicitly, and test
  failure/restart sequences.
- Package allowlist or build omissions could make source-tree tests pass while the
  published integration is broken. Mitigation: inspect and install the packed
  artifact in release smoke tests rather than testing only repository paths.
- Cross-platform command and path differences could break hooks. Mitigation: use
  Node runners, avoid shell-specific syntax, and exercise Windows and POSIX paths.
- Two repositories could temporarily own overlapping memory hooks. Mitigation: keep
  the external retirement/repointing follow-up visible and document how to avoid
  enabling duplicate integrations during transition.

## Rollback Plan

- Every mutating setup run will create a pre-change backup and a managed receipt.
  Rollback will restore the backed-up managed files or remove only entries created
  by thoth-mem, while preserving unrelated settings added after installation.
- Plan-only mode provides a no-write escape hatch; detected conflicts stop before
  mutation unless the user explicitly selects force.
- Harness integrations can be disabled by removing their managed hook/plugin entry
  and restoring the prior configuration. This does not alter stored memories,
  database schema, MCP server behavior, or the six-tool registry.
- If a release artifact is incomplete, revert the package/build/manifest additions
  and publish a corrected package; existing manual MCP configuration remains a
  supported fallback.
- If the shared lifecycle core is unstable for one harness, disable only that
  adapter and report manual completion while keeping the other adapters and the MCP
  server operational.

## Success Criteria

- `thoth-mem setup opencode` installs from a packed npm artifact into an isolated
  clean global harness home, and an explicit project scope installs only inside the
  selected project. A second identical run is an idempotent no-op with a verified
  `complete` result.
- `thoth-mem setup codex` attempts the detected marketplace and plugin installation
  operations and returns a machine-readable and human-readable `complete`, `partial`,
  or `requires_user_action` state. Unsupported commands produce exact manual next
  actions and never report `complete`.
- A repository marketplace add followed by `claude plugin install thoth-mem`
  validates and installs the packaged Claude Code plugin, whose hooks use portable
  Node entry points rather than checkout-relative or shell-specific paths.
- Plan-only setup performs zero writes. A conflicting managed entry is refused
  without force. Every mutating run creates a backup/receipt, and rollback restores
  the pre-run managed configuration in isolated global and project-scope fixtures.
- The same lifecycle contract suite passes for OpenCode, Codex, and Claude Code:
  stable root session/project identity is propagated; start is retryable after a
  failed operation; repeated delivery of the same event/message identity produces
  one lifecycle effect and no additional prompt row; and compaction/finalization
  outcomes are explicit.
- Automatic capture submits each genuine root-user prompt fixture for bounded,
  sanitized persistence, removes valid private-tagged content, handles malformed
  private tags without leaking protected content, and persists zero records for
  sub-agent prompts, generated handoffs, assistant output, or tool scaffolding.
  Storage tests prove that two intentional byte-identical prompts in the same
  session within 30 seconds resolve to one canonical row, without claiming a second
  row from distinct event/message identity; prompts outside that canonical-collapse
  condition continue to follow existing Store behavior.
- Package-content verification proves that the npm tarball includes every required
  manifest, skill, hook, adapter, and runner. Installation smoke tests execute from
  the packed artifact without relying on files outside it.
- Windows and POSIX smoke coverage proves that paths containing spaces and global
  and project-scoped installations invoke the same Node runners successfully.
- Existing MCP registry tests continue to expose exactly six tools; no schema or
  retrieval behavior changes are introduced; `pnpm run build` and `pnpm test` pass.
- README and packaged instructions document OpenCode setup, Codex setup states,
  Claude Code marketplace installation, project scope, plan, backup, rollback,
  force, privacy, and manual recovery consistently with executable behavior.
