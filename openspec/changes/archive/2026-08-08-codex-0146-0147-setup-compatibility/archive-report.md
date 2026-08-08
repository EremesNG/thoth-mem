# Archive Report: Forced Codex version override

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-08-codex-0146-0147-setup-compatibility/`

## Completed scope

- Codex setup preserves its existing version-gated strategy when `--force` is absent.
- When `--force` is present, only the tested-version predicate may be overridden; complete selected-scope plugin-manager capabilities and classifiable manager state remain mandatory.
- Forced modern setup preserves the existing evidence-derived result, emits exactly one bounded warning, and avoids irrelevant legacy configuration-backup diagnostics.
- Controlled forced and unforced Codex `0.146.x` and `0.147.x` execution covers FR-001 through FR-007 and SC-001 through SC-006 without mutating a real Codex home.

## Verification lineage

- `verify-report.md` records independent oracle PASS with a complete FR/buildable-SC compliance matrix and executed focused tests, typecheck, packaging verification, IDE diagnostics, and diff checks.
- Root verification additionally passed the complete setup domain, production build, dashboard build, and full Vitest regression suite.

## Canonical specification sync

- Updated: `cli`, `harness-integration`.
## Deviations and residual warnings

- No implementation deviation or unresolved blocking issue remains.
- Real Codex `0.147.x` mutation was intentionally not run; the accepted specification requires controlled execution for that version.
- Git reports LF-to-CRLF advisory notices on changed text files, while `git diff --check` passes.
- The unrelated `package.json` package-manager update is outside this change and remains untouched.

## Follow-up

- None.
