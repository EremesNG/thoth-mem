# Design: Codex Plugin Manager Ownership

## Technical Approach

Codex setup will become a strategy-driven state machine whose ownership decision is
computed before mutation and remains immutable for the entire attempt. The decision
combines the classified Codex version, exact capabilities for the selected scope,
and the currently observed manager state. It yields `plugin_manager`,
`legacy_filesystem`, or a blocking classification that performs no mutation.

The modern route delegates marketplace, cache/install, enablement, and generated
activation/config exclusively to Codex. Thoth-mem orchestrates bounded commands and
verification, but never copies legacy assets, merges legacy MCP config, repairs manager
state directly, or falls back after modern mutation starts.

The legacy route is selectable only when modern capability is absent/unprovable for
the selected version and scope and manager state is safely absent or compatible. It
owns only scoped copied assets, metadata, and exact managed config fragments.

Dual-owned migration verifies and checkpoints usable manager state before removal.
Legacy state is removable only through a signed binding receipt or the complete exact
marker + valid metadata + scoped path + stable package/content identity + current
content set. Ambiguity blocks mutation regardless of `--force`.

Receipt V2 is persisted before the first mutation, checkpointed after every command
and migration mutation, and finalized from post-command rereads and verification.
Recovery converges to verified dual or modern state and never restores whole config.

The structured verifier in `src/setup/codex-cli.ts` remains the evidence boundary.
JSON support is per command and fail-closed; strict text parsing is used only when
that command does not advertise JSON.

## Architecture Decisions

### Decision: Select one immutable ownership strategy before mutation

**Choice**: Derive the strategy from version classification, scoped mutation and
verification capabilities, and classified manager state; freeze it at mutation start.
**Alternatives considered**: version-only selection; try-modern-then-fallback; dual paths.
**Rationale**: version is not proof of safe grammar or scope. Runtime fallback
recreates dual ownership; one decision keeps plan, recovery, and rollback deterministic.

### Decision: Give the Codex manager exclusive ownership on the modern route

**Choice**: Modern plans contain only manager mutations, checkpoints, state rereads,
and exact verification; legacy copy, metadata, activation, and MCP writes are forbidden.
**Alternatives considered**: copied backup assets; retained legacy activation; direct cache repair.
**Rationale**: any second writer preserves ambiguity. Manager cache and generated
config are Codex-owned and change only through verified Codex commands.

### Decision: Treat legacy support as a capability-gated strategy, not recovery

**Choice**: Select `legacy_filesystem` only before mutation when modern capability is
absent/unprovable and manager state is safely absent or compatible.
**Alternatives considered**: fallback after failure; legacy beside unclassifiable manager state.
**Rationale**: operational failure is not capability absence, and unclassifiable
manager state may already be an owner.

### Decision: Migrate only with exact, destructive ownership proof

**Choice**: Accept an exact signed binding receipt, or the complete marker + metadata
+ scoped path + stable identity + current content set; checkpoint manager state first.
**Alternatives considered**: name/path or metadata alone; `--force`; remove-first migration.
**Rationale**: lookalikes and stale metadata are not deletion authority. Verify-first
ordering preserves usability and creates an auditable recovery boundary.

### Decision: Add receipt V2 while retaining bounded V1 reads

**Choice**: V2 records strategy, capabilities, pre-existing versus attempt-created
manager state, ordered outcomes, migration fragments, and final logical evidence;
V1 remains readable only for its original claims.
**Alternatives considered**: reinterpret V1; pre-command whole-config hash; incompatible replacement.
**Rationale**: rollback authority comes from attempt evidence. Post-command rereads
avoid stale hashes while versioned decoding preserves bounded recovery.

### Decision: Use stable content identity as legacy freshness authority

**Choice**: Match package, compatible version, packaged content/manifest identity,
harness, scope, target, and owned content; retain executable path as diagnostic only.
**Alternatives considered**: executable equality; package name/version without content.
**Rationale**: shims change without content drift, while name/version alone is too weak.

## Data Flow

1. `src/setup/engine.ts` requests Codex version/help evidence and selected-scope
   manager observations through `src/setup/codex-cli.ts`.
2. Exact structured or strict legacy verification classifies marketplace and plugin
   state independently, using existing finite timeout, output, and reconciliation
   bounds.
3. The engine combines version, scoped capabilities, and manager-state classification
   into one immutable strategy decision before producing a mutating plan.
4. Inspection of legacy assets, metadata, and managed fragments runs without writes.
   `src/setup/harnesses/codex.ts` reports exact fragments and proof components.
