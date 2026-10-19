# Verification Report: Camera-bound Project Nebula Contours

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Round 1 — independent Oracle FAIL

Oracle confirmed the data-derived project grouping, opaque ownership, real-source-only contours, project/core action separation, global Universe and Community preservation, and fallback behavior. All four captures show organic project contours without the former phantom center disk, and desktop/mobile labels remain contour-adjacent.

One blocking publication defect remains:

- **FIT-001 — Critical**: Fit/readiness publication is non-atomic. `fitAll()` schedules overlay publication asynchronously while `settleFinalFit()` can expose settled state first; `MapCanvas` considers region screen state ready from source completeness without proving the current camera/Fit epoch and required bounds have committed. In two of three fresh 6,000-memory entries, six contours were up to 105 px outside and two labels were outside while both `data-final-fit-settled` and `data-region-screen-ready` were already `true`; the next overlay frame corrected them. A fresh desktop-to-200% sequence exposed 13–19 contours outside until Fit ran after the visual viewport settled. The supplied 200% capture also places a project label across the status overlay.

Round 1 is not approval to archive.

## Round 1 historical review dimensions

- **Completeness**: FAIL — the accepted initial/explicit-Fit atomic frame is not yet represented by a persistent mounted regression.
- **Correctness**: FAIL — stable geometry is correct, but readiness can expose the preceding camera projection.
- **Coherence**: FAIL — T010/T011 claim generation-atomic Fit publication while runtime readiness and browser assertions do not enforce the same epoch.

## Round 1 historical compliance

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | Organic real-source contours and anchored labels; 200% capture collision remains | Focused 43-test suite plus evidence inspection | RISK |
| FR-002 | Runtime fit/publish path and responsive bounds | Oracle atomic first-entry and 200% probes | FAIL |
| FR-003 | Camera-derived runtime region points | Oracle atomic first-entry and 200% probes | FAIL |
| FR-004 | Contour/label, core, DOM, Enter, and Space actions | `pnpm exec vitest run tests/dashboard/graph-accessibility.test.ts` | PASS |
| FR-005 | Opaque finite owner sources, generation guards, global/Community preservation | Focused 43-test suite | PASS |
| SC-001 | Region/source/label diagnostics and suppressed-label DOM naming | Focused 43-test suite | PASS |
| SC-002 | Multi-core and single-core containment with zero foreign-core capture | Oracle custom read-only real-browser probes | PASS |
| SC-003 | Fit and camera publication | Oracle atomic first-entry reproduction | FAIL |
| SC-004 | Pointer and keyboard destination parity | `pnpm exec vitest run tests/dashboard/graph-accessibility.test.ts` | PASS |
| SC-005 | Responsive, 200%, and visual evidence | Oracle direct desktop-to-200% probe and evidence inspection | FAIL |
| SC-006 | Regression and type contracts | Focused/full supplementary suites and typechecks | RISK |

## Executed verification

- `pnpm exec vitest run tests/dashboard/cosmos-graph.test.ts tests/dashboard/semantic-region-overlay.test.ts tests/dashboard/semantic-atlas-browser.test.ts tests/dashboard/graph-accessibility.test.ts` — PASS, 43/43.
- `pnpm exec vitest run tests/dashboard/full-atlas-browser.test.ts tests/dashboard/neural-atlas-browser.test.ts` — PASS, 7/7.
- `pnpm exec vitest run tests/dashboard/semantic-atlas-browser.test.ts -t "renders a project-first 6,000-memory Universe"` — PASS, 1/1.
- `pnpm run dashboard:typecheck` — PASS.
- `pnpm exec tsc --noEmit` — PASS.
- `git diff --check` on implementation anchors — PASS except line-ending warnings; no generated output, dependencies, environment secrets, or secret-like status entries.

## Round 1 historical findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| FIT-001 | Critical | Correctness / coherence | Settled and ready flags coexist with stale or out-of-host overlays in repeated first-entry and 200% probes | `CosmosGraphRuntime.requestOverlayLayout()`, `fitAll()`, `settleFinalFit()`; `MapCanvas.tsx` `regionScreenReady`; mounted browser regressions |

## Residual risks

