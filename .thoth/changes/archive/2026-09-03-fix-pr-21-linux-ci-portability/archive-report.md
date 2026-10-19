# Archive Report: Fix PR #21 Linux CI portability

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-09-03-fix-pr-21-linux-ci-portability/`

## Completed scope

- Made packed verification portable across supported Windows and Linux npm layouts and npm 10/12 JSON envelopes while preserving disposable three-host smoke coverage.
- Replaced host-specific lifecycle paths and ambient-XDG-sensitive setup cases with isolated platform-native fixtures.
- Replaced the sibling marketplace checkout dependency with a self-contained synthetic two-plugin central catalog.
- Preserved product runtime, package inventory, setup ownership, lifecycle identity, and marketplace release semantics.

## Verification lineage

- `verify-report.md` records independent Oracle PASS with complete FR/SC mapping, independently executed focused checks, and validated broad repository evidence.
- Root verification passed 5 focused files / 50 tests, 52 full-suite files / 433 tests, build, integration inventory, packed smoke, benchmark fixture, prepublish, and diff hygiene.

## Canonical specification sync

- Updated: `packaging`.
## Deviations and residual warnings

- `R-UBUNTU-001`: The actual GitHub-hosted Ubuntu rerun remains unobserved because push and remote CI were explicitly out of scope. A separately authorized push and rerun will close this operational uncertainty.
- Git emitted non-blocking LF/CRLF notices for disposable fixtures; `git diff --check` passed.
- The benchmark command refreshed environment-dependent report values; the generated report was restored so no unrelated output remains in the change.

## Follow-up

- After separate authorization, push the branch and observe the GitHub-hosted Ubuntu job for PR #21.
