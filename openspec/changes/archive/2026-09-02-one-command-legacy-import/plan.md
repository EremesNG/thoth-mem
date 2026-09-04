# Implementation Plan: One-Command Legacy Import

## Technical context

The importer core already provides the safety-critical `planLegacyImport` and `applyLegacyImport` operations, closed plan/report contracts, online backup, isolated candidate construction, fingerprint revalidation, atomic publication, recovery bundles, integrity checks, and durable receipts. The current CLI exposes only `import-legacy plan` and `import-legacy apply`, and its test suite deliberately rejects the one-command form. This change corrects that public boundary without changing SQLite schema, import policy, taxonomy, ranking, project reconciliation, or MCP behavior; convergence advances only the sealed plan contract to v4 so the receipt-bound plan hash also covers the canonical mapping request.

The public seam is `runCli(args)` and the packaged `thoth-mem` binary. The normal form will be `thoth-mem import-legacy`, with optional `--source`, `--map`, `--data-dir`, and `--json`. The source defaults to `<home>/.thoth/thoth.db`; the target resolves through `loadRuntimeConfig()` to `<dataDir>/memory.sqlite`. Advanced `plan` and `apply` remain explicit subcommands. A bounded read-only core lookup returns only the committed import ID and plan hash for a source logical fingerprint so the CLI can select exact replay custody without copying receipt SQL. Root owns the coupled core lookup, CLI, tests, documentation, and SDD artifacts because receipt selection, parser behavior, filesystem custody, output contract, and regression tests form one ordered behavior chain.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The change adds no MCP tool; migration remains a CLI administration workflow.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — The one-command wrapper delegates exclusively to the deterministic SQLite importer and introduces no model, network, vector, graph, or optional projection dependency.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Source and target resolution are host-neutral runtime configuration concerns, and the underlying import records keep the existing `import` harness semantics.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recall contracts and limits are unchanged; CLI output is bounded to aggregate dispositions and owned artifact references.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The specification explicitly modifies the legacy-import CLI boundary, preserves the legacy source and recovery path, and keeps migration one-way and observable without adding a legacy runtime fallback.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 / SC-001 | Dispatch `import-legacy` without a subcommand to a one-command orchestration path; default the source from `homedir()` and resolve the target from runtime configuration. | `src/cli.ts` | `runCli(['import-legacy', ...])` against disposable source/config/target fixtures |
| FR-001 / SC-002 | Create one request-keyed importer-owned directory below `<dataDir>/imports`, retain immutable plan attempts by plan hash, create one report per invocation, and emit a versioned bounded result with aggregate dispositions plus nullable backup/recovery references. | `src/cli.ts` | Captured stdout parsed as the public JSON envelope; assertions prohibit source prose and cover absent-target null artifacts |
| FR-001 / SC-003 | Reuse core alias, fingerprint, lock, candidate, publication, and failure-report checks; catch failures at the CLI boundary and emit one bounded actionable error without claiming success. | `src/cli.ts` | Locked/invalid CLI fixtures plus unchanged source/target hashes and absent success output |
| FR-001 / SC-004 | Derive request custody from the current source logical fingerprint, exact paths, canonical mapping input, and policy; store baseline-bound attempts by plan hash; use a read-only core receipt lookup to select the exact committed attempt, otherwise use the fresh attempt. | `src/memory-core/import/legacy-v1.ts`, `src/cli.ts`, `tests/cli/import-legacy.test.ts` | Equivalent post-commit invocation returns duplicate zero-delta; pre-commit target-change failure followed by one stable retry commits; changed/substituted custody fails closed |
| FR-001 / SC-005 | Preserve dispatch and parsing for explicit `plan` and `apply`; only the formerly rejected no-subcommand shape changes meaning. | `src/cli.ts` | Existing explicit plan/apply CLI tests remain passing without weakening their assertions |
| FR-001 / SC-006 | Replace README choreography for the normal path with one command while documenting stopped-host precondition and advanced audit subcommands separately. | `README.md` | Documentation command matches packaged help and the post-build CLI smoke invocation |

### Command and output contract

