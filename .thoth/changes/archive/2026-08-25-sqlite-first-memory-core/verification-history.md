# Verification Report: SQLite-first persistent memory core v2

**Reviewer**: fresh Oracle (`oracle_sqlite_core_final_verify`)<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: FAIL — accepted projection, recovery/telemetry, native lifecycle, importer-report, and benchmark-gate behavior is missing or partial.
- **Correctness**: FAIL — direct reproductions show bounded context, installed plugin execution, compaction recovery, and fail-closed benchmark promotion are incorrect.
- **Coherence**: FAIL — T001–T053 and documentation overstate coverage because several passing checks exercise simplified substitutes rather than the accepted contracts.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001–FR-005 | `src/memory-core/sqlite`, `service.ts` | ledger/service tests; full suite | PASS |
| FR-006 | projection registry only | projection inspection | FAIL |
| FR-007–FR-008 | v2 migrations and identity resolver | focused/full tests | PASS |
| FR-009–FR-010 | read-only staged importer | importer/CLI tests and report inspection | FAIL |
| FR-011–FR-014 | lexical core; deferred lanes absent | retrieval/package audit | PASS |
| FR-015 | prefix sanitizer | query-builder inspection | FAIL |
| FR-016–FR-019 | immediate lexical recall and stable lineage | focused/full tests | PASS |
| FR-020–FR-023 | bounded context/recovery/telemetry | direct budget and compaction reproductions | FAIL |
| FR-024–FR-025 | non-blocking core; vectors absent | package/runtime audit | PASS |
| FR-026–FR-027 | registry upsert only | projection implementation inspection | FAIL |
| FR-028–FR-033 | KG/LLM absent; six tools and lane truth | registry/full tests | PASS |
| FR-034 | normalized events only | host adapter/package inspection | FAIL |
| FR-035–FR-038 | shared core and no graph action | CodeGraph, registry tests | PASS |
| FR-039 | assets present but installed/native execution broken | installed Codex reproduction | FAIL |
| FR-040 | no passive capture | lifecycle tests | PASS |
| FR-041–FR-042 | no delivered recovery context/capability proof | compaction/native inspection | FAIL |
| FR-043–FR-049 | Skill setup and identity-tool removal | setup/adapter tests | PASS |
| FR-050 | managed bundle not independently runnable | installed-runner reproduction | FAIL |
| FR-051–FR-052 | exact tarball inventory; deferred runtime absent | `npm pack --dry-run`; audit | PASS |
| FR-053–FR-056 | incomplete comparison contract | report/evaluator inspection | FAIL |
| FR-057 | metric namespaces separated | benchmark tests | PASS |
| FR-058–FR-059 | incomplete resources; unsafe promotion | pathological promotion reproduction | FAIL |
| FR-060 | SDEBench explicitly unavailable | fixture report | PASS |
| FR-061–FR-063 | missing token/escalation/compaction evaluation | report schema inspection | FAIL |
| SC-001–SC-002 | ledger lineage and offline core | focused/full tests | PASS |
| SC-003 | exact registry but context exceeds bound | direct 297/100 reproduction | FAIL |
| SC-004 | immediate recall and projection metadata | focused tests | PASS |
| SC-005–SC-006 | tarball assets but installed/native lifecycle broken | installed-runner and smoke inspection | FAIL |
| SC-007 | no deferred startup dependency | tarball/runtime audit | PASS |
| SC-008 | asserted zero-use fields; single-sample p95 | fixture inspection | FAIL |
| SC-009 | root-only automatic capture | lifecycle tests | PASS |
| SC-010 | no projection rebuild/hash equivalence | projection inspection | FAIL |
| SC-011–SC-012 | source-safe import; explicit unavailable lanes | importer and fixture command | PASS |
| SC-013 `[outcome]` | `R-SC013-EXTERNAL`: no full-source quality baseline | N/A | RISK |
| SC-014 `[outcome]` | `R-SC014-GATE`: evaluator falsely promotes pathological candidates | direct reproduction | RISK |

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| O1-F001 | Critical | Correctness | Three memories under `budgetChars: 100` returned 297 chars; checkpoint recovery returned no evidence | T055 |
| O1-F002 | Critical | Completeness | No projection source mapping, rebuild, retryable job/checkpoint, or hash equivalence | T056 |
| O1-F003 | Critical | Correctness | Installed Codex runner resolved `%TEMP%\\dist\\index.js`; native payload translation/recovery delivery absent; stale plugin references remain | T057 |
| O1-F004 | High | Completeness | Importer report lacks versioned disposition/error semantics | T058 |
| O1-F005 | Critical | Correctness | Different-corpus, zero-quality, resource-regressing candidate was promoted | T059 |

