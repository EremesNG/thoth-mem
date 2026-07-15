# Proposal: Codex Plugin Ingestion and Reporting Fix

## Intent

Make `thoth-mem setup codex` diagnose and handle Codex plugin-manager failures without misreporting planned work as confirmed. A clean isolated Codex 0.144.0 home can register marketplace `EremesNG/thoth-mem` and install `thoth-mem@thoth-mem` version 0.3.7, so the published plugin bundle is ingestible. The reproduced failure instead comes from an orphaned `.codex/.tmp/marketplaces/thoth-mem` checkout: no marketplace is registered in `config.toml` or the exact manager list, yet another add exits 1 with `marketplace 'thoth-mem' is already added from a different source; remove it before adding this source`.

The setup wrapper currently discards useful stdout and stderr for nonzero commands, reducing that failure to an opaque exit code. The engine then projects remaining planned checkpoint, reread, and final-verification rows as `confirmed`, even though the signed receipt and exact manager lists show the requested state was not established. This change will preserve bounded, redacted failure evidence, classify stale manager residue without treating it as successful registration, and derive every reported step from observed execution and verification evidence.

The exact independent manager list remains authoritative. A nonzero mutation followed by exact verified state remains a valid success, marketplace and plugin operations remain independent, receipt checkpoint ordering remains durable, and a modern operational failure never activates the legacy filesystem strategy.

## Scope

### In Scope

- Preserve useful nonzero Codex command evidence through the internal command-result path instead of replacing stdout and stderr with empty strings.
- Convert command evidence into bounded, privacy-safe diagnostics before it reaches user-facing results or receipts. Credentials, secrets, raw configuration, unrelated marketplace/plugin entries, and unbounded output MUST remain excluded.
- Distinguish the reproduced orphaned marketplace checkout collision from a registered marketplace by combining the bounded command failure with exact selected-scope marketplace list evidence. Neither the temporary path nor the error text alone establishes registration or ownership.
- Carry the accepted full-flow goal forward: define a safe reconciliation outcome for orphaned pre-registration residue so setup can either continue through a proven Codex-supported recovery mechanism or stop with precise `requires_user_action` guidance. Unproven direct deletion of Codex-owned state is not permitted.
- Preserve exact independent marketplace and plugin list verification as the only authority for final manager state. Command exit code and diagnostic text are secondary evidence.
- Preserve nonzero-then-verified behavior: if a mutation returns nonzero but the subsequent exact list independently proves the requested state, the operation MAY be confirmed and setup MAY continue.
- Keep marketplace registration and plugin installation/enablement independent. A marketplace failure MUST NOT suppress an otherwise safely available plugin attempt, and a plugin failure MUST NOT rewrite the marketplace outcome. One verified operation and one ordinary safely attempted failure or unverified result MUST remain `partial`. When corroborated orphan residue or ownership ambiguity prevents safe recovery and requires manual intervention, `requires_user_action` MUST take precedence even if the independent other operation verifies. Neither operation outcome may be inferred from the other.
- Derive checkpoint, reread, mutation, and final-verification step outcomes from actual persisted checkpoints and verification evidence. Planned rows MUST NOT be blanket-promoted to `confirmed`.
- Preserve receipt ordering: record each attempted mutation outcome, durably checkpoint it, perform the independent reread, checkpoint the verified or failed result, and only then derive final status.
- Add deterministic regression coverage for clean manager installation, orphaned temporary checkout collision, bounded/redacted nonzero diagnostics, nonzero-then-verified success, independent mixed outcomes, receipt ordering, and evidence-driven step projection.
- Ensure every automated Codex test uses injected or controlled command behavior and isolated disposable homes/projects and never reads credentials from or mutates the real `~/.codex`.

Material behavior changes:

- **From:** a nonzero Codex command is reduced to an exit code while its stdout and stderr are discarded. **To:** setup retains a bounded, redacted diagnostic while independent list verification still decides final state. **Reason:** the reproduced orphan collision is actionable only in the command evidence. **Impact:** command normalization, diagnostics, receipt checkpoints, and focused tests must carry safe failure context.
- **From:** remaining planned Codex rows are promoted to `confirmed` after external execution, including checkpoint, reread, and final-verification rows not supported by the failed receipt. **To:** every row reflects a real attempt, durable checkpoint, reread, or exact verification result. **Reason:** rendered setup output must not contradict the receipt or manager state. **Impact:** result projection and receipt-to-result mapping become evidence-driven.
- **From:** orphaned temporary marketplace state is reported as a generic mutation failure. **To:** it is recognized as a distinct stale manager-residue condition and routed through a fail-closed reconciliation policy. **Reason:** clean installation is known to work, so repeating the same opaque command does not address the actual blocker. **Impact:** diagnostics and safe recovery guidance become precise without claiming the temporary checkout is a registered marketplace.
- **From:** failure detail can be lost or treated as the mutation's final truth. **To:** failure detail remains diagnostic while exact independent list verification is authoritative, including after nonzero exit. **Reason:** Codex may complete state changes despite an ambiguous or nonzero command result. **Impact:** existing nonzero-then-verified and mixed-operation semantics are preserved rather than weakened by better diagnostics.