- Normal command: `thoth-mem import-legacy [--source <legacy.sqlite>] [--map <mapping.json>] [--data-dir <dir>] [--json]`.
- Default source: `join(homedir(), '.thoth', 'thoth.db')`.
- Default target: `join(loadRuntimeConfig({ explicitDataDir }).dataDir, 'memory.sqlite')`.
- Owned artifacts: one deterministic request-keyed child of `join(dataDir, 'imports')`, with immutable v4 plan attempts at `plans/<planHash>.json`, create-only request-key sidecars, and create-only uniquely named reports under `reports/`. The request key hashes the inspected source logical fingerprint, exact resolved source/target paths, canonical parsed mapping input, and importer policy hash; it excludes the mutable target baseline while each plan hash includes that baseline and the complete canonical mapping request, preserving null/empty/populated distinctions. Existing files are never overwritten. The imports root, request directory, and owned children must resolve beneath the configured data directory, be regular directories/files as applicable, and reject symbolic-link/reparse aliases or inconsistent plan filename/hash/path/policy/source/mapping bindings.
- Execution: parse and validate options, parse the optional mapping, and run zero-write fresh planning to inspect current inputs and derive the request key plus current baseline-bound attempt. Ask the core read-only lookup whether the target already has a committed receipt for the fresh source logical fingerprint. If none exists, create-or-verify the fresh `plans/<planHash>.json` attempt and apply it. If a receipt exists, require a matching request directory and exact `plans/<committedPlanHash>.json`, parse and verify its request/source/target/policy custody, and apply that retained plan as replay. Retain success or structured failure under a new create-only report name and return only after core verification. A stale uncommitted attempt does not block the next invocation because the next baseline produces another plan hash; a missing or tampered committed attempt fails closed instead of replanning.
- Success output: a versioned envelope containing `committed`, `duplicate`, aggregate dispositions/reasons, and absolute owned plan/report paths plus nullable backup/recovery paths. Default human output is compact; `--json` emits the closed envelope.
- Failure output: the existing bounded importer message plus the retained failure-report path when one exists. Raw source content is never written to stdout/stderr or the run envelope.

### TDD seam

The user has confirmed the CLI as the intended public interface. TDD therefore exercises only `runCli(args)` and packaged CLI behavior, not private parser helpers. The first tracer test proves a single invocation with explicit disposable source/data-dir values; later slices add default path resolution, bounded output/artifact custody, locked failure, repeat safety, and unchanged advanced commands.

## Optional support artifacts

- `research.md`: not needed; the archived import SDD, current CLI, and passing real-data rehearsal establish all required behavior.
- `data-model.md`: not needed; no schema or persisted import contract changes.
- `contracts/`: not needed; the new bounded output envelope is local to the CLI and can be specified and tested directly in `src/cli.ts`.
- `quickstart.md`: not needed; `README.md` owns the public command and advanced audit examples.

## Risks and migrations

- **Accidental bypass of safety checks**: The wrapper must call the existing planner and apply orchestrator directly and must not recreate candidate/publication logic. Rollback is removal of the wrapper dispatch; no data migration is introduced.
- **Target held by the invoking host**: Windows cannot publish over the open target. The command fails before reporting commit and tells the operator to close all hosts and rerun the same one-line command; it never terminates processes itself.
- **Artifact collision, aliasing, or partial failure**: Each request uses a SHA-256-keyed owned directory, each plan uses its sealed hash, and each invocation uses a collision-resistant create-only report name. Resolved-containment plus regular-file/directory and symlink/reparse rejection prevents custody escape. A structured apply failure is retained for diagnosis; unrelated files are never overwritten or cleaned.
- **Privacy leakage**: Output includes only bounded enums, counts, IDs, and paths already permitted by the import report. Tests seed recognizable source prose and assert it is absent from stdout/stderr.
- **Repeat and retry semantics**: The core accepts a committed source only with its exact original plan hash. A read-only receipt lookup selects that immutable attempt for equivalent replay and verifies a duplicate zero-delta report. Before commit, each new target baseline creates a new attempt, so a stable retry can recover from a stale-plan failure. A changed source, path, mapping input, policy, missing committed attempt, substituted plan, or tampered custody cannot silently replay.
- **Public contract correction**: The formerly rejected one-command shape becomes supported. Explicit subcommands remain the advanced audit interface; no compatibility alias or dual importer is added.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The complete design changes only CLI dispatch and documentation and registers zero MCP tools.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — All mutation and verification remain inside the existing deterministic SQLite plan/apply engine with zero optional dependencies.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The wrapper uses shared runtime configuration and import semantics without any Codex-, OpenCode-, or Claude-specific data behavior.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Retrieval is untouched and the output contract contains only bounded aggregate import evidence.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The one-command boundary, advanced audit escape hatch, non-destructive source, stopped-target failure, durable report, backup, and recovery behavior are all explicit and testable.