## Executed verification

- PASS: frozen install, build, 17 files/45 tests, integration 6 files/17 tests, inventory verification, implemented smoke, prepublish, fixture benchmark, dry-run tarball, `git diff --check`, and structural ready validation.
- FAIL: direct bounded-context, compaction-recovery, managed-installed Codex runner, and pathological promotion reproductions.

## Residual risks

- SC-013: `R-SC013-EXTERNAL` — external datasets and full-source answer/hidden-test baselines are unavailable, so the outcome is unobserved.
- SC-014: `R-SC014-GATE` — no optional lane is enabled, but the evaluator is currently unsafe.
- `R-HOST-001` — no real OpenCode/Codex/Claude binary or model-consumption evidence exists; after fixture repair this remains an explicit host-native residual risk.

---

## Verification round 2

**Reviewer**: fresh Oracle (`oracle_sqlite_core_final_verify_round2`)<br>
**Independent from implementer**: Yes<br>
**Verdict**: FAIL

### Review dimensions

- **Completeness**: FAIL — the mem_context measurement/correlation envelope and benchmark fallback/error/payload evidence remain incomplete.
- **Correctness**: FAIL — a comparable candidate with improved MRR but regressed answer and hidden-test outcomes is still promoted.
- **Coherence**: FAIL — convergence behavior mostly matches the product contracts, but the latest tasks initially failed Full ready validation.

### Compliance delta from round 1

| Requirement | Executed evidence | Result |
| --- | --- | --- |
| FR-006, FR-026–FR-027, SC-010 | Interrupted projection rebuild resumed; delete/rebuild preserved watermark and projection hash; authoritative hash unchanged | PASS |
| FR-009–FR-010 | Direct successful and failed CLI import reports with unchanged sources and no failed target | PASS |
| FR-015 | Quoted phrase returned only the adjacent match | PASS |
| FR-020, FR-023 | Direct context returned 99/100 chars and checkpoint recovery included its source | PASS |
| FR-021–FR-022 | mem_context omitted source/evidence/full/token-basis/source-ID/correlation/escalation fields | FAIL |
| FR-034, FR-039–FR-043, FR-050, SC-005–SC-006 | Copied installed OpenCode, Codex, and Claude Code bundles passed full native-shaped lifecycle fixtures | PASS |
| FR-053–FR-055, FR-057, FR-060, FR-062–FR-063 | Same-condition checks, metric namespaces, progressive and compaction fixture sections | PASS |
| FR-056, FR-058, FR-061 | Missing fallback-state, operational-error, and source/evidence-payload benchmark evidence | FAIL |
| FR-059 | MRR gain with answer and hidden-test regressions promoted | FAIL |
| SC-001–SC-012 except the mapped failures above | Focused 12-file/38-test reproduction plus full gates | PASS |
| SC-013 `[outcome]` | `R-SC013-EXTERNAL`: external baseline unavailable | RISK |
| SC-014 `[outcome]` | `R-SC014-GATE`: evaluator still unsafe | RISK |

### Round 2 findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| O2-F001 | High | Completeness | mem_context measurement/source/correlation envelope incomplete | T060 |
| O2-F002 | Critical | Correctness | answer/hidden-test regression candidate promoted; fallback/error/payload evidence absent | T061 |
| O2-F003 | High | Coherence | T055–T059 initially violated task format/sequence validation | T062 |

### Executed verification

