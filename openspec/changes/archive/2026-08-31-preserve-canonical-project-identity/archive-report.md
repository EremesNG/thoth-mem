# Archive Report: Preserve stable local project identity

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-31-preserve-canonical-project-identity/`

## Completed scope

- Added one atomic local UUID identity per Git common directory, shared by worktrees and stable across moves while independent clones remain distinct.
- Added revision-7 exact project aliases, deterministic path-project adoption without duplicate merging, bounded alias inspection, and recoverable migration backup behavior.
- Propagated exact canonical key, persisted display name, and verified root identity through lifecycle, Codex, Claude Code, OpenCode, public runners, MCP schemas, Skills, and distribution inventories.
- Added strict display-only `project rename` administration with exact selector validation and target-nonmutating SQLite preflight.
- Closed all Oracle findings across five independent verification rounds; the final matrix passed FR-001 through FR-010 and SC-001 through SC-004.

## Verification lineage

- `verify-report.md` records independent Oracle round-5 PASS after 49 focused unit tests, 69 focused integration/packaging tests, 335 full-suite tests, build, integration inventory, packed smoke, offline benchmark fixture, prepublish, SDD ready validation, and diff hygiene.
- Adversarial evidence covers concurrent marker publication, unsafe/unavailable Git state, exact alias reuse, prohibited controls, WAL/SHM-preserving selector preflight, public root/key mismatch rejection, migration rollback, and distribution parity.

## Canonical specification sync

- Updated: `cli`, `harness-integration`, `store`, `tools`.
## Deviations and residual warnings

- The historical pre-implementation `plan-review.md` hashes predate convergence refinements; every refinement preserved the same declared intent and the final fresh Oracle verified the current artifacts and implementation.
- The validator's semantic-overlap warning was reviewed: the added stable-local-Git-identity requirement is distinct from existing store requirements, while related existing requirements are explicitly declared as modified deltas.
- Full-suite and benchmark commands regenerate `benchmarks/results/fixture-report.json`; each verifier-only timestamp/output diff was removed before closeout.

## Follow-up

- Automatic duplicate-row merge, clone linking, and legacy project reconciliation remain explicitly out of scope for a future change.
