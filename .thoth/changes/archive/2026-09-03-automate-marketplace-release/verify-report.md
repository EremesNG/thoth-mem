# Verification Report: Automate Marketplace Release Publication

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: PASS — FR-001 through FR-003 and SC-001 through SC-003 are implemented and verified; SC-004 is correctly retained as outcome risk.
- **Correctness**: PASS — ordering, default-success gating, authentication scope, token flow, package scripts, and publisher safeguards satisfy the contract.
- **Coherence**: PASS — artifacts, implementation, tests, documentation, and the approved archived reference agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `.github/workflows/release.yml:22` orders npm publication, GitHub release, token creation, then `release:marketplace`; no `if:` or `continue-on-error` weakens default success gating. `tests/release-marketplace.test.ts:125` owns the workflow contract. | Focused Vitest 5/5; Oracle exact workflow scan | PASS |
| FR-002 | `package.json:53` retains `release:marketplace`; patch/minor/major end at `git push --follow-tags`. `tests/release-marketplace.test.ts:167` asserts the contract and `docs/agent/native-lifecycle.md:21` documents ownership. | Focused Vitest 5/5; Oracle manifest scan | PASS |
| FR-003 | `.github/workflows/release.yml:26` uses `actions/create-github-app-token@v3`, exactly the two required secrets, current owner, only `thoth-plugins`, only `permission-contents: write`, and exposes the output once as marketplace `GH_TOKEN`. | Focused Vitest 5/5; Oracle exact credential/occurrence scan | PASS |
| SC-001 `[buildable]` | Workflow contract at `tests/release-marketplace.test.ts:125` verifies ordering and exact token scope. | Focused Vitest 5/5; SDD ready valid | PASS |
| SC-002 `[buildable]` | Package contract at `tests/release-marketplace.test.ts:167` verifies all three version scripts and the retained manual retry. | Focused Vitest 5/5 | PASS |
| SC-003 `[buildable]` | `tests/release-marketplace.test.ts:181` preserves target-only/idempotent publication; later cases preserve missing-tag and normal-push-race rejection. `scripts/publish-marketplace.mjs` retains its exact owned paths, no-op, rejection, and non-force push. | Focused Vitest 5/5; root full regression evidence | PASS |
| SC-004 `[outcome]` | No real tag-release/App publication was executed; `docs/agent/testing.md:30` truthfully documents that boundary. | N/A — observe the next real release | RISK |

## Commands and results

Independently executed by Oracle:

- `pnpm exec vitest run tests/release-marketplace.test.ts --config vitest.config.ts` — 1 file, 5 tests passed.
- SDD validator through `ready` — valid, no warnings or errors.
- `git diff --check` — passed; line-ending notices only.
- Exact workflow/manifest scan — one reference to each App secret and App-token output, one legitimate `github.token` reference for GitHub release creation, zero extra App permissions/repositories, and zero credential material.
- `actionlint` lookup — unavailable.
- Working-tree status remained unchanged during independent verification.

Validated from Root's executed evidence:

- TDD red workflow contract — 1 expected failure / 4 passing tests before workflow implementation.
- TDD red package-script contract — 1 expected failure / 4 passing tests before manifest implementation.
- `pnpm run build` — passed.
- `pnpm test` — 52 files, 434 tests passed.
- `pnpm run integration:verify` — passed.
- `pnpm run integration:smoke` — passed for OpenCode, Codex, Claude Code, and lifecycle fixtures.
- `pnpm run benchmark:fixture` — passed; generated environment-dependent report restored afterward.
- `pnpm run prepublishOnly` — passed, including 52 files and 434 tests.
- `git diff --check` — passed.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| R-001 | Residual risk | Completeness | SC-004 lacks a real tag-release/App publication observation. | Observe the next tag release and confirm one bot catalog update or an already-current result without manual publication. |
| W-001 | Low | Correctness | `actionlint` is unavailable locally. | Run `actionlint .github/workflows/release.yml` when available. |
| W-002 | Low | Correctness | `actions/create-github-app-token@v3` is a mutable major-version reference matching the approved reference. | Pin a reviewed commit SHA if immutable action policy is adopted. |

## Residual risks

- SC-004: R-001 — The live App installation and cross-repository push remain unobserved. The next real release must produce one bot catalog update or an already-current result without a maintainer-run publication command.