### Deferred / Needs Discovery

- A real Codex mutation smoke beyond the already captured disposable-home evidence remains separately authorized work. It is not part of automated verification and MUST target only a disposable controlled `CODEX_HOME` if later approved.
- User-facing documentation updates beyond the setup diagnostic and manual action text are deferred until the specification selects the safe orphan-reconciliation policy and stable wording.
- Determine whether Codex 0.144.x exposes a supported, selected-scope manager command that can safely reconcile an orphaned marketplace checkout. If no independently verifiable manager operation exists, the specification must require zero automatic cleanup and a precise `requires_user_action` result.
- Define the minimum evidence needed to classify temporary residue as the reproduced orphan condition without assuming ownership from a name or path. The policy must account for scope, path containment, links, concurrent Codex activity, and divergent source provenance.
- Select the exact diagnostic redaction and truncation rules within existing output and receipt bounds. The result must remain useful enough to identify the failed capability and recovery action without persisting raw command output.
- Determine whether existing diagnostic/checkpoint fields can represent the safe evidence without a receipt schema change. A schema change is justified only if the later spec proves existing compatible fields are insufficient.

### Out of Scope

- Modifying the Codex CLI, its marketplace implementation, or its cache layout.
- Changing the accepted v0.3.7 plugin bundle, flat `.mcp.json`, hooks, plugin manifests, marketplace descriptor, inventory, or package version without independent specification evidence that they are defective.
- Falling back to `legacy_filesystem` after a modern manager operation fails, or adding legacy copied assets/config as recovery.
- Unproven direct deletion, rewriting, or repair of Codex-owned marketplace cache, temporary checkout, config, plugin state, or unrelated manager content.
- Redesigning public rollback behavior or expanding receipt-created removal authority.
- Changing OpenCode, Claude Code, unrelated harness behavior, the six-tool MCP surface, storage, retrieval, sync, or lifecycle semantics.
- Amending `openspec/memory/constitution.md`.

## Approach

1. Extend the safe Codex command result so a nonzero execution retains only the bounded evidence needed for classification and diagnostics. Apply redaction and deterministic truncation before the evidence is exposed or persisted.
2. Keep exact selected-scope manager list verification independent from mutation execution. Evaluate the list after each attempted operation, and let verified state override an ambiguous or nonzero attempt only when the existing exact schema and identity checks pass.
3. Classify the orphan collision from the combination of safe command evidence and exact absence from the marketplace list. Route it through the specification-selected safe reconciliation outcome; never infer registered state or delete Codex-owned residue from the path alone.
4. Replace name-based or blanket planned-step promotion with projection from actual external operation results, receipt checkpoints, rereads, and final verification. Preserve the existing ordered step vocabulary and deterministic status/exit-code mapping.
5. Persist bounded diagnostics in the existing ordered checkpoint ledger where compatible, while preserving attempt-before-reread-before-final ordering and receipt validation. Additive schema work is conditional on later proof of necessity.
6. Prove the full flow with controlled command executors and isolated filesystem fixtures, including a clean 0.144.0 installation model and the exact orphaned-checkout reproduction. No automated test may resolve or mutate the developer's real Codex home.

## Affected Areas

- `src/setup/codex-cli.ts`: safe command-result normalization, bounded/redacted nonzero diagnostics, orphan-collision classification, independent verification, and nonzero-then-verified behavior.
- `src/setup/engine.ts`: evidence-driven planned-step projection, final verification/status derivation, receipt checkpoint mapping, and safe reconciliation routing without legacy fallback.
- `src/setup/receipt.ts` and `src/setup/types.ts`: existing diagnostic bounds and checkpoint evidence compatibility; additive shape changes only if the spec demonstrates necessity.
- `tests/setup/codex-cli.test.ts`: nonzero output preservation/redaction, exact verification precedence, orphan collision, and mixed operation outcomes.
- `tests/setup/engine.test.ts`: truthful checkpoint/reread/final step outcomes, status mapping, ordering, and no fallback.
- `tests/packaging/packed-install.test.ts`: isolated packed-flow regression coverage without real-home mutation; no plugin asset/schema change is implied.
- `openspec/specs/cli/spec.md` and `openspec/specs/harness-integration/spec.md`: expected delta domains for truthful setup reporting, safe degradation, and authoritative verification. `openspec/specs/packaging/spec.md` is affected only if additional isolated packed-flow acceptance wording is necessary.