- SC-001: The 200% status-overlay collision must be re-inspected after atomic publication converges.
- SC-006: Existing suites pass but do not detect the transient camera/overlay publication mismatch.

## Round 1 — writer convergence evidence

The writer reproduced `FIT-001` with a mounted mutation observer before changing production code: one fresh 6,000-memory entry exposed two invalid public states containing 8 contours/3 labels and then 6 contours/2 labels outside while both settled and ready were true.

The correction now:

- assigns every Fit a monotonically increasing epoch and publishes settled state only after several fresh post-Fit overlay frames for that same epoch;
- requires `MapCanvas` project readiness to match runtime, final-Fit, and region-layout epochs and to prove real-source containment plus in-host contour/painted-label bounds;
- converts fixed interface occlusions from visual pixels into the SVG viewBox coordinate system, then places or suppresses labels without crossing the frontier summary, breadcrumbs, or map-health UI;
- keeps the renderer in loading state through GPU retry until a dataset is applied and runtime focus matches requested focus;
- persists the 181-project single-core ownership/fit regression, the repeated atomic-publication observer, direct 200% checks, and fixed-interface exclusion coverage.

Executed writer evidence after convergence:

- Focused graph-data, overlay, semantic browser, and accessibility suites — PASS, 44/44.
- Complete dashboard suite — PASS, 24 files and 166/166 tests.
- `pnpm run dashboard:typecheck` — PASS.
- `pnpm run build` — PASS for root TypeScript/esbuild and dashboard Vite production bundle.
- Updated 1440×900, 1024×768, 360×800, and 200% evidence captures — PASS on inspected project containment; the former 200% frontier collision is absent.

Round 1 convergence is submitted to a fresh independent Oracle below; the prior FAIL is not approval to archive.

## Round 2 — independent Oracle FAIL

Oracle confirmed that Round 1's first-entry defect is substantially corrected: three fresh 6,000-memory entries settled with matching Fit, final-Fit, and region epochs, and 24 real-source project regions had zero membership, containment, foreign-core, host, label, fixed-interface, or overlap failures. Focused read-only checks passed 42/42 with the two capture writers intentionally skipped; supplementary browser checks passed 7/7; dashboard and root TypeScript checks passed; evidence hashes did not change.

`FIT-001` remains open at the visual-viewport publication boundary. In all three fresh desktop-to-200% transitions, the old epoch stayed publicly `data-final-fit-settled=true` and `data-region-screen-ready=true` after the 200% CSS layout activated but before the next Fit epoch began. A painted label for `browser-project-001 · 148` occupied `(352.83,159.90)-(460.91,166.89)` while the frontier strip occupied `(22,116)-(482,169)`. Epoch 3 later settled clean without manual repair, but the transient epoch-2 collision violates atomic readiness.

The blocking cause is that `NeuralAtlasWorkspace` publishes visual scale and responsive CSS before `MapCanvas` has a visual-viewport/exclusion generation with which to invalidate its still internally consistent old Fit epoch. The mounted regression observes out-of-host contour/label geometry but does not reject fixed-interface collisions throughout the direct scale transition, and it subsequently invokes Fit before capturing evidence.

Round 2 compliance: FR-004, FR-005, SC-001, SC-002, and SC-004 pass. FR-001, FR-002, FR-003, SC-003, SC-005, and SC-006 fail on the reproduced transient publication window. The required convergence is to synchronously invalidate public ready/settled state before responsive visual-viewport CSS takes effect, carry that generation into accepted region geometry, and extend the mounted observer through direct 200% settlement without manual Fit.

Round 2 is not approval to archive.

## Round 2 — writer convergence evidence

The mounted regression was first moved to the causal sequence—fresh initial project Universe directly to 200%, before any explicit Fit, zoom, pan, or responsive viewport loop—and extended to observe painted-label intersections with fixed UI. It failed before production changes with exactly two public-ready samples containing `uiCollisions: 1`, matching Oracle's reproduction.

The correction now publishes a monotonically increasing visual-viewport generation before any responsive workspace variables or scale selectors mutate. `MapCanvas` synchronously invalidates the active project Fit publication at that pre-change boundary, refits after the post-mutation boundary, stamps accepted region geometry with the active visual generation, and requires workspace, shell, region, Fit, and final-Fit generations to agree before exposing ready/settled. Identical visual viewport observations do not create a new generation, and non-project levels keep their prior resize behavior.