- PASS: frozen install; focused 12 files/38 tests; build; full 18 files/57 tests; integration 6 files/20 tests; inventory; three-host smoke; prepublish; fixture benchmark; 30-file tarball; retired-reference audit; diff check.
- PASS: direct budget/phrase/recovery, projection, importer reproductions.
- FAIL: direct promotion regression reproduction and the initial Full ready validator.

### Residual risks

- `R-SC013-EXTERNAL` — external outcome and full-source baseline remain unobserved.
- `R-SC014-GATE` — no optional lane is enabled, but promotion remains unsafe until T061.
- `R-HOST-001` — real host binary invocation and model consumption remain outside the disposable fixture evidence.

---

## Verification round 3

**Reviewer**: fresh Oracle (`oracle_sqlite_core_final_verify_round3`)<br>
**Independent from implementer**: Yes<br>
**Verdict**: FAIL

### Review dimensions

- **Completeness**: FAIL — tracked legacy plugin and Skill mirrors survive the atomic retirement boundary.
- **Correctness**: FAIL — same-correlation telemetry grants avoided-fetch credit before a later full fetch reconciles the answer path.
- **Coherence**: FAIL — the packed product is clean, but repository guidance still contains retired v1 graph, lifecycle, semantic, and deduplication behavior.

### Compliance delta from round 2

| Contract | Executed evidence | Result |
| --- | --- | --- |
| FR-001–FR-021 | Focused, unit, full, integration, package, importer, projection, and benchmark checks | PASS |
| FR-022 | Context reported avoided_full_fetches one, then same-correlation mem_get reported full_fetches one without reconciliation | FAIL |
| FR-023–FR-063 | Focused and broad gates, fallback controls, fail-closed evaluator, native lifecycle and importer reproductions | PASS |
| SC-001–SC-012 | Full verification set | PASS |
| SC-013 `[outcome]` | `R-SC013-EXTERNAL`: external full-source baseline unavailable | RISK |
| SC-014 `[outcome]` | Pathological promotion cases reject; lexical-only remains default | PASS |
| Cutover and retirement | Five tracked legacy plugin/Skill files survive and teach removed behavior | FAIL |

### Round 3 findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| O3-F001 | High | Correctness | Premature avoided-fetch credit survives same-correlation escalation | T063 |
| O3-F002 | High | Completeness and coherence | Legacy plugin and Skill mirrors remain tracked outside canonical inventory | T064–T065 |

### Executed verification

- PASS: WebStorm/CodeGraph inspection; O2 envelope and evaluator reproductions; focused 6 files/23 tests; unit 12/39; full 18/59; integration 6/20; frozen install; build; inventory; packed three-host smoke; prepublish; benchmark fixture; 30-file tarball; diff check; Full ready.
- FAIL: direct same-correlation avoided-fetch reconciliation and repository-wide retirement audit.

### Residual risks

- `R-SC013-EXTERNAL` — the 75% token-reduction outcome remains unobserved.
- `R-HOST-001` — real host binaries and model consumption remain outside disposable verification.

---

## Verification round 5 — final

**Reviewer**: fresh Oracle (`oracle_sqlite_core_final_verify_round5`)<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

### Review dimensions

- **Completeness**: PASS — every accepted FR and buildable SC has current implementation and executed evidence.
- **Correctness**: PASS — projection completion is atomic and restart-healing; all prior direct failure reproductions pass.
- **Coherence**: PASS — code, tests, package, integrations, docs, CI, benchmark contracts, and Full ready artifacts agree on the SQLite-first v2 boundary.

### Final compliance matrix

