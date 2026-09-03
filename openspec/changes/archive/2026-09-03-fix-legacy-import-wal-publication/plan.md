# Implementation Plan: Safe WAL Publication for Legacy Import

## Technical context

The one-command importer plans against a logical target baseline plus exact main/non-empty-WAL hashes, backs up the current database, builds and verifies a closed candidate, then calls `publishCandidate`. The production failure occurs because `assertStoppedTarget` validates the sealed physical hash inside an exclusive transaction but closes the connection before target file enumeration. SQLite may checkpoint the committed WAL on that close, producing a logically identical main file and absent/empty WAL. Publication and restoration then compare the normalized database to stale pre-checkpoint bytes and falsely report both target mutation and unverified restoration.

The fix remains inside the existing SQLite import engine. It introduces a post-quiescence publication snapshot, validates recovery custody against that snapshot, and proves restoration by logical/integrity checks. It retains the sealed plan as the precondition, the verified backup as the durable fallback, the stopped-host requirement, and fail-closed detection for busy checkpoints, changed logical state, or occupied target paths. No schema, plan/report schema, mapping, taxonomy, ranking, MCP, CLI syntax, dependency, or native-addon change is permitted.

The TDD seams proposed for user confirmation are the exported `applyLegacyImport` operation for success/restoration semantics and `runCli(args)` for one-command failure/actionable output. Tests use disposable real SQLite files and reports; they do not mock importer internals or touch the real user databases.

Implementation ownership is one `deep` writer for `src/memory-core/import/backup.ts`, any necessary failure classification in `src/memory-core/import/legacy-v1.ts`, and the focused importer/CLI tests. This coupled high-risk surface benefits from isolated implementation reasoning; Root retains SDD artifacts, task state, reconciliation, builds, and final independent verification.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The change modifies only the existing CLI import engine and registers no MCP tool.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — Publication remains deterministic local SQLite/filesystem work with no model, network, semantic lane, or optional projection dependency.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The post-quiescence and recovery rules apply to the shared SQLite target independently of Codex, OpenCode, or Claude Code.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recall selection, content, limits, and telemetry are untouched.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The source database remains untouched, migration remains one-way and observable, backup/recovery remain explicit, and no compatibility fallback or dual runtime path is added.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 / SC-001 / SC-004 | Preserve sealed-plan validation, verified backup/candidate construction, report v3, plan v4, and one-command syntax; allow only a proven logical-equivalent WAL normalization before publication. | `src/memory-core/import/backup.ts`, `src/memory-core/import/legacy-v1.ts`, `src/cli.ts` unchanged unless failure classification requires it | `applyLegacyImport({ plan })`; `runCli(['import-legacy', ...])`; existing importer and CLI suites |
| FR-002 / SC-001 | Replace the check-and-close-only publication prelude with a target-preparation operation. For an existing target it validates the sealed logical and physical state, attempts a complete zero-busy WAL truncate/checkpoint when WAL mode applies, reacquires a bounded exclusive barrier, proves logical equality, closes, and captures a normalized `{ logicalFingerprint, fileFingerprint, files }` snapshot. DELETE/no-WAL and absent targets retain their existing behavior. | `src/memory-core/import/backup.ts` publication preparation and snapshot types | Disposable non-empty-WAL plan through exported `applyLegacyImport`; committed report and baseline equality |
| FR-002 / FR-004 / SC-003 | Immediately before movement, require the target file fingerprint/set to equal the post-quiescence snapshot. Move only the captured target set, require all active target main/WAL/SHM paths to be absent, verify the recovery database, and compare its logical plus normalized physical snapshot before candidate placement. Any busy checkpoint, mismatch, rename lock, or path occupancy fails closed. | `src/memory-core/import/backup.ts`; bounded error classification in `src/memory-core/import/legacy-v1.ts` if Node filesystem lock codes are not currently recognized | Held read-transaction fixture; changed/occupied target fixture; CLI nonzero/actionable failure and no import receipt |
| FR-003 / SC-002 | Carry the verified recovery snapshot through publication. On failure, detach any published candidate file set without overwriting artifacts, restore only captured recovery entries, and verify restored SQLite integrity, foreign keys, and logical equality with the captured snapshot. `restorePublishedTarget` uses the same proof. Physical equality to the pre-checkpoint plan is deliberately not a restoration criterion. | `src/memory-core/import/backup.ts`, `src/memory-core/import/legacy-v1.ts` failure/report path | Existing and new injection points after target movement, candidate movement, and before reopen verification; report `priorTargetRestored=true`; baseline remains retrievable |
| FR-004 / SC-003 | Keep the cross-platform stopped-host precondition explicit. Translate SQLite busy/locked and relevant filesystem sharing violations into the existing bounded close-host-and-rerun action; never claim the close-to-rename interval is race-free. | `src/memory-core/import/legacy-v1.ts`, existing `src/cli.ts` error boundary, `README.md` only if current wording is insufficient | Core failure code plus CLI stderr assertions using disposable locked/WAL fixtures |
| SC-005 | Do not run the real source/target during implementation. Produce a packaged build and passing independent verification; real cutover remains a separately authorized outcome step. | `dist/index.js` generated only by build; retained SDD verification report | Build/prepublish evidence now; later real `thoth-mem import-legacy` report and post-cutover recall/integrity |

