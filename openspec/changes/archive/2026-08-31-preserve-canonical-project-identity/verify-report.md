# Verification Report: Preserve stable local project identity

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: PASS — Oracle round 5 traced every FR and buildable SC to current implementation and executed evidence.
- **Correctness**: PASS — exact identity, migration, lifecycle, CLI, public-runner, packaging, and failure-boundary behavior passed independent adversarial verification.
- **Coherence**: PASS — spec, plan, tasks, implementation, docs, distributed assets, and final verification agree; no unresolved critical issue remains.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | Atomic marker publication, concurrency, worktree/move/clone, malformed/symlink, publication and public Git-failure handling | 69 focused integration tests plus Oracle adversarial probes | PASS |
| FR-002 | Alias-first exact resolution, deterministic adoption, collision rollback, non-merge, trailing-space save/lifecycle reuse | 49 focused unit tests plus Oracle exact-alias probes | PASS |
| FR-003 | Revision-7 verified backup, transactional migration, row/FTS preservation, rollback, idempotent reopen | Focused migration tests plus full suite | PASS |
| FR-004 | Shared resolver and verified root/delegation handling across Codex, Claude Code, and OpenCode | Focused integration plus Oracle public Git/root probes | PASS |
| FR-005 | Exact key/root binding, persisted-name consistency, unsafe identity rejection, recovery source attribution and cap | Focused unit/integration plus Oracle poisoning probes | PASS |
| FR-006 | Canonical and distributed Skills preserve verbatim key and hint semantics | integration:verify and distribution-lock checks | PASS |
| FR-007 | Exactly six closed MCP tools and deterministic 256-alias inspection with unbounded exact resolution | Focused MCP/unit tests plus Oracle 260-alias probe | PASS |
| FR-008 | All three native integrations propagate and validate the same canonical identity | Focused integration, packaging, and packed smoke | PASS |
| FR-009 | Strict project rename routing, exact selectors, and malformed-command rejection | CLI focused tests plus Oracle zero-side-effect probes | PASS |
| FR-010 | Rename changes display metadata only while setup/runtime/import surfaces remain current | CLI, migration, recall, integration inventory, and full suite | PASS |
| SC-001 `[buildable]` | Concurrent marker, worktree, move, clone, temporary-file and failure fixtures | Focused integration and Oracle probes | PASS |
| SC-002 `[buildable]` | Cross-host root/key/name recovery, mismatch, poisoning, public Git failure, and bound coverage | 69 focused integration tests plus Oracle probes | PASS |
| SC-003 `[buildable]` | Backup, rollback, non-merge, deterministic adoption, FTS preservation, and bounded aliases | 49 focused unit tests plus Oracle probes | PASS |
| SC-004 `[buildable]` | Exact selector, display-only rename, idempotency, and target-nonmutating absent/revision-6/current-WAL preflight | CLI focused tests plus Oracle byte/inventory probes | PASS |

## Commands and results

- Focused unit identity/migration/continuation/MCP/CLI: 5 files, 49 tests PASS.
- Focused integration identity/adapters/lifecycle/packaging: 7 files, 69 tests PASS.
- `pnpm run build`: PASS.
- `pnpm test`: 50 files, 335 tests PASS.
- `pnpm run integration:verify`: PASS.
- `pnpm run integration:smoke`: PASS for OpenCode, Codex, and Claude Code.
- `pnpm run benchmark:fixture`: PASS; volatile generated output removed from the candidate diff.
- `pnpm run prepublishOnly`: PASS; 50 files, 335 tests.
- `git diff --check`: PASS.
- Accelerated `ready` validator: PASS.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| O5-PASS | None | Completeness/correctness/coherence | Fresh Oracle round 5 passed every FR/SC and independently closed all prior findings | No remediation required |

## Residual risks

- None. Historical plan-review hashes predate convergence refinements, but the fresh final Oracle verified the current artifact and implementation state.

## Archive decision

Archive is permitted after canonical specification synchronization and closeout validation.

## Round-3 candidate remediation evidence (Oracle pending)

