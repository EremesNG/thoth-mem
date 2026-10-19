# Requirements Quality Checklist: Native Multi-Harness Parity

## Domain: harness-integration

### Completeness

- [x] Covers host-neutral lifecycle parity, all three adapter capability mappings, root-only prompt ownership, privacy, stable identity, confirmed-success transitions, retry, duplicate delivery, restart, compaction, finalization, and degradation.
- [x] Covers positive, negative, failure, restart, unavailable-capability, and privacy-edge outcomes while preserving the proposal's orchestration exclusions.

### Clarity

- [x] Distinguishes root-user input from delegated/generated traffic and distinguishes confirmed, failed, unsupported, degraded, pending, and no-op outcomes.
- [x] Records informed assumptions for exact capability/outcome vocabularies, prompt cardinality/bounds, malformed private tags, stable event evidence, identity authority, and adapter-boundary event names.

### Measurability

- [x] Uses observable counts and states: one or zero prompt-persistence operations per event, one canonical row for same-session byte-identical content inside 30 seconds, stable identity values, confirmed transitions, no duplicate effects, and explicit capability outcomes.
- [x] Requires bounded diagnostics plus an exact 8,000-Unicode-code-point post-sanitization prompt limit, deterministic prefix truncation, and zero records for private-only content.

### Testability

- [x] Every requirement has at least one GIVEN/WHEN/THEN scenario and every normative statement uses RFC 2119 language.
- [x] Scenarios support an adapter contract suite with duplicate delivery, distinct intentional identical prompts inside/after 30 seconds, retry, restart, malformed-private-tag, compaction, and terminal sequences.

## Domain: cli

### Completeness

- [x] Covers both setup commands, global default, explicit project scope, plan-only, managed merge, conflict/force, backups, atomicity, verification, receipts, rollback, idempotency, Codex best effort, result states, and exit codes.
- [x] Covers reversible filesystem changes separately from partially reversible Codex external operations and includes recovery evidence for both.

### Clarity

- [x] Defines exact public controls, JSON field types, step outcomes, and mutually exclusive meanings of `complete`, `failed`, `partial`, and `requires_user_action`, including plan/no-op precedence.
- [x] Distinguishes selected scope, managed ownership, unrelated settings, conflicts, force authority, backups, receipts, and manual actions.

### Measurability

- [x] Fixes exit codes at `0`, `1`, `2`, and `3` and requires machine-readable fields, per-step outcomes, `changed`, and receipt evidence.
- [x] Makes zero-write plan statuses, no-op reruns, write-ahead receipts, interrupted recovery, backup coverage, ownership-bounded forced rollback, preserved settings, and Codex steps observable.

### Testability

- [x] Every requirement has at least one GIVEN/WHEN/THEN scenario and every normative statement uses RFC 2119 language.
- [x] Scenarios cover clean, conflicting, forced, failed-write, repeated, rollback, unsupported-command, mixed Codex outcome, global, and project fixtures.

## Domain: packaging

### Completeness

- [x] Covers native OpenCode, Codex, and Claude Code assets; portable runners; tarball inventory; version/path integrity; and packed-artifact installation behavior.
- [x] Covers global and project installs, marketplace/plugin discovery, missing assets, stale versions, unsafe paths, unrelated working directories, and inaccessible source checkouts.

### Clarity

- [x] Defines the npm tarball as authoritative, pins canonical inventory cardinality and exact manifest-version equality, and distinguishes package root, marketplace root, harness home, project target, and source checkout.
- [x] Identifies the required asset categories and the portability constraints without fixing an internal module topology.

### Measurability

- [x] Requires lexical and resolved-realpath containment, unique reconciled inventory entries, exact package-version equality, and independently verified smoke outcomes.
- [x] Requires explicit Windows and POSIX path-with-spaces coverage and detects every attempted external-checkout dependency as a failure.

### Testability

- [x] Every requirement has at least one GIVEN/WHEN/THEN scenario and every normative statement uses RFC 2119 language.
- [x] Scenarios can run in isolated temporary homes/projects against the actual tarball with controlled harness capability fixtures and no release credentials.

## Domain: tools

### Completeness

- [x] Covers exclusive use of the six existing tools, registry preservation, request/response compatibility, identity behavior, authoritative 30-second prompt-row cardinality, retrieval semantics, and operational-surface exclusions.
- [x] Covers both adapter-driven lifecycle calls and unchanged behavior for existing non-harness-specific MCP clients.

### Clarity

- [x] Lists the exact six registered tool names and separates memory workflows from setup, rollback, marketplace, packaging, admin, sync, and capability operations.
- [x] States which storage/retrieval/public contracts remain unchanged and records that no idempotency key, harness event field, or other public tool input is added.

### Measurability

- [x] Requires an exact six-tool registry, explicit lifecycle-to-tool mapping, adapter-side diagnostics, and byte-for-byte deterministic fixed-input parity for storage/retrieval behavior.
- [x] Makes forbidden additions observable through registry inspection, request validation, cross-harness retrieval, and operational-surface tests.

### Testability

- [x] Every requirement has at least one GIVEN/WHEN/THEN scenario and every normative statement uses RFC 2119 language.
- [x] Scenarios support existing registry and tool contract regression suites plus integration-enabled parity checks for each harness.

## Gate Result

- [x] All four required quality dimensions are complete for every authored domain; no checklist item is open or waived.
- [x] The bounded taxonomy scan is complete; no `[NEEDS CLARIFICATION]` marker remains and clarified defaults are recorded in each spec's Assumptions and Handoff Hints sections.
