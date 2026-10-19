# Implementation Plan: Idempotent semantic rebuild detection

## Technical context

The diagnosis has two independent causes on the same startup path:

1. `handleRebuildIndex(... --status)` uses the normal `withStore` path. Constructing `Store` runs schema/migration startup, stale-job recovery, config/coverage repair, and reconciliation before the status branch executes; `getSemanticIndexProgress()` reconciles again. The command is therefore observational in presentation only, not in durable behavior.
2. `Store.enqueueRebuildOnMissingSemanticCoverage()` compares every active observation with the set of observations that produced chunks and sentences. A historical observation whose normalized content is empty is a valid zero-unit semantic result, yet it remains permanently absent from both semantic tables. Once the current child jobs drain, the next normal store opening sees `chunked < activeObservations` and `sentenced < activeObservations`, reactivates `rebuild:missing-semantic-coverage`, and processes the full corpus again. A read-only aggregate inspection of the live database found exactly one such blank active observation; no user content was read, and the database was never opened through `Store` during diagnosis.

The user-provided LM Studio configuration is not the trigger. Its persisted semantic state and vectors share one 768-dimensional embedding hash, and existing configuration code excludes execution-only `embedding.device` from `configHash`. Tests will use disposable databases and mock embedding providers; no LM Studio request or live rebuild is part of implementation verification.

Affected runtime surfaces are `src/store/index.ts` and `src/cli.ts`; nearest regression suites are `tests/store/index.test.ts`, `tests/cli.test.ts`, and the existing device-hash coverage in `tests/config.test.ts`. There is no schema migration and no change to embedding providers, retrieval ranking, or MCP tool registration.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The change adds no MCP tool and alters only CLI observation plus internal store initialization/coverage behavior.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Automatic semantic repair remains present for genuine lineage and indexable-coverage gaps; lexical/KG fallback and degraded signaling are unchanged.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The repair is implemented in the host-neutral Store/CLI path and introduces no Codex-, LM Studio-, or harness-specific persistence semantics.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recall modes, trimming, scoring, and result bounds are outside the changed surface.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — `rebuild-index --status` keeps its name and output shape while fulfilling its existing observational meaning; no public contract is removed or renamed.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add an explicit read-only Store opening mode for observational commands. In this mode `better-sqlite3` opens with `readonly`/`fileMustExist`, enables `query_only`, skips schema, migrations, sqlite-vec initialization, job recovery, automatic rebuild checks, and reconciliation. `getSemanticIndexProgress()` and `getSemanticIndexState()` return persisted state without reconciliation when opened read-only. Route only `rebuild-index --status` through this mode. | `src/store/index.ts` (`Store` constructor/open options, progress/state access); `src/cli.ts` (`createStoreContext`, `withStore`, `handleRebuildIndex`) | Public CLI seam: run `runCli(['rebuild-index','--status',...])` on a disposable file DB and compare semantic table snapshots before/after. Store seam: `new Store(path, config, { mode: 'read-only' })` can report persisted progress and rejects writes at the SQLite layer. |
| FR-002 | Keep normal MCP/store startup in repair mode, but make clean detection converge by excluding observations whose content normalizes to no semantic text from structural-coverage requirements. Repeated opens over completed indexable content plus a blank legacy observation therefore perform no queue/state mutation. | `src/store/index.ts` (`enqueueRebuildOnMissingSemanticCoverage`, shared semantic-content eligibility SQL/helper) | Public Store seam: seed one normal and one blank observation in a disposable file DB, complete semantic jobs with a mock provider, close, reopen twice with the same config, and assert zero active rebuild jobs plus stable ready lanes. |
| FR-003 | Define empty/whitespace-only normalized content as a valid terminal zero-unit result, matching `splitIntoChunks()` behavior. Vector completeness remains measured only against materialized chunk/sentence units, so every created semantic unit still requires a vector. | `src/store/index.ts`; behavioral alignment with `src/retrieval/sentences.ts` | Store progress and SQL seam: the blank observation produces zero semantic units, while nonblank observations retain complete unit/vector coverage and clean state after processing. |
| FR-004 | Leave config mismatch, uncovered vector-lineage checks, active-job guard, and rebuild dedupe key semantics intact. Add regression coverage that a nonblank observation with genuinely missing structural coverage still queues exactly 1 active rebuild across repeated normal opens. | `src/store/index.ts`; `tests/store/index.test.ts` | Public Store seam: manipulate only a disposable DB through documented Store/DB test seams, reopen normally twice, and count active `rebuild_semantic` jobs. Existing different-lineage and vector-lineage tests remain required. |
| FR-005 | Do not change `configHash`. Treat the supplied `device: 'auto'` as execution-only and rely on the existing canonical hash implementation/tests; add only a fixture assertion if current coverage cannot express repeated LM Studio `profile: 'auto'` materialization without production changes. | `src/config.ts` (unchanged expected); `tests/config.test.ts` (existing coverage, fixture extension only if needed) | Public config seam: `getConfig()` in a temporary data directory yields the same hash repeatedly and across device-only changes. |

### TDD seams confirmed by this plan

- CLI seam: `rebuild-index --status` is a strictly read-only observation of semantic jobs and lane state.
- Startup seam: repeated normal Store/MCP initialization over unchanged configuration and valid terminal coverage is idempotent.
- Repair seam: a genuine nonblank coverage or lineage defect still produces exactly one deduplicated active rebuild.

Implementation proceeds one vertical slice at a time: first add a failing assertion at the public seam, prove the intended RED failure, implement the minimum production change, and rerun to GREEN before the next slice. No production implementation begins until the user confirms these seams at the ready gate.

## Optional support artifacts

- `research.md`: Not needed; the root cause and privacy-safe aggregate evidence are concise and captured in Technical context.
- `data-model.md`: Not needed; no table, column, relation, or migration changes.
- `contracts/`: Not needed; the CLI command name/output and Store data model remain compatible, and the constructor option is an internal TypeScript execution control.
- `quickstart.md`: Not needed; operator commands do not change.

## Risks and migrations

- Read-only Store initialization can accidentally execute a write-oriented PRAGMA or reconciliation call. Mitigation: open SQLite with `readonly` and `fileMustExist`, set `query_only`, branch before all write-oriented startup work, and assert zero semantic row changes at the CLI seam. Rollback: remove the read-only mode and status routing independently of the coverage fix.
- A loose blank-content predicate could classify meaningful content as non-indexable. Mitigation: align eligibility with the existing `splitIntoChunks()` normalization contract and cover empty, whitespace-only, and nonblank boundary cases. Rollback: narrow the predicate without any data migration.
- Excluding valid zero-unit observations must not hide corrupted nonblank coverage. Mitigation: a nonblank missing-coverage regression must still queue exactly 1 rebuild, and vector coverage/lineage checks remain unchanged.
- The live rebuild is currently in progress. Implementation and verification use only disposable databases; no command opens, stops, cleans, or mutates the user's live database. Real-host confirmation remains an explicit post-upgrade outcome check owned by the user.
- No migration or destructive cleanup is planned. The historical blank observation remains stored; the fix changes only whether it is incorrectly treated as missing semantic work.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The design changes no tool registration or MCP surface; Store opening mode is internal and the existing CLI command is preserved.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — The design retains automatic repair for nonblank coverage and lineage defects, and does not touch deterministic fallback or degraded-state output.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Idempotency is enforced in shared Store semantics and the generic CLI, with no provider- or harness-owned fields entering persistence.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — The design does not affect recall assembly, limits, compression metadata, or context expansion.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — The existing status command becomes behaviorally safer without rename, removal, output incompatibility, or taxonomy change.
