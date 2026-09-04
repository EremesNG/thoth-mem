# Verification Report: Native Pi Integration

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: Candidate implementation covers every functional requirement FR-001 through FR-013 and every buildable success criterion SC-001 through SC-009 across managed setup, native tools, lifecycle, recovery, migration, packaging, smoke verification, and documentation.
- **Correctness**: Root verification exercised the supported Pi 0.84.4 contract, exact six-tool catalog, bounded child protocol, lifecycle failure isolation, revision-9-to-10 migration invariants, and both explicit-local and hermetic-public package sources.
- **Coherence**: Specification, plan, tasks, package metadata, inventory, CLI help, native extension, canonical Skill synchronization, verification scripts, and documentation consistently identify OpenCode, Codex, Claude Code, and Pi as the four supported hosts.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/cli.ts`, `src/setup/pi.ts` | CLI/setup focal suites and full suite | PASS |
| FR-002 | `src/setup/pi.ts` receipt ownership, exact package inspection, rollback, and repair | `tests/setup/pi.test.ts`, packed smoke | PASS |
| FR-003 | Pi executable/version/capability/provenance preflight and independent post-install verification in `src/setup/pi.ts` | Setup fault, plan, retry, local/public, rollback, and no-op cases | PASS |
| FR-004 | `src/integration/pi/index.ts`, canonical Pi Skill assets, native registration path | Native plugin and packaging suites | PASS |
| FR-005 | `src/tools/index.ts`, `src/integration/pi/mcp-client.ts`, `src/integration/pi/index.ts` | Exact catalog comparison, six native calls, shared-child, reconnect, caps, and teardown cases | PASS |
| FR-006 | `src/integration/pi/lifecycle.ts`, Pi hook orchestration in `src/integration/pi/index.ts` | Host-shaped lifecycle sequence and full regression suite | PASS |
| FR-007 | Pi root identity normalization plus shared project identity resolver | Git/worktree/non-Git, ambiguous/delegated/mismatched identity cases | PASS |
| FR-008 | Privacy-first deterministic capture keys and stable lifecycle receipt keys | Distinct same-turn input, exact retry, changed-leaf, reload, and finalize cases | PASS |
| FR-009 | `src/integration/recovery.ts` and Pi-owned context replacement/cache | Recovery mismatch, taxonomy, leakage, duplicate delimiter, cap, compaction-refresh, and safe-block cases | PASS |
| FR-010 | Bounded lifecycle and MCP error boundaries; Pi entry excludes SQLite service graph | Launch, timeout, exit, protocol, oversize, callback, identity, reconnect, and concurrent cold-start cases | PASS |
| FR-011 | `package.json`, `pnpm-lock.yaml`, build entry, synchronization, exact four-host inventory | Build, package, inventory, local verifier, and frozen dependency metadata checks | PASS |
| FR-012 | `scripts/verify-packed-plugins.mjs` local and loopback-public fixture | Four-host packed smoke, exact `pi list`, installed graph, assets, hashes, and real-home digest | PASS |
| FR-013 | Revision 10 schema and locked backup/source comparison in `src/memory-core/sqlite/migrations.ts` | Migration, taxonomy, foreign-key, interruption, drift, mismatch, reopen, and Pi-session tests | PASS |
| SC-001 `[buildable]` | Managed `setup pi` CLI and setup manager | Help/parse/public/local/plan/repair/rollback/repeat suites | PASS |
| SC-002 `[buildable]` | Supported command execution and exact owned-source rollback | Windows Pi 0.84.4 smoke plus fake Windows/Linux manager fixtures | PASS |
| SC-003 `[buildable]` | Native Pi extension built as `dist/pi.js` from authoritative tool catalog | Exactly six registered tools and all valid native calls reach shared MCP handlers | PASS |
| SC-004 `[buildable]` | Pi manifest resources, synchronized Skill, references, and exact inventory | Package and local integration-verifier suites | PASS |
| SC-005 `[buildable]` | Native lifecycle mapper and orchestration | Start, recovery, multiple inputs, retry, context, compaction, settled, reload, shutdown, identity, and privacy cases | PASS |
| SC-006 `[buildable]` | Bounded MCP/lifecycle degradation and shared bootstrap contract | Injected faults plus simultaneous first tool/lifecycle calls and subsequent healthy access | PASS |
| SC-007 `[buildable]` | Installed Pi 0.84.4, disposable roots, candidate tarball, and complete frozen closure served by loopback registry | Local/public packed smoke; exact source/version/assets/dependency ledger; no non-loopback requests; unchanged real Pi home | PASS |
| SC-008 `[buildable]` | Complete verification matrix below | Every required command completed with exit code 0 | PASS |
| SC-009 `[buildable]` | Revision-9 fixture and revision-10 migration protocol | Exact logical baseline, retained backup equality, mismatch/drift rejection, transactional interruption, idempotent reopen, and new Pi session | PASS |

## Commands and results

- `pnpm run build` — PASS; TypeScript no-emit validation and all distribution entries built, including `dist/pi.js`.
- Focused first-product verification excluding the two long packed wrappers — PASS, 13 files, 94 tests; 2 deliberately filtered/skipped packed wrappers.
- `pnpm exec vitest run tests/release-version.test.ts tests/integration/package.test.ts --config vitest.config.ts` — PASS, 2 files and 6 tests after converging stale three-host fixtures to the four-host contract.
- `pnpm test` — PASS, 58 files and 469 tests in 331.29 seconds.
- `pnpm run integration:verify` — PASS; verified local and public OpenCode, Codex, Claude Code, and Pi inventories.
- `pnpm run integration:smoke` — PASS; activated all four native lifecycle fixtures, verified installed Pi 0.84.4 from an explicit local candidate, verified the hermetic public candidate and complete runtime closure, matched exact `pi list` and installed graph, and validated SHA-256, SHA-512 integrity, and SHA-1 shasum ledger fields.
- `pnpm run benchmark:fixture` — PASS; the volatile generated report was restored afterward so machine-local runtime, timestamps, latency, and size samples are not part of this change.
- `pnpm run prepublishOnly` — PASS; integration verification, build, and repeated full suite completed with 58 files and 469 tests in 329.09 seconds.
- `node .../thoth-sdd/scripts/validate.mjs --change openspec/changes/add-native-pi-integration --route accelerated --through ready --json` — PASS with `valid: true`, zero errors, and zero warnings.
- `git diff --check` — PASS; only informational LF-to-CRLF notices from the Windows checkout.
- Process inspection after the matrix — PASS; no Pi, Vitest, or loopback-registry process remained. Only the expected long-lived thoth-mem MCP and CodeGraph processes were present.

## Migration and package invariants

- Revision 10 changes only the current `sessions.harness` allowlist while every frozen pre-v10 schema retains its exact historical constraint.
- Migration holds a write-excluding lock, rechecks the exact live revision-9 source against the retained backup before mutation, rejects logically different valid backups and source drift, rebuilds transactionally, verifies foreign keys/integrity, preserves authoritative rows and FTS results, and reopens idempotently.
- The Pi extension derives exactly six tools from the authoritative catalog, delegates through one package-relative literal-Node MCP child, contains no duplicate SQLite/MemoryService implementation, and closes only its owned child.
- The public Pi smoke resolves only `npm:thoth-mem@0.5.1` and its complete frozen runtime closure through the disposable loopback registry. The installed manifest, entry, Skill, dependency graph, and integrity ledger match that fixture.
- The real Pi home digest is unchanged. All installation, npm, agent, session, data, and registry state used by verification was disposable.

## Oracle round-1 findings (remediated)

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| B1 | CRITICAL | FR-002, SC-001 | Round 1: `src/setup/pi.ts` rejected a matching but corrupted managed installation before entering its journaled remove/install repair path. | REMEDIATED: receipt-owned corruption now uses journaled repair with exact tree rollback and repeated no-op tests. |
| B2 | CRITICAL | FR-003, SC-001 | Round 1: installed-state verification accepted the extension path and an empty Skill directory without proving required files or extension loadability. | REMEDIATED: complete regular resources and a bounded isolated import probe are mandatory. |
| B3 | MAJOR | FR-004 | Round 1: the canonical Skill host-routing list omitted its packaged `references/pi.md`, leaving every synchronized copy stale for Pi. | REMEDIATED: canonical Pi routing, synchronized copies, identical hashes, and semantic coverage. |

## Residual risks

- Native compatibility is certified against Pi `0.84.4`; a future Pi event, extension, or package-manager contract change requires explicit re-certification.
- Packed verification loads the native extension, exercises all six tools and representative lifecycle events offline, but intentionally does not spend model tokens or contact a model provider.
- The hermetic public smoke validates the frozen dependency closure represented by the current lockfile; dependency updates must regenerate and revalidate that closure.

## Oracle handoff

Round 1 returned **FAIL**. Archive remains blocked until convergence and a different fresh read-only Oracle return an exact PASS with no blocking correctness gap.

## Oracle round 1 result

**Reviewer**: fresh Oracle (`oracle_pi_final_verify`)<br>
**Independent from implementer**: Yes<br>
**Verdict**: FAIL

### Conclusion

Core tooling, lifecycle, migration, packaging, and hermetic smoke evidence are strong, but the candidate is not ready to archive because three blocking contract gaps remain.

### Independent verification

- Inspected the current diff, SDD artifacts, setup, Pi extension, MCP bridge, recovery validator, migration, tool catalog, package metadata, inventory, and hermetic smoke implementation.
- Focused matrix — PASS, 13 files and 84 tests.
- SDD ready validator — PASS with zero errors and warnings.
- `git diff --check` — PASS apart from informational Windows line-ending notices.
- Confirmed the exact six-tool catalog, exact four-host inventory, retained-backup equality, migration lock, transactional rebuild, integrity, and foreign-key checks.

### Compliance judgment

- FR-001 and FR-005 through FR-013 — PASS.
- FR-002, FR-003, and FR-004 — FAIL for B1, B2, and B3 respectively.
- SC-002 through SC-009 — PASS.
- SC-001 — FAIL for B1 and B2.

### Required convergence

- **B1**: Implement receipt-owned corrupted-install repair through the existing journal/rollback transaction and test successful repair, failed repair rollback, and repeated no-op.
- **B2**: Strengthen post-install verification to require the complete Pi resource files and independently prove the installed extension is loadable.
- **B3**: Add `references/pi.md` to the canonical Skill host identity routing, synchronize every generated copy, and add a semantic test beyond byte equality.

### Residual warnings

- Certification remains limited to Pi 0.84.4.
- Hermetic smoke intentionally avoids model-provider consumption.
- Loopback dependency proof remains coupled to the current frozen lock graph.

### Next action

Converge B1–B3, rerun affected setup/packaging checks plus the required verification, and dispatch a fresh Oracle final-verification round. Do not archive this revision.

## Round-1 convergence evidence

- **B1 remediated**: receipt-owned matching corruption now enters the journaled remove/install/verify path. A prior package-tree snapshot is restored exactly if repair fails; unrelated package records and files remain unchanged; a healthy subsequent run performs zero mutations with `changed=false`.
- **B2 remediated**: installed verification now requires regular `dist/pi.js`, `SKILL.md`, `references/pi.md`, and `references/observation-review.md` files, regular Skill directories, and a bounded isolated subprocess import probe before completion. Missing, directory-substituted, or unloadable resources cannot claim success.
- **B3 remediated**: the canonical Skill explicitly selects `references/pi.md` for Pi identity/lifecycle operations; canonical synchronization updated OpenCode, Codex, Claude Code, and Pi copies, whose SHA-256 hashes are identical; semantic routing coverage is no longer limited to byte equality.
- TDD red evidence: the setup convergence slice initially failed 10 of 18 cases; the Pi Skill semantic assertion failed before the canonical edit.
- Root focused green evidence: `pnpm run build`, 3 files and 34 tests (one long wrapper filtered), `pnpm run integration:verify`, and `git diff --check` all PASS.
- Root real-host green evidence: `pnpm run integration:smoke` PASS after convergence, including installed Pi 0.84.4 local and hermetic-public entry load, unchanged real Pi home, exact installed graph, and integrity ledger.
- Simplification review retained explicit journal, backup, rollback, provenance, and load-probe boundaries; no further behavior-preserving reduction was safe or useful.

## Round-2 root verification

- `pnpm test` — PASS after B1–B3 convergence, 58 files and 481 tests in 333.59 seconds.
- `pnpm run prepublishOnly` — PASS after convergence; integration inventory, TypeScript/build, and the repeated full suite completed with 58 files and 481 tests in 332.82 seconds.
- `pnpm run integration:smoke` — PASS after convergence with installed Pi 0.84.4, both local and hermetic-public entry load, exact graph/ledger checks, and unchanged real Pi home.
- `node .../thoth-sdd/scripts/validate.mjs --change openspec/changes/add-native-pi-integration --route accelerated --through ready --json` — PASS after convergence with zero errors and warnings.
- `git diff --check` — PASS after convergence; only informational Windows line-ending notices.
- Volatile `benchmarks/results/fixture-report.json` output regenerated by the suite was restored and is absent from the candidate diff.
- Post-run process inspection found no Pi, Vitest, loopback registry, or packed-smoke residue.

The fresh Oracle round 2 must independently confirm that B1–B3 are closed and return the terminal PASS/FAIL judgment.

## Oracle round 2 result

**Reviewer**: fresh Oracle (`oracle_pi_final_verify_round2`)<br>
**Independent from implementer**: Yes<br>
**Verdict**: FAIL

### Conclusion

B2 and B3 are closed, but B1 remains open in a crash/partial-command window. The candidate cannot be archived.

### Blocking evidence

- External `remove` mutation precedes durable `removedPrior=true`; external `install` likewise precedes durable `installedDesired=true`. Recovery depends on those flags, so a manager that mutates and then returns nonzero—or process death in that window—can leave the package absent or changed while rollback concludes from stale journal state.
- The existing injected repair failures occur only after the post-command flag write, so they do not reproduce mutate-then-nonzero/throw or hard interruption between external mutation and durable phase state.
- A disposable adversarial reproduction mutated the package, returned nonzero before the flag write, and left no installed tree, package record, retained journal, or backup after rollback.
- The reviewed `tasks.md` hash in `plan-review.md` is stale after adding T058–T064; its recovery decision explicitly invalidates the prior [OKAY].

### Closed findings

- **B2 PASS**: complete installed resource validation and bounded import probing apply to healthy/adopted and post-install states.
- **B3 PASS**: canonical Pi routing, all five identical Skill hashes, distribution-lock hash, and the semantic regression assertion agree.

### Independent verification

- Focused setup/bridge/lifecycle/recovery/catalog/migration matrix — PASS, 7 files and 66 tests.
- Targeted packaging/inventory/Skill assertions — PASS, 5 tests.
- SDD ready validator — PASS, zero errors/warnings.
- `git diff --check` — PASS apart from informational Windows line-ending notices.
- Exact four-host/six-tool, migration safety, hermetic closure/ledger, and real-home digest assertions were independently corroborated.

### Compliance judgment

- FR-001 and FR-004 through FR-013 — PASS.
- FR-002 and FR-003 — FAIL because repair journaling is not crash-consistent.
- SC-002 through SC-009 — PASS.
- SC-001 and artifact coherence — FAIL.

### Required convergence

Persist mutation intent before each external remove/install, reconcile actual package-manager state during recovery, and retain backup/journal until either exact prior-tree restoration or verified desired-state commit. Add mutate-then-nonzero/throw and hard-interruption repair tests for both commands, including exact tree and unrelated-state equality. Refresh the invalidated plan review, then dispatch a different fresh final Oracle.

## Round-2 crash-consistency convergence evidence

- The refreshed independent plan review returned [OKAY] against the complete serialized T064 -> T065 -> T066 -> T067 -> T068 -> T056 -> T057 dependency chain before implementation resumed.
- `src/setup/pi.ts` now persists `remove-intent` and `install-intent` before invoking either external mutation, then reconciles the actual package-manager inventory during rollback and recovery rather than trusting a post-command flag.
- The prior installed tree, provider bytes, receipt bytes, and complete package-manager record set remain journaled until exact restoration is independently verified or the desired installed state, resources, unrelated records, and committed receipt are independently verified.
- Terminal `rollback-verified` and `receipt-committed` phases make cleanup retryable after an interruption between backup deletion and journal deletion. A public receipt owns only the exact source and installed path; local ownership remains exact-path-bound.
- TDD covers remove and install commands that mutate and then return nonzero, mutate and then throw, and hard interruption immediately after each mutation. Additional cases cover both terminal-cleanup boundaries and a public source whose receipt points to a different installed path.
- Root focused verification — PASS: `pnpm run build`; `pnpm exec vitest run tests/setup/pi.test.ts tests/setup/plugins.test.ts --config vitest.config.ts` with 2 files and 33 tests; `pnpm run integration:verify`; SDD ready validator; and `git diff --check`.
- Root real-host smoke — PASS: `pnpm run integration:smoke` activated all four native lifecycle fixtures, verified installed Pi 0.84.4 for local and hermetic-public candidates, exact public inventory/runtime graph and integrity ledger, and an unchanged real Pi home.
- Root full verification — PASS: `pnpm test` completed 58 files and 491 tests in 301.11 seconds; `pnpm run prepublishOnly` repeated inventory, build, and 58 files/491 tests in 301.82 seconds.
- Simplification retained the explicit state machine and verification boundaries because collapsing them would obscure or weaken crash recovery. The volatile benchmark report was restored after verification, `git diff --check` passed with only informational Windows line-ending notices, and no Pi, Vitest, or loopback-registry process remained.

Archive remains blocked pending the fresh round-3 Oracle judgment.

## Oracle round 3 result

**Reviewer**: fresh Oracle (`oracle_pi_final_verify_round3`)<br>
**Independent from implementer**: Yes<br>
**Verdict**: FAIL

### Conclusion

The prior B1/B2/B3 findings and remove/install crash window are closed, but terminal committed-state recovery remains unsafe when unrelated package-manager state changes after a cleanup interruption.

### Compliance judgment

- FR-001 and FR-004 through FR-013 — PASS.
- FR-002 and FR-003 — FAIL on terminal commit recovery safety.
- SC-002 through SC-009 — PASS.
- SC-001 and exact plan-review coherence — FAIL.

### Blocking evidence

- `verifyDesiredCommit` makes unchanged unrelated inventory part of terminal commit revalidation. Any failure in the `receipt-committed` recovery branch enters rollback, so a fresh install can remove the valid desired package and receipt merely because an unrelated package appeared after commit.
- An independent disposable reproduction completed a fresh public install through `receipt-committed`, interrupted before journal deletion, added one unrelated package record, and retried. Recovery failed exact manager-state rollback verification after deleting the valid thoth-mem tree and committed receipt; the unrelated record and journal remained.
- Existing commit-cleanup coverage holds unrelated state constant and does not cover post-commit drift or cleanup deletion failure.
- The prior plan-review tasks hash no longer matches the current task artifact, so its exact-hash recovery decision does not authorize the current candidate.

### Independent verification

- Inspected current setup state machine, Pi extension/client/lifecycle/recovery, six-tool catalog, revision-10 migration, package/inventory/build configuration, synchronized Skills, SDD artifacts, and historical findings.
- Focused suite — PASS, 8 files and 88 tests.
- CLI/taxonomy slice — PASS, 3 files and 12 tests.
- SDD ready validator — PASS with zero errors and warnings.
- `git diff --check` — PASS apart from informational Windows line-ending notices.

### Required convergence

Treat `receipt-committed` as terminal: separately validate the owned desired package and receipt, tolerate unrelated post-commit drift, and never enter rollback because cleanup or unrelated reconciliation fails. Retain the journal and fail without mutation when safe completion cannot be proven. Add fresh-install commit-cleanup tests with post-commit unrelated mutation and cleanup deletion failure, refresh the exact plan review, then dispatch another fresh Oracle. Do not archive this revision.

## Round-3 terminal-commit convergence evidence

- `receipt-committed` recovery now validates exactly one owned desired thoth-mem record, its complete regular resources, bounded extension loadability, and an exact receipt while ignoring ordinary unrelated package drift.
- The terminal recovery branch has no rollback path. Owned-state validation or journal cleanup failure retains the terminal journal and leaves package-manager, provider, receipt, and unrelated state unchanged for a later retry.
- Exact receipt comparison rejects missing, mismatched, and extra semantic fields. Ambiguous additional thoth-mem state fails closed without discarding recovery evidence.
- TDD red evidence reproduced valid-package deletion after post-commit unrelated drift, journal loss on ambiguous thoth-mem state, and acceptance of an extra receipt field. The deterministic injectable cleanup-removal seam reproduced deletion failure without filesystem-permission assumptions.
- Root focused verification — PASS: `pnpm run build`; setup/plugins 2 files and 42 tests; `pnpm run integration:verify`; SDD ready validator with zero errors/warnings; and `git diff --check`.
- Root real-host smoke — PASS: all four lifecycle fixtures; Pi 0.84.4 local and hermetic-public candidates; exact public list/runtime graph and integrity ledger; unchanged real Pi home.
- Root full verification — PASS: `pnpm test` completed 58 files and 500 tests in 300.28 seconds; `pnpm run prepublishOnly` repeated inventory, build, and 58 files/500 tests in 302.76 seconds.
- Simplification retained the explicit terminal branch and rollback guard because merging terminal and pre-terminal recovery would recreate the defect. The volatile benchmark report was restored, and no Pi, Vitest, or loopback-registry process remained.

The task artifact is now frozen with T069-T071 complete and T056/T057 pending. A fresh exact-hash plan review is required before the next final Oracle.

## Oracle round 4 result

**Reviewer**: fresh Oracle (`oracle_pi_final_verify_round4`)<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

### Conclusion

No blocking correctness, safety, contract, packaging, migration, or artifact-coherence gap remains.

### Compliance judgment

- FR-001 through FR-013 — PASS.
- SC-001 through SC-009 — PASS.
- Exact six-tool catalog, one lazy reconnectable MCP child, no duplicate SQLite service, lifecycle/privacy boundaries, revision-9-to-10 migration, four-host packaging, and hermetic Pi verification satisfy their contracts.
- Frozen spec, research, data-model, plan, tasks, and constitution hashes exactly matched the final plan review presented to Oracle.

### Historical finding closure

- B1 closed: corrupted receipt-owned installs enter journaled repair with exact tested rollback.
- B2 closed: complete regular resources and bounded independent extension-load probing are required.
- B3 closed: all five Skill copies are byte-identical and explicitly route Pi to `references/pi.md`.
- Round 2 closed: remove/install intent precedes mutation; recovery reconciles actual state and retains evidence until verified rollback or commit.
- Round 3 closed: terminal committed recovery validates one owned package, resources/loadability, and exact receipt; unrelated drift is preserved; validation/deletion failures retain the journal without rollback.

### Independent verification

- Critical setup/recovery/lifecycle/MCP/migration slice — PASS, 6 files and 71 tests.
- Packaging/catalog/setup slice — PASS, 4 files and 36 tests.
- Taxonomy/migration/release slice — PASS, 3 files and 8 tests.
- `pnpm run integration:verify` — PASS.
- Accelerated SDD ready validator — PASS with zero errors/warnings.
- `git diff --check` — PASS apart from informational Windows line-ending notices.
- No Pi journal, backup, registry, Vitest, or package-process residue remained.

### Residual non-blocking risks

- Pi compatibility is certified to 0.84.x and exercised against 0.84.4.
- Packed verification intentionally avoids paid model-provider calls.
- Dependency changes require regenerating and revalidating the hermetic closure ledger.

### Next action

Complete T057 as one transactional durable-spec synchronization and dated archive.