5. A clean verified modern state with no proven legacy residue returns
   `complete`, `changed=false`, and creates no mutation receipt.
6. A clean current legacy state under an eligible legacy strategy also returns a
   verified no-op; executable-path-only variation does not change the outcome.
7. Before any planned mutation, `src/setup/receipt.ts` persists an `in_progress` V2
   receipt containing strategy and bounded pre-state evidence.
8. Modern apply attempts manager steps in order. After each command, the receipt is
   checkpointed and config/manager state is reread; command exit alone is not proof.
9. Migration first verifies the usable manager state and persists a migration
   checkpoint, then removes one proven legacy fragment at a time with prior fragment
   data and outcome checkpointed after each removal.
10. Final verification rereads selected-scope state and records exact marketplace
    provenance plus exact installed-and-enabled plugin identity, or exact legacy
    fragment identities, before marking the receipt complete.
11. Recovery reads the receipt version explicitly. An interrupted migration either
    restores only receipt-proven fragments to a verified usable dual state or finishes
    to a verified modern state; partial filesystem shape never implies completion.
12. Rollback operates per receipt strategy. Modern rollback uses only a supported,
    scoped manager removal for attempt-created state; legacy and migration rollback
    alter only receipt-owned fragments. Divergence fails closed.

## File Changes

- `src/setup/engine.ts` — immutable selection, classification, migration order,
  write-ahead checkpoints, rereads, recovery convergence, and status mapping.
- `src/setup/harnesses/codex.ts` — legacy-only config handling and exact fragment plans.
- `src/setup/codex-cli.ts` — structured verification, strict fallback, exact identity,
  scoped capabilities, and optional verified manager removal.
- `src/setup/types.ts` — strategy, capability, manager-state, proof, migration, and V2 contracts.
- `src/setup/receipt.ts` — V1/V2 decoding, V2 validation/signing, checkpoints, authority.
- `src/setup/paths.ts` — separate legacy-owned targets from manager-observed locations.
- `src/setup/filesystem.ts` — bounded legacy digests/snapshots and fragment operations.
- `tests/setup/codex-cli.test.ts` — JSON/text capability, schema, identity, scope, bounds.
- `tests/setup/engine.test.ts` — strategy, migration, ambiguity, interruption, status.
- `tests/setup/rollback.test.ts` — V1/V2 authority, divergence, fragments, idempotency.
- `tests/packaging/packed-install.test.ts` — controlled tarball smoke across ownership routes.
- `README.md`, `codemap.md`, `src/codemap.md` — final ownership and recovery guidance.

## Interfaces / Contracts

- Planned `CodexSetupStrategy`: `plugin_manager | legacy_filesystem`; blocking
  classifications remain planning outcomes, not a third mutating strategy.
- Planned strategy decision contract contains selected scope, classified version,
  exact per-command capabilities, manager-state classification, bounded reasons,
  and an immutability boundary once receipt creation begins.
- Planned manager evidence distinguishes marketplace state from plugin state and
  distinguishes `preExistingVerified` from `createdByAttempt`; only the latter grants
  automatic manager rollback authority.
- Planned legacy ownership proof is a tagged union: signed binding receipt, complete
  corroborating evidence set, or ambiguous. Partial corroboration cannot authorize
  mutation.
- Receipt V2 final modern evidence contains scope, exact marketplace identity and Git
  provenance, exact installed-and-enabled plugin identity, ordered outcomes, and
  bounded diagnostics. Final legacy evidence contains exact fragments and stable
  pre/post identities.
- Receipt readers dispatch by schema version. V1 data is never upgraded in memory to
  claims absent from the signed original; V2 validation remains fail closed.
- Config interaction is fragment-based: reread after every external command, parse
  current content, and apply or restore only exact receipt-owned fragments. No API
  accepts a whole pre-command config as rollback replacement.
- Public setup statuses and exit mapping remain unchanged: `complete`, `partial`,
  `failed`, and `requires_user_action`, with ordered steps and bounded diagnostics
  carrying strategy/migration detail.
- Existing command timeouts, output caps, reconciliation limits, diagnostic bounds,
  and receipt bounds remain authoritative; no loop or evidence field is unbounded.

## Testing Strategy

- Use injected Codex executors and isolated global/project homes; assert command order,
  mutation count, checkpoint order, exact final state, and byte/semantic preservation
  of unrelated state.
- Test version/capability/manager-state matrices, including partial capability and
  unclassifiable manager state, without guessing unsupported command forms.
- Preserve current structured-verifier tests and add malformed advertised JSON,
  schema mismatch, per-command mixed JSON support, strict legacy format, provenance
  aliases, lookalikes, and output-bound cases.
