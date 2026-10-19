# Verification Report: Fix PR #21 Linux CI portability

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: PASS — all FRs and buildable SCs are implemented and covered.
- **Correctness**: PASS — focused reproduction, npm 12 behavior, XDG isolation, diagnostics, typing, and integration inventory checks pass.
- **Coherence**: PASS — artifacts, task state, implementation, tests, and unchanged runtime boundaries agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `scripts/npm-pack.mjs:15` handles npm CLI discovery, including Unix `../lib/node_modules` and `bin/npm` layouts; `scripts/npm-pack.mjs:34` validates exactly one array/keyed package record. `scripts/verify-packed-plugins.mjs:28` isolates homes, parses the record, approves npm 12 native install scripts, and installs the tarball; its remaining smoke retains CLI, setup, skill, MCP, and three-host lifecycle checks. `tests/packaging/first-product.test.ts:20` covers envelopes, failures, smoke, and inventory. | Oracle I2/I3; root V2/V4/V6 | PASS |
| FR-002 | `tests/integration/public-plugin-runner.test.ts:10` derives native disposable path identities, consumed throughout the changed runner cases. `tests/setup/native-managers.test.ts:204` and `tests/setup/native-managers.test.ts:470` pass explicit empty environments for home-relative configuration and journal assertions. | Oracle I2/I4; root V2 | PASS |
| FR-003 | `tests/release-marketplace.test.ts:52` creates the central repository entirely beneath its disposable root. `tests/fixtures/central-marketplace.ts:11` supplies two independent plugins, three descriptors, updater, validator, and node test. Publication assertions remain in `tests/release-marketplace.test.ts`. | Oracle I2; root V2 | PASS |
| FR-004 | The diff is limited to verification helpers, tests, and lifecycle artifacts; no `src/`, dependency, manifest, workflow, schema, or runtime implementation changed. Existing package inventory, six-tool MCP, provenance, identity fallback, manager recovery, exact three-file publication, idempotency, tag-first behavior, and non-force-push rejection remain asserted. | Oracle I2/I5/I6/I7; root V1–V7 | PASS |
| SC-001 `[buildable]` | Parser cases and actual package dry-run/smoke in `tests/packaging/first-product.test.ts:20` and `tests/packaging/first-product.test.ts:95`; public marketplace smoke included. | Oracle I2/I3 | PASS |
| SC-002 `[buildable]` | Native path fixtures and explicitly isolated manager environments above. | Oracle I2/I4 | PASS |
| SC-003 `[buildable]` | Synthetic central fixture plus exact-path, adjacent-plugin, retry, missing-tag, and race assertions in `tests/release-marketplace.test.ts`. | Oracle I2: release suite 4/4 | PASS |
| SC-004 `[buildable]` | Focused and broad repository gates complete. | Oracle I2/I5/I6/I7; root V1–V7 | PASS |

## Commands and results

Independently executed by Oracle:

- I1: SDD validator through `ready` — valid, zero errors or warnings.
- I2: focused five-suite reproduction — 5 files, 50 tests passed.
- I3: Node `24.20.0` / npm `12.0.2` direct probe — real keyed object with key `thoth-mem`, valid tarball filename, 48 inventory files, npm CLI resolved successfully.
- I4: two affected native-manager cases with ambient `XDG_CONFIG_HOME=Z:\...` — 2 passed.
- I5: `pnpm exec tsc --noEmit` — passed.
- I6: `pnpm run integration:verify` — verified all local/public OpenCode, Codex, and Claude Code inventories.
- I7: `git diff --check` — passed; post-test status contained only the intended change set.
- IDE diagnostics — zero errors across all seven changed implementation/test files.

Validated from root's executed evidence:

- V1: `pnpm run build` — passed.
- V2: `pnpm test` — 52 files, 433 tests passed.
- V3: `pnpm run integration:verify` — passed.
- V4: `pnpm run integration:smoke` — passed for all hosts and lifecycle fixtures.
- V5: `pnpm run benchmark:fixture` — passed; generated timing report restored afterward.
- V6: `pnpm run prepublishOnly` — passed, including 433 tests.
- V7: `git diff --check` — passed with non-blocking LF/CRLF notices only.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |

No critical issues or stable implementation warnings were found.

## Residual risks

- R-UBUNTU-001: The actual GitHub-hosted Ubuntu rerun remains unobserved because this session did not push the branch. The implementation structurally covers setup-node's Unix layout, but only the remote rerun closes that operational uncertainty. A separately authorized push and CI rerun is the observation plan.
- SC-002 is the buildable runner/native-manager criterion and passed. The Ubuntu rerun is recorded separately as residual outcome risk, not as an implementation gap.
- LF/CRLF notices are non-blocking repository hygiene warnings.

## Open questions

None.
