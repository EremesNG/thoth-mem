# Requirements Quality Checklist: Codex Plugin Ingestion and Reporting Fix

## Domain: cli

### Completeness

- [x] All 6 CLI delta requirements are present (4 added, 2 modified), including the exact inherited requirement names needed for deterministic merge.
- [x] Independent marketplace and plugin attempts, exact reread authority, nonzero-then-verified success, deterministic aggregate statuses, and the no-legacy-fallback invariant are covered.
- [x] Bounded and redacted nonzero diagnostics, evidence-driven receipt checkpoints, truthful human/JSON rendering, and automated state isolation are each covered by named requirements.
- [x] Clean installation, orphan collision, mixed outcomes, checkpoint failure, oversized output, secret-bearing output, and packed-flow isolation have concrete scenarios.
- [x] The accepted clean Codex 0.144.0 and current v0.3.7 ingestion evidence is preserved without requiring plugin asset or package changes.

### Clarity

- [x] Exact selected-scope list verification is explicitly authoritative; exit codes, diagnostics, and hidden paths are explicitly secondary.
- [x] `complete`, `partial`, `failed`, and `requires_user_action` have mutually distinguishable evidence conditions: an ordinary one-success/one-safe-failure result is `partial`, while corroborated ambiguity requiring manual recovery takes precedence as `requires_user_action` even when the other operation verifies.
- [x] Attempt checkpoints, reread checkpoints, final derivation, and rendering responsibilities are ordered explicitly.
- [x] Plan-only `planned` outcomes are distinguished from final mutating outcomes, preventing blanket promotion of planned rows.

### Measurability

- [x] Command output, safe diagnostic, receipt checkpoint-count, and receipt-size bounds are fixed at 64 KiB, 512 characters, 256 checkpoints, and 1 MiB respectively.
- [x] Operation and final statuses are measurable through exact manager lists and the count of independently verified requested operations.
- [x] Cross-surface consistency is measurable by comparing ordered step outcomes and final status across human output, JSON, and the signed receipt.
- [x] Real-home protection is measurable through disposable target paths, injected or controlled execution, and absence of ambient credential or manager-state access.

### Testability

- [x] Every CLI requirement has at least one GIVEN/WHEN/THEN scenario suitable for controlled executors and disposable filesystem fixtures.
- [x] Positive, mixed, nonzero, checkpoint-failure, privacy, output-limit, and isolation cases have deterministic observable assertions.
- [x] All CLI requirements use RFC 2119 keywords and remain behavior-focused rather than prescribing source modules.
- [x] Existing status, step-outcome, receipt-version, and safety-bound compatibility can be verified without real Codex mutation.

## Domain: harness-integration

### Completeness

- [x] All 4 harness-integration delta requirements are present (3 added, 1 modified), including the exact inherited ownership-strategy requirement name and its modern-failure scenario.
- [x] Hidden or orphan residue versus registered state, corroborated classification, supported reconciliation, fail-closed manual recovery, and no legacy fallback are covered.
- [x] Selected-scope authority, divergent provenance, path/link containment, concurrent manager activity, force behavior, and exact post-reconciliation verification are represented.
- [x] The spec covers both safe future supported-manager reconciliation and the current zero-cleanup default when no such mechanism is proven.

### Clarity

- [x] Classification evidence is separated from registration proof, ownership proof, and cleanup authority.
- [x] A temporary path or collision message alone is explicitly insufficient, while exact selected-scope list evidence remains authoritative.
- [x] Automatic reconciliation is limited to a tested Codex-supported selected-scope operation; direct filesystem repair is explicitly forbidden.
- [x] Manual guidance content is specified precisely enough to be actionable without exposing user-specific or unrelated state.

### Measurability

- [x] Registered state is measurable through exact list identity and selected scope rather than hidden filesystem artifacts.
- [x] Orphan classification requires two observable corroborating facts plus absence of conflicting scope, provenance, containment, link, or concurrency evidence.
- [x] Reconciliation ordering is measurable through decision checkpoint, supported operation attempt, exact reread, and persisted post-state.
- [x] Fail-closed behavior is measurable as zero direct cleanup, unchanged strategy ownership, and `requires_user_action` when proof is insufficient.

### Testability

- [x] Every harness-integration requirement has at least one GIVEN/WHEN/THEN scenario using controlled list, command, path, provenance, and concurrency fixtures.
- [x] Orphan-only, message-only, wrong-scope, exact-verified, escaped-link, concurrent-state, force, and supported-reconciliation cases are deterministic.
- [x] All harness-integration requirements use RFC 2119 keywords and describe observable capability and state behavior.
- [x] Scenarios can run with disposable `CODEX_HOME` fixtures and do not require credentials or a real personal/global Codex installation.

## Packaging Delta Assessment

- [-] waived: No packaging delta is authored because the existing main packaging specification already requires packed-artifact execution, injected or controlled Codex command behavior, disposable homes/projects, no real-home mutation, and separate authorization for real Codex smoke. This change adds test coverage but no distinct packed-artifact content or installation obligation.

## Clarification and Handoff Readiness

- [x] Defensible defaults are recorded in each spec's `## Assumptions` section.
- [x] No `[NEEDS CLARIFICATION]` marker is required; no unresolved fork lacks a fail-closed default.
- [x] Clarify/design must preserve exact selected-scope authority, independent operations, existing public result vocabularies, existing receipt/output bounds, and zero direct cleanup without a proven supported mechanism.
- [x] Clarify/design may introduce an additive receipt distinction or supported reconciliation path only after proving the existing ledger or fail-closed default is insufficient.

## Gate Result

- [x] Every authored domain covers completeness, clarity, measurability, and testability.
- [x] The delta contains 10 total requirements (7 added, 3 modified) and 45 scenarios; all 3 modified requirements use exact main-spec names and complete RFC 2119/GIVEN-WHEN-THEN behavior.
- [x] Every requirement uses RFC 2119 language and has at least one GIVEN/WHEN/THEN scenario.
- [x] Every checklist item is checked or explicitly waived.
- [x] Zero open checklist items or blockers remain for the spec-to-clarify or later spec-to-tasks transition.