- Exercise clean modern, clean legacy, proven dual, ambiguous, partial, and interrupted
  states for global and supported project scopes. Repeat every successful case to
  prove `changed=false` and zero mutating commands.
- Prove failures after modern selection never copy assets or merge legacy activation.
- Prove `--force` cannot manufacture ownership and ambiguous fixtures remain unchanged.
- Test path-only executable variation separately from package/content drift.
- Test receipt V2 write-ahead failure, per-command checkpoint failure, interrupted
  removal, V1 bounded recovery, tamper/divergence rejection, and fragment-only rollback.
- Install the npm tarball in controlled packed tests; preserve existing OpenCode and
  Claude coverage and verify Codex modern/legacy assets share one stable identity.
- Automated tests never read credentials or mutate a real Codex home. A real Codex
  mutation smoke is a separate, explicit authorization step using disposable homes.

## Migration / Rollout

1. Land the strategy/evidence types and V1/V2 receipt reader before changing apply.
2. Integrate structured verification and capability classification behind controlled
   fixtures, preserving finite bounds and existing result contracts.
3. Split modern and legacy planning/apply paths; verify both clean no-op states.
4. Enable dual-state migration only after write-ahead receipts, manager checkpoints,
   fragment proof, and recovery tests pass.
5. Extend controlled packed-artifact coverage across global/project scopes.
6. Update operator documentation after verified implementation behavior is stable.
7. Keep real Codex smoke disabled until separate user authorization is recorded.

Rollback of the code change preserves manager-owned state and readable V1 receipts.
Runtime recovery follows the selected receipt: pre-removal failure leaves verified
dual state; post-removal recovery restores proven fragments or completes verified
modern state. Whole user config restoration is never part of rollout or rollback.

## Consumed handoffHints

- Preserve clean modern, clean legacy, proven dual, ambiguous, partial, interrupted,
  project/global, repeat no-op, and executable-path-variation coverage.
- Preserve one immutable strategy, exact independent manager verification, aggregate
  statuses, and the ban on modern-to-legacy runtime fallback.
- Preserve the pinned destructive proof alternatives, manager checkpoint before
  removal, and pre-existing-versus-attempt-created rollback authority.
- Preserve V1 readability, post-external logical evidence, fragment rollback, bounded
  private diagnostics, and every existing finite execution/evidence bound.
- Preserve one canonical packed identity, checkout independence, OpenCode/Claude
  smoke coverage, controlled Codex fixtures, and the separate real-smoke gate.

## Open Questions

- Which existing exported receipt and rollback type names in `src/setup/types.ts` and
  `src/setup/receipt.ts` should be extended rather than wrapped by new contracts?
- Does the supported Codex compatibility table belong in `src/setup/codex-cli.ts` or
  an existing setup compatibility module? Confirm from imports before tasks name it.
- Which exact Codex manager removal commands and project-scope forms are both exposed
  and independently verifiable? Unsupported forms must remain manual-only.
- Which current helper owns managed TOML fragment parsing/removal, and can it express
  fragment restore without a whole-file snapshot? Confirm before assigning edits.
- What existing fixture directories/assets support `tests/packaging/packed-install.test.ts`?
  Tasks must use discovered paths rather than invent new fixture locations.
- Is documentation required in the first implementation batch or after controlled
  verification establishes final operator wording?

## Constitution Check

- **P1 — Compact, Workflow-Level MCP Surface: PASS.** No MCP tools are added,
  removed, or re-registered; setup remains CLI/harness integration work.
- **P2 — Deterministic-First Retrieval With Safe Degradation: PASS.** Retrieval lanes
  and degradation semantics are untouched.
- **P3 — Harness-Agnostic Memory Contract: PASS.** Codex-specific capability and
  manager payloads stay at the setup adapter boundary; storage, sync, taxonomy, and
  six-tool semantics remain unchanged. Unsupported capability is explicit and
  evidence-backed rather than simulated. OpenCode and Claude parity tests remain.
- **P4 — Token-Efficient, Bounded Recall Outputs: PASS.** Recall contracts are
  untouched, and setup diagnostics/evidence retain finite output bounds.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline: PASS.** Existing
  setup status/exit contracts and public MCP/HTTP/CLI names remain compatible; receipt
  evolution is additive and backward-readable.

The design also respects governed OpenSpec persistence, write-capable phase ownership,
controlled multi-harness verification, and evidence-led safety gates. No constitution
principle is violated, so finalization is not blocked and no override is required.