### Publication sequence

1. Revalidate source and target against the sealed plan and finish candidate verification exactly as today.
2. Prepare the current target for publication: prove plan equality, complete a non-busy WAL checkpoint when applicable, re-prove logical equality under a bounded barrier, close the database, and capture the normalized post-quiescence snapshot.
3. Allocate recovery custody, revalidate the target file set against that snapshot, and move only that observed set.
4. Verify the moved recovery database for SQLite integrity, foreign keys, logical equality, and normalized physical equality; require the active target file set to remain empty.
5. Move the already closed DELETE-journal candidate into the target main path, verify its logical fingerprint, then run the existing full reopened-import verification.
6. On any failure after movement, detach candidate files, restore captured recovery files without overwrite, and prove restoration against the recovery snapshot. Retain backup, recovery directory, bounded report, and truthful `priorTargetRestored`.

### TDD slices

1. Red: an exported-apply test with a sealed non-empty-WAL target reproduces the current publication failure. Green: post-quiescence snapshot publication commits and preserves baseline.
2. Red: the same fixture with `after-target-move` reports false restoration. Green: logical/integrity restoration returns `priorTargetRestored=true` without byte identity.
3. Red: candidate-move and reopen failure cases expose any remaining sidecar/restoration gaps. Green: one shared restoration path handles target and candidate file sets.
4. Red: a held read transaction makes WAL truncation incomplete or busy. Green: apply returns `TARGET_LOCKED`, leaves zero import receipts, and CLI emits the existing close-host-and-rerun action.
5. Regression: DELETE/no-WAL, absent target, changed target, one-command defaults/mapping, explicit plan/apply, replay/custody, taxonomy/quarantine, and ranking tests stay green.

## Optional support artifacts

- `research.md`: created because SQLite close/checkpoint behavior, physical-versus-logical identity, and the unavoidable cross-platform handoff gap materially determine the safe design.
- `data-model.md`: not needed; no table, receipt, plan, report, or row-shape change.
- `contracts/`: not needed; public CLI and JSON schemas remain unchanged.
- `quickstart.md`: not needed; the normal command remains `thoth-mem import-legacy` and existing README guidance already states the stopped-host precondition.

## Risks and migrations

- **Concurrent host activity after barrier release**: A native-free multi-file handoff cannot hold the SQLite lock across Windows renames. Mitigation is a minimal interval, exact post-quiescence file-set comparison, recovery revalidation, target-path occupancy checks, no-overwrite restoration, and truthful fail-closed reporting. The stopped-host requirement remains authoritative.
- **Checkpoint changes bytes before publication**: This is expected only after the sealed plan state is proven and only when logical equality remains exact. The verified backup already exists before publication preparation; rollback retains logical contents even when main/WAL layout is normalized.
- **Busy or partial checkpoint**: Inspect SQLite checkpoint results explicitly. Any busy frame or inability to regain the barrier is `TARGET_LOCKED`; no target files are moved and no import receipt reaches the active target.
- **Recovery verification mutates sidecars**: Normalize fingerprint semantics so absent/empty WAL are equivalent, capture the verified recovery logical snapshot, and base restoration truth on integrity/FK/logical equality. Never require stale SHM identity.
- **Candidate sidecars after unexpected reopen**: Detach and clean the complete candidate file set before restoring prior files; refuse overwrite of any unrelated occupied target or artifact path.
- **Compatibility regression**: Preserve current exported signatures unless a bounded internal result type is necessary; retain report v3/plan v4 and all existing tests. Rollback is removal of the publication snapshot implementation; there is no schema/data migration. Retained real backup/report artifacts are not deleted by this change.
- **Workspace overlap**: Existing uncommitted one-command import changes own adjacent importer/CLI tests and source. The implementation writer must preserve them and restrict edits to the WAL fix surface.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The design adds zero MCP tools and keeps migration in the existing CLI/core workflow.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — The selected algorithm uses only deterministic SQLite snapshots, file custody, and closed integrity checks; no optional lane becomes load-bearing.
- **P3 — Harness-Agnostic Memory Contract**: PASS — One shared importer handles every host's SQLite target, and no harness payload or platform-specific data semantics enters the core.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — No retrieval path or response envelope changes; imported recall remains governed by the existing stable ranker.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The plan preserves the untouched legacy source, verified current-target backup, observable one-way import, fail-closed rollback, and existing public syntax without adding a legacy runtime shim.