- O2-F001 candidate fix preserves selector bytes and adds a CLI rename fixture using the persisted alias `path:C:/repository `; malformed/whitespace-only/oversized/control-character selectors still fail before storage initialization.
- O2-F002 candidate fix performs an existence check plus read-only selector preflight before writable `MemoryService` initialization. Tests prove an absent database is not created, an unknown selector leaves a revision-6 database at revision 6 without `project_aliases`, and a known revision-6 selector authorizes migration to revision 7 plus the display-only rename.
- O2-W001 candidate fix caps `mem_project action=list` at 256 deterministic aliases per project and reports exact `aliasCount`/`aliasesTruncated` metadata; alias 260 remains usable for exact recall.
- Focused unit after remediation: 5 files, 45 tests PASS.
- Focused integration after remediation: 7 files, 64 tests PASS.
- `pnpm run build`: PASS.
- `pnpm test`: 50 files, 326 tests PASS.
- `pnpm run integration:verify`: PASS.
- `pnpm run integration:smoke`: PASS for OpenCode, Codex, and Claude Code.
- `pnpm run benchmark:fixture`: PASS; volatile generated output removed from the candidate diff.
- `pnpm run prepublishOnly`: PASS; 50 files, 326 tests.
- Accelerated `ready` validator and `git diff --check` are required immediately before Oracle round 3.

The report-level verdict remains the exact round-2 FAIL until a fresh Oracle independently judges this remediated candidate.

## Oracle round-3 result

**Reviewer**: fresh oracle round 3<br>
**Independent from implementer**: Yes<br>
**Verdict**: FAIL

Round 3 independently accepted the canonical 45-unit/64-integration lanes, build, full 326-test suite, integration inventory, packed smoke, offline fixture, prepublish, ready validator, and diff hygiene. It also verified the 256-of-260 alias cap, exact count/truncation metadata, and beyond-cap save/recall/adoption/collision behavior. Archive remains prohibited because three adversarial violations remain:

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| O3-F001 | Critical | Correctness/coherence | `ensureProject` trims `input.key`; saving through `path:C:/repository ` created a second trimmed path project beside the Git project | Preserve key bytes while separately validating non-empty/size/safety; add exact trailing-space save and lifecycle coverage |
| O3-F002 | Critical | Correctness | Tab, ESC, and U+001F selectors pass validation; a persisted tab-bearing alias renamed successfully | Reject the complete prohibited control-character class before configuration/storage access and prove zero side effects |
| O3-F003 | Critical | Correctness/coherence | Read-only preflight of a current WAL database left new `memory.sqlite-wal` and 32,768-byte `memory.sqlite-shm` sidecars | Preflight without opening the target database and assert target byte/file inventory equality |

Round-3 matrix: FR-001 PASS, FR-002 FAIL, FR-003 PASS, FR-004 PASS, FR-005 PASS, FR-006 PASS, FR-007 PASS, FR-008 PASS, FR-009 FAIL, FR-010 FAIL; SC-001 PASS, SC-002 PASS, SC-003 PASS, SC-004 FAIL. Completeness, correctness, and coherence are FAIL. No open questions were reported. The validator overlap warning remains non-blocking.

## Round-4 candidate remediation evidence (Oracle pending)

- The mandatory TDD red phase reproduced four failures: exact trailing-space alias save split identity, unsafe project controls committed, prohibited CLI selector controls returned the wrong status, and current WAL preflight created target sidecars.
- O3-F001 candidate fix preserves `ProjectIdentityInput.key` byte-for-byte while separately enforcing non-empty, 4,096-code-point, and prohibited-control constraints. Exact trailing-space aliases now reuse the canonical project through both save and lifecycle, and invalid key/alias attempts leave zero project rows.
- O3-F002 candidate fix applies the complete `Cc`, `Zl`, and `Zp` prohibited-control class to CLI selectors and persisted project keys/aliases. Tab, ESC, U+001F, CR, LF, and NUL fixtures fail before storage access.
- O3-F003 candidate fix copies the main database and any WAL into an isolated disposable directory before selector queries. Unknown selectors preserve absent, revision-6, closed-current-WAL, and active-current-WAL target file inventories and bytes exactly; a known selector visible through an active WAL still authorizes rename.
- Mandatory simplify review removed an accidental unused test spy and retained the bounded snapshot/validation implementation without behavior changes.
- Focused unit after remediation: 5 files, 49 tests PASS.
- Focused integration after remediation: 7 files, 64 tests PASS.
- `pnpm run build`: PASS.
- `pnpm test`: 50 files, 330 tests PASS.
- `pnpm run integration:verify`: PASS.
- `pnpm run integration:smoke`: PASS for OpenCode, Codex, and Claude Code.
- `pnpm run benchmark:fixture`: PASS; volatile generated output removed from the candidate diff.
- `pnpm run prepublishOnly`: PASS; 50 files, 330 tests.
- Accelerated `ready` validator: PASS with the existing non-blocking overlap-review warning.
- `git diff --check`: PASS; generated benchmark report absent from the candidate diff.

The report-level verdict remains the exact round-3 FAIL until a fresh Oracle independently judges this remediated candidate.