## Risks

- Command output may contain secrets or unrelated state. Mitigation: redact and cap before diagnostics or receipt persistence, and never store raw config or unbounded stdout/stderr.
- Error text could be mistaken for state proof. Mitigation: use it only for classification and guidance; exact independent list verification remains authoritative.
- Automatic orphan cleanup could remove concurrent or unrelated Codex state. Mitigation: require an independently specified supported reconciliation operation and sufficient ownership/scope evidence; otherwise stop with zero cleanup and `requires_user_action`.
- Better diagnostics could accidentally invalidate nonzero-then-verified success. Mitigation: keep attempt evidence separate from final manager evidence and test that exact verification can still confirm the operation.
- Result rows could drift from the signed receipt. Mitigation: derive auxiliary outcomes from persisted checkpoints and actual rereads, and test the ordering and final projection together.
- One failed operation could mask another supported result. Mitigation: preserve independent operation execution, verification, checkpointing, and `partial` status derivation.
- Version-specific Codex wording may change. Mitigation: fail closed on unknown text, retain generic bounded evidence, and never weaken exact structured state verification.
- Tests could touch a developer's real Codex state. Mitigation: inject executors, isolate all homes/projects, scrub credential-bearing environment variables, and assert real-home paths are untouched.

## Rollback Plan

- Revert the diagnostic propagation and evidence-driven result projection together if they regress setup reporting; retain the existing exact list verifier and ownership strategy boundaries.
- If orphan classification proves unreliable, fall back to a generic bounded manager failure with precise manual inspection guidance rather than deleting temporary or manager-owned state.
- If diagnostic receipt persistence is incompatible with existing readers, keep the evidence user-visible only within the existing bounded result path until an additive compatible receipt representation is specified.
- No rollback redesign is introduced. Existing receipt-owned rollback behavior and the prohibition on direct manager cache/config deletion remain unchanged.
- Because automated verification uses only controlled disposable state, reverting this change requires no cleanup of a real personal Codex home.

## Success Criteria

- A clean isolated Codex 0.144.0 flow can register `EremesNG/thoth-mem`, install and enable `thoth-mem@thoth-mem` version 0.3.7, verify both through exact independent lists, and report only evidence-backed confirmed steps.
- An isolated fixture containing only `.codex/.tmp/marketplaces/thoth-mem` reproduces exit code 1 and the `already added from a different source` diagnostic while the exact marketplace list remains absent. Setup classifies this as stale manager residue, never as successful registration, and follows the spec-selected safe reconciliation or zero-cleanup `requires_user_action` path.
- A nonzero mutation followed by exact verified state remains confirmed; the safe command diagnostic does not force a false failure.
- When one manager operation has an ordinary safely attempted failure or unverified result, the other independently safe and supported operation is still attempted and checkpointed. If exactly one operation verifies and no corroborated orphan or ownership ambiguity blocks safe recovery, setup reports `partial`, preserves both independent outcomes, and does not install a legacy fallback. If such ambiguity requires manual recovery, setup reports `requires_user_action` even when the independent other operation verifies.
- A failed or unverified flow does not render planned checkpoint, reread, or final-verification rows as confirmed. Human-readable output, JSON output, the signed receipt, and exact manager state agree.
- Receipt evidence remains ordered attempt -> checkpoint -> independent reread -> final checkpoint, and every persisted diagnostic is bounded and redacted.
- Controlled tests cover clean installation, orphan collision, nonzero-then-verified success, mixed outcomes, checkpoint failure, truthful result projection, scope confinement, and privacy/output bounds without reading or mutating the real `~/.codex`.
- Focused setup and packed-flow tests, `pnpm run build`, and `pnpm test` pass before implementation is accepted.
- No implementation change to the current plugin bundle, flat `.mcp.json`, hooks, marketplace descriptor, legacy fallback, rollback design, unrelated harnesses, or constitution is required by this proposal.
