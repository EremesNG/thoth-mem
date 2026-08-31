# Archive Report: Central Thoth plugin marketplace

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-30-centralize-thoth-plugin-marketplace/`
**Planned target**: `openspec/changes/archive/2026-08-30-centralize-thoth-plugin-marketplace/`

## Completed scope

- Replaced repeated per-product native marketplace identities with one neutral
  `thoth-plugins` catalog while retaining independent thoth-mem and thoth-agents
  versions and distinct marketplace/plugin/version cache segments.
- Added validated tag-before-catalog release handoff and idempotent catalog-only retry
  tooling to both product repositories, and published the initial central catalog at
  commit `0f1fa5d784d629590bdeba2e309f39259f6ba9a7`.
- Added central-first, exact-owned Codex legacy cleanup with stopped-host precondition,
  fixed target registries, provenance/path/link guards, bounded retry guidance, and
  no restart garbage-collection assumption.
- Corrected implicit Windows Codex command lookup so Node observes the operator-visible
  npm shim through `ComSpec` with `shell:false`, without selecting installations or
  weakening the existing version/capability gate.
- Completed the guarded real-host migration, restart, and first catalog read with all
  eight legacy roots absent and sibling/unrelated manager and filesystem controls
  preserved.

## Verification lineage

- `verify-report.md` retains the historical pre-publication PASS, the first final
  Oracle FAIL for artifact finding `F-T038-001`, its bounded convergence in T045, and
  the fresh final Oracle PASS with zero blockers.
- Final Oracle evidence covers FR-001 through FR-007 and SC-001 through SC-006;
  central tests/validation, product focused/build/integration checks, remote commit
  equality, captured migration manifests, live manager state, and the post-restart
  `thoth-plugins/thoth-mem/0.4.13` Skill path all pass.

## Canonical specification sync

- Updated: `cli`, `packaging`.
- Declared targets are the `cli` and `packaging` canonical capabilities.
- Semantic-overlap review completed: `Plugin Releases MUST Publish Their Catalog
  Version` governs cross-repository tag/catalog ordering, retry, and publication
  failure. It is distinct from the existing packaging requirements governing tarball
  contents, canonical integration inventory, runtime provenance, setup ownership,
  and packed-host verification.

## Deviations and residual warnings

- The thoth-mem broad suite remains 297/298 because of the previously isolated
  Claude compact-checkpoint assertion in `tests/integration/public-plugin-runner.test.ts`;
  final Oracle confirmed that the implicated test/runtime files have no task-owned
  diff and all marketplace-focused/build/integration checks pass.
- The thoth-agents working tree retains substantial unrelated orchestration and
  configuration edits. They were preserved and excluded from central publication.
- Product repository changes are implemented and verified locally but were not pushed
  or released under the authorization that covered only the central marketplace push.

## Follow-up

- Publish new thoth-mem and thoth-agents product versions only under a separate,
  explicit release authorization; their release flows will then advance only their
  own central catalog entries.