| Requirement | Implementation and executed evidence | Result |
| --- | --- | --- |
| FR-001–FR-010 | SQLite ledger, immutable evidence, temporal lineage, identity, clean-v2 migrations, source-safe importer; focused/full/importer checks | PASS |
| FR-011–FR-023 | Lexical/phrase retrieval, bounded progressive context, current/history ranking, measurements, correlation/escalation, compaction recovery; focused/full checks | PASS |
| FR-024–FR-030 | Non-blocking optional projections, mappings, jobs, atomic finalize/restart healing, watermark truth; six drift cases and two rollback injections | PASS |
| FR-031–FR-038 | Exact six MCP tools, lane truth, shared core, graph actions removed; registry/integration/runtime audit | PASS |
| FR-039–FR-052 | Three installed native-shaped lifecycle bundles, Skills, setup receipts, exact tarball, deferred surfaces removed; inventory/smoke/pack audits | PASS |
| FR-053–FR-063 | Equal-condition metrics, fail-closed primary/resource/provenance gates, fallback controls, progressive/compaction telemetry, explicit unavailable lanes; evaluator/fixture checks | PASS |
| SC-001–SC-004 | Ledger lineage, offline core, exact bounded registry, immediate recall | PASS |
| SC-005–SC-007 | Packed three-host assets/lifecycle and no deferred runtime | PASS |
| SC-008–SC-012 | Measured fixture resources, root-only capture, projection rebuild, importer safety, complete unavailable-lane reporting | PASS |
| SC-013 `[outcome]` | `R-SC013-EXTERNAL`: required external full-source quality baseline unavailable | RISK |
| SC-014 `[outcome]` | Incomparable reports become incomplete; retrieval, answer, agent, provenance, and resource regressions reject; lexical-only remains default | PASS |
| Cutover/package/docs/CI | 121 retired paths absent, 30-entry tarball, docs/config/workflows aligned | PASS |

### Executed verification

- Full ready validator: PASS.
- Projection focus: 1 file/6 tests; direct six drift heal cases and two atomic rollback/restart cases: PASS.
- Frozen install and build: PASS.
- Unit: 12 files/41 tests; full: 18 files/61 tests; integration: 6 files/20 tests: PASS.
- O1–O3 focus: 5 files/21 tests; importer: 2 files/7 tests; benchmark/evaluator: 2 files/7 tests; package/setup: 3 files/9 tests: PASS.
- Inventory, packed OpenCode/Codex/Claude lifecycle smoke, prepublish, fixture benchmark, 30-entry dry-run tarball, retired/secret/unmerged audits, and diff check: PASS.

### Residual risks

- `R-SC013-EXTERNAL` — the 75% injected-token reduction with no more than five-point quality loss remains unobserved until licensed external datasets/runners are available.
- `R-HOST-001` — disposable native-shaped bundles pass, but real host binaries and model-consumption evidence remain unobserved.
- Node `DEP0190`, CRLF conversion, and canonical overlap-review warnings are non-blocking.

---

## Verification round 4

**Reviewer**: fresh Oracle (`oracle_sqlite_core_final_verify_round4`)<br>
**Independent from implementer**: Yes<br>
**Verdict**: FAIL

### Review dimensions

- **Completeness**: PASS except the projection crash-window contract.
- **Correctness**: FAIL — projection job readiness and published registry readiness can diverge across restart.
- **Coherence**: FAIL — a retry can report duplicate ready while effective state remains rebuilding.

### Compliance delta from round 3

| Contract | Executed evidence | Result |
| --- | --- | --- |
| FR-001–FR-025, FR-028–FR-029, FR-031–FR-063 | Focused and broad independent verification | PASS |
| FR-026–FR-027, FR-030 | On-disk crash-window retry returned ready/duplicate while effective projection state remained rebuilding | FAIL |
| SC-001–SC-012, SC-014 | Full independent verification | PASS |
| SC-013 `[outcome]` | `R-SC013-EXTERNAL`: external baseline unavailable | RISK |
| Cutover and retirement | O3 telemetry and legacy-mirror reproductions plus active audit | PASS |

### Round 4 finding

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| O4-F001 | High | Correctness and coherence | Job readiness and registry readiness persist separately; retry does not heal non-ready registry | T066 |

### Executed verification

- PASS: Full ready; frozen install; build; O3 focus; packaging; unit 12/39; full 18/59; integration 6/20; importer; inventory; three-host smoke; prepublish; benchmark; promotion reproduction; 30-entry tarball; retirement audit; diff check.
- FAIL: direct on-disk projection finalization crash-window reproduction.

### Residual risks

- `R-SC013-EXTERNAL` — the 75% token-reduction outcome remains unobserved.
- `R-HOST-001` — real host binaries and model consumption remain outside disposable verification.