## Oracle round-4 result

**Reviewer**: fresh oracle round 4<br>
**Independent from implementer**: Yes<br>
**Verdict**: FAIL

Round 4 independently closed O3-F001, O3-F002, and O3-F003 and accepted the focused 49-unit/64-integration lanes, full 330-test suite, ready validator, diff hygiene, bounded alias inspection, and exact alias behavior. Archive remains prohibited because two public-runner identity violations remain:

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| O4-F001 | Critical | Correctness/security | The public runner treats every nonzero/error Git invocation as verified non-Git state and accepts a forged `path:` identity when an actual Git repository cannot execute Git | Distinguish verified non-Git state from Git resolution failure, fail closed on unavailable/error state, and add an adversarial public-runner fixture |
| O4-F002 | Critical | Correctness/security | The public runner validates child `root_session_id` only by shape and injects a safe-but-forged child root that differs from the host payload `session_id` | Require exact local-dispatch root equality and cover mismatched roots for both public hosts |

Round-4 matrix: FR-001 FAIL, FR-002 PASS, FR-003 PASS, FR-004 FAIL, FR-005 FAIL, FR-006 PASS, FR-007 PASS, FR-008 FAIL, FR-009 PASS, FR-010 PASS; SC-001 PASS, SC-002 FAIL, SC-003 PASS, SC-004 PASS. Oracle also noted that the historical pre-implementation `plan-review.md` hashes do not represent later convergence refinements and that its full-suite run regenerated the tracked benchmark fixture. Neither warning replaces the two blockers; the generated fixture must be removed before the next candidate.

## Archive decision

Archive is not permitted. Return to convergence, implementation, and a fresh Oracle verification.

## Round-5 candidate remediation evidence (Oracle pending)

- The mandatory TDD red phase reproduced all four O4 attack variants: Codex and Claude accepted a safe-but-mismatched child root, and a real Git repository accepted a forged path identity when Git was absent or returned an error.
- O4-F001 candidate fix now mirrors the canonical resolver's tri-state distinction: verified non-Git permits exact normalized `path:`, successful Git requires the safe canonical marker, and Git invocation/common-directory failure returns no model-visible identity. Adversarial absent/error Git fixtures and an existing verified non-Git control fixture pass.
- O4-F002 candidate fix requires exact equality between the child `root_session_id` and the host payload `session_id` before constructing any identity header. Both public hosts reject safe mismatches while exact root/key/name envelopes remain accepted.
- Mandatory simplify review retained one bounded Git-state helper and removed no required validation. `pnpm run integration:sync` updated the public distribution hash after the runner edit.
- Focused public-runner integration: 1 file, 14 tests PASS.
- Focused integration: 7 files, 69 tests PASS.
- `pnpm run build`: PASS.
- `pnpm test`: 50 files, 335 tests PASS.
- `pnpm run integration:verify`: PASS.
- `pnpm run integration:smoke`: PASS for OpenCode, Codex, and Claude Code.
- `pnpm run benchmark:fixture`: PASS; volatile generated output removed from the candidate diff.
- `pnpm run prepublishOnly`: PASS; 50 files, 335 tests.
- Accelerated `ready` validator: PASS with the existing non-blocking overlap-review warning.
- `git diff --check`: PASS; generated benchmark report absent from the candidate diff.

The report-level verdict remains the exact round-4 FAIL until a fresh Oracle independently judges this remediated candidate.

## Oracle round-5 result

**Reviewer**: fresh oracle round 5<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

Oracle independently traced and passed FR-001 through FR-010 and SC-001 through SC-004. Its focused unit lane passed 49 tests, focused integration/packaging passed 69 tests, full suite passed 335 tests, build and integration inventory passed, the Accelerated `ready` validator passed with only the documented overlap warning, and `git diff --check` passed.

The reviewer independently confirmed O4-F001 with missing/spawn-failed/nonzero Git probes in a real repository, missing/malformed/valid marker probes, and verified non-Git/nonexistent-path controls. It confirmed O4-F002 for safe mismatched child roots in Codex and Claude plus exact host root/key and safe persisted-name acceptance. O3-F001 through O3-F003, bounded 256-of-260 alias inspection, migration/adoption, all host propagation, exact CLI selection, and target-nonmutating WAL/SHM preflight also passed.

Residual non-blocking notes: the historical pre-implementation plan-review hashes predate convergence refinements, and Oracle's full-suite run regenerated the benchmark fixture. Root removed that verifier-generated diff before archival. No open questions remain.

## Archive decision

Archive is permitted after canonical spec synchronization and closeout validation.
