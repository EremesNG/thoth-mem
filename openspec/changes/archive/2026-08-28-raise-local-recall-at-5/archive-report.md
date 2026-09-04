# Archive Report: Raise Local Recall at 5

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-28-raise-local-recall-at-5/`

Resolved target for this closeout: `openspec/changes/archive/2026-08-28-raise-local-recall-at-5/`.

## Completed scope

- Added the internal, versioned, bounded E0 lexical candidate with deterministic exact-first RRF fusion and auditable raw/fused work.
- Added four-lane offline v3 evaluation, dual immutable baselines, closed validation, fail-closed promotion, and the create-only 470-question official report.
- Preserved the exact six MCP tools, schema revision 5, local-only operation, current default, and zero embedding/vector/projection/runtime-dependency growth.

## Verification lineage

- `verify-report.md` records independent Oracle PASS with executed evidence across FR-001–FR-007 and SC-001–SC-006.
- Build, 6 focused files/59 tests, full 41 files/240 tests, integrations, packed smoke, fixture, prepublish, immutable hashes, and diff checks passed.

## Canonical specification sync

- Updated: `evals`, `retrieval`.
- Declared targets: canonical `retrieval` and `evals` specifications.

## Deviations and residual warnings

- E0 reached 419/470 RecallAny@5 (`0.891489`), below the required 447/470, and missed three best-reference quality floors. It passed latency, equal-byte footprint, identity, provenance, and zero-call gates. The validated decision is `retain_default`; `any-prefix-v1` remains the default.
- The new baseline manifest was added to the package inventory as planned; no runtime dependency, schema migration, persisted projection, embedding, or vector state was added.

## Follow-up

- A later IDF/document-frequency, projection, router, or semantic experiment is a new behavior boundary and requires a revised/new SDD plus fresh Oracle plan review before implementation.