Executed writer evidence after Round 2 convergence:

- The exact fresh-entry direct-to-200% mounted case — PASS in three consecutive isolated runs without manual Fit.
- Focused graph-data, overlay, semantic browser, and accessibility suites — PASS, 44/44.
- Complete dashboard suite — PASS, 24 files and 166/166 tests.
- `pnpm run dashboard:typecheck` — PASS.
- `pnpm run build` — PASS for root TypeScript/esbuild and the dashboard Vite production bundle.
- Refreshed 200% capture — PASS on writer inspection; it was produced after direct automatic settlement and contains no project-label intersection with the frontier summary, breadcrumbs, or map-health strip.

Round 2 convergence is submitted to a fresh independent Oracle below; both prior FAIL verdicts remain non-approval until that verifier passes every canonical requirement.

## Round 3 — independent Oracle FAIL

Oracle confirmed that the Round 2 direct desktop-to-200% boundary is now clean in three of three fresh runs: readiness is invalidated before responsive CSS, the automatic final state requires no manual Fit, Fit/final/region epochs settle at `5/5/5`, visual generations settle at `2/2/2`, and all geometry remains framed without fixed-interface collisions.

One deterministic initial-subscription variant of `FIT-001` remains. In three of three cold 6,000-memory entries, public ready/settled state appeared with Fit/final/region epochs `2/2/2` but workspace/shell/region visual generations `1/0/0`. All 24 contours and 12 labels were otherwise correctly framed and owned; the generation mismatch was the sole strict-observer violation.

The cause is that a late-mounted `MapCanvas` initializes generation zero after the workspace has already published its initial generation-one boundary. Its event subscription cannot replay the missed event, so internally matching shell/region zero values can pass readiness without matching the enclosing workspace. Round 3 therefore passes FR-001, FR-002, FR-004, SC-001, SC-002, SC-004, and SC-005, but fails FR-003, FR-005, SC-003, and SC-006. The required correction is a mounted initial-parity regression and a readiness gate that synchronizes from the nearest workspace before the first accepted region publication.

Round 3 is not approval to archive.

## Round 3 — writer convergence evidence

The mounted contract was first extended to compare workspace, shell, and region visual generations at the initial ready boundary and in every later ready/settled observer sample. Before production changes it failed deterministically with `[1,0,0]`, matching Oracle's three-run reproduction.

`MapCanvas` now performs a pre-runtime layout synchronization from its nearest mounted Neural Atlas workspace and blocks project Fit readiness until that synchronization completes. The event subscription also rechecks the mounted workspace generation so a late mount cannot depend on replaying an already published initial event. Runtime region callbacks consequently stamp the synchronized generation from their first accepted publication, while the already verified pre/post viewport event path remains unchanged.

Executed writer evidence after Round 3 convergence:

- Combined cold initial-entry and direct automatic 200% contract — PASS in three consecutive isolated runs.
- Focused graph-data, overlay, semantic browser, and accessibility suites — PASS, 44/44.
- Complete dashboard suite — PASS, 24 files and 166/166 tests.
- `pnpm run dashboard:typecheck` — PASS.
- `pnpm run build` — PASS for root TypeScript/esbuild and dashboard Vite.
- Fresh IDE diagnostics for `MapCanvas.tsx` — PASS with zero errors.

Round 3 convergence is submitted to a fresh independent Oracle below; every previous FAIL remains non-approval until that verifier passes the complete contract.

## Round 4 — independent Oracle PASS

Oracle independently closed `FIT-001` and approved the complete canonical contract. A pre-document observer covered three cold 6,000-memory entries before navigation scripts. Every first accepted frame had workspace/shell/region visual generations `1/1/1`, Fit/final/region epochs `2/2/2`, 24 current project contours, 72 exact owned sources, and zero ownership, containment, foreign-source, stale-ID, host, fixed-interface, label-overlap, decorative-field, or boxed-core-label violations.

