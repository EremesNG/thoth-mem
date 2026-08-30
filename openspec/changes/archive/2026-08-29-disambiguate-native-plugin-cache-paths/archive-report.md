# Archive Report: Disambiguate native plugin cache paths

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-29-disambiguate-native-plugin-cache-paths/`

## Completed scope

- US1 / FR-001 / SC-001: native setup now uses exact host-specific marketplace and qualified plugin identities for Codex and Claude across inspection, planning, mutation, repair, rollback, provenance collision handling, legacy residue preservation, and schema-2 in-progress ownership.
- US2 / FR-002 / SC-002: both packed marketplace descriptors retain plugin/Skill `thoth-mem` under distinct host-specific marketplace segments, with exact topology, Skill resolution, documentation, packed verification, and distribution hashes.

## Verification lineage

- `verify-report.md` records independent Oracle PASS after focused 18-test verification, TypeScript build, 286-test full suite, inventory verification, three-host packed smoke, offline fixture, prepublish, descriptor hash comparison, and diff checks.

## Canonical specification sync

- Updated: `cli`, `packaging`.
## Deviations and residual warnings

- `RISK-SC-003`: real-host catalog consumption remains pending separate explicit authorization for one Codex and one Claude installation/migration observation.
- `ORACLE-WARN-001`: preserve the out-of-scope dirty `benchmarks/results/fixture-report.json`; it is not part of this archive's declared mutable surface.
- Convergence correction: the durable deltas now preserve the pre-existing OpenCode ownership and complete canonical-inventory obligations and their original acceptance scenarios while adding host-specific identities.

## Follow-up

- With separate authorization per host, migrate/install through the native manager, restart, and observe the exact catalog-expanded Skill path and successful Skill loading.