Each fresh entry then transitioned directly to 200% before any explicit Fit, zoom, or pan. Ready and settled were false before the first responsive CSS write, and all three runs automatically settled without manual repair at visual generations `2/2/2` and Fit/final/region epochs `5/5/5`. An unchanged viewport observation advanced neither generation nor Fit. The fixture directory remained exactly 41 projects and 6,000 memories, including one Unassigned project with 100 memories.

## Review dimensions

- **Completeness**: PASS — every FR and buildable SC has direct independent evidence, including cold initial publication, direct 200% settlement, geometry, ownership, interaction, responsive, fallback, replacement, and cleanup behavior.
- **Correctness**: PASS — strict pre-document observation found zero stale or mismatched accepted publications in three cold entries and three direct scale transitions; all visual, Fit, and region generations remained coherent.
- **Coherence**: PASS — implementation, mounted regression, diagnostics, visual evidence, and public readiness semantics enforce the same project-nebula ownership and atomic camera contract.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | Organic real-source contours, anchored/suppressed labels, synchronized DOM names, and no decorative substitute | Strict browser probe, focused overlay tests, and four capture inspection | PASS |
| FR-002 | Opaque owned-source grouping with bounded dense, sparse, collinear, and single-core envelopes | Exact-ID ownership probe and pure geometry suites | PASS |
| FR-003 | Shared visual/Fit/region generation gates across initial entry, camera changes, replacement, and responsive settlement | Three cold pre-document probes plus pan, zoom, Fit, motion, and replacement checks | PASS |
| FR-004 | Separate project boundary/label and Constellation core action paths | Pointer, DOM, Enter, Space, navigator, and accessibility browser checks | PASS |
| FR-005 | Current finite sources, deterministic diagnostics, generation guards, and preserved global/Community behavior | Strict source/stale-ID probe and global/Community regression suites | PASS |
| SC-001 | One non-empty-source contour per current project with complete navigator naming | 24-project mounted fixture and DOM diagnostics | PASS |
| SC-002 | Exact membership, own-core containment, and zero foreign-source capture | 72-source exact-ID probe plus sparse/single/collinear cases | PASS |
| SC-003 | Camera and Fit publication remain generation-coherent from first accepted frame through scale settlement | Three initial `1/1/1` and direct-200% `2/2/2` generation probes | PASS |
| SC-004 | Project and Constellation destinations remain distinct with zero cross-action activation | Pointer and keyboard action matrix | PASS |
| SC-005 | Responsive envelopes and labels remain readable and collision-managed without a generic disk | Desktop, tablet, mobile, 200%, coarse pointer, reduced-motion evidence | PASS |
| SC-006 | Renderer, navigation, fallback/retry, replacement, cleanup, and type contracts remain green | Focused 42/42, supplementary 7/7, writer full 166/166, typechecks and build | PASS |

## Findings

- **FIT-001 — Critical — RESOLVED**: post-Fit overlay settlement, responsive CSS publication, and late-mount initial generation synchronization now share one accepted visual/Fit/region generation contract. Independent Round 4 observation found zero violations in three cold entries and three direct 200% transitions.

### Independent executed evidence

- Strict pre-document cold-entry plus direct automatic 200% probe — PASS, three of three runs.
- Focused four-file suite excluding two capture writers — PASS, 42/42 with 2 intentionally skipped.
- Supplementary full/neural browser suites — PASS, 7/7.
- `pnpm run dashboard:typecheck` — PASS.
- `pnpm exec tsc --noEmit` — PASS.
- Five relevant IDE diagnostics — PASS with zero errors.
- Accelerated `ready` validator — PASS with no warnings.
- Evidence hash and visual inspection — PASS; all four hashes remained unchanged and the 200% capture has no fixed-interface collision.
- Scoped `git diff --check` and leakage audit — PASS apart from line-ending notices; no generated, dependency, environment, credential, or secret path was introduced.

### Final findings and residual warnings

- Findings: none. `FIT-001` is resolved.
- Residual warning: the independent read-only round did not rerun the write-producing production build or the two capture writers; the root writer's passing build, complete 166/166 dashboard suite, and refreshed capture evidence remain recorded above. The broad pre-existing concurrent worktree must be preserved during archive.

Round 4 authorizes closeout and archive.
