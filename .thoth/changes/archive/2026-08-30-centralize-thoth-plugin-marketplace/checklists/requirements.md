# Requirements checklist: Central Thoth plugin marketplace

**Activation reason**: Cross-repository release publication is non-atomic, the change migrates real native-manager identities, and a catalog error could make both plugins unavailable. These are high contract and failure risks even though no memory data migrates.

## Initial validation

- [x] CHK001 [Completeness] Do US1-US4 cover the agent, operator, and maintainer actors; fresh install, release, retry, conflict, concurrency, and legacy-state flows; and all three repository boundaries? Evidence: `spec.md` user stories, edge cases, dependencies, and out-of-scope sections.
- [x] CHK002 [Clarity] Does every FR name one normative outcome with exact marketplace identity, remote provenance, plugin IDs, version/tag ordering, and ownership boundary? Evidence: FR-001 through FR-007 use one observable MUST interpretation each.
- [x] CHK003 [Consistency] SUPERSEDED by C001/CHK013: the original stories, requirements, criteria, assumptions, and non-goals consistently required manual legacy cleanup, but the user clarified that each product CLI must clean its own Codex state.
- [x] CHK004 [Measurability] Does every buildable criterion have deterministic descriptor, setup, inventory, or release-test evidence, and does every outcome criterion name an observable remote or host result? Evidence: SC-001 through SC-006 and plan requirement mapping.
- [x] CHK005 [Coverage] Are US1, US2, US3, US4; FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007; and SC-001, SC-002, SC-003, SC-004, SC-005, SC-006 each mapped to at least one design or verification seam together with every edge failure and repository constraint? Evidence: `plan.md` requirement mapping, risks, and migration sections contain every identifier explicitly.

## Domain lenses

- [x] CHK006 [Migration] SUPERSEDED by C001/CHK014: the original blanket prohibition on automatic deletion contradicted the clarified product-owned cleanup requirement.
- [x] CHK007 [Publication] Do requirements define tag-before-catalog ordering, target-only changes, validation, retry after partial completion, and non-fast-forward handling without pretending cross-repository atomicity? Evidence: US3, edge cases, FR-003, FR-007, SC-004, and research release-ordering decision.
- [x] CHK008 [Security] Do requirements avoid new stored secrets, reject conflicting provenance, pin immutable refs, and prohibit force-push or remote code selection from moving branches? Evidence: FR-001, FR-004, FR-007, assumptions, and out-of-scope.

## Revalidation

- [x] CHK009 [Clarity] Does the repaired FR-001 define one explicit unforced Codex `0.151.x` policy while retaining capability-gated failure/force behavior for other versions? Evidence: US2 scenario 4, FR-001, SC-003, assumptions, and plan mapping agree.
- [x] CHK010 [Completeness] Does the repaired plan create the central runtime/package-manager scaffold and exact commands before any test or validation task invokes them? Evidence: plan Technical context and Central registry sections plus T001-T004.
- [x] CHK011 [Migration] SUPERSEDED by C001/CHK015: the original closeout required legacy manifest equality; converged closeout instead requires owned absence plus sibling/unrelated control equality.
- [x] CHK012 [Coverage] SUPERSEDED by C001/CHK017: T001-T029 covered the preservation contract; T030-T039 cover the clarified cleanup contract.

## Convergence revalidation

- [x] CHK013 [Consistency] Do US4, FR-001, FR-005, FR-006, SC-002, SC-006, assumptions, and out-of-scope consistently require both product Codex CLIs to clean only their own legacy state while retaining Claude, sibling-product, and unrelated state? Evidence: converged `spec.md` and `plan.md` use the same ownership boundary.
- [x] CHK014 [Safety] Does cleanup occur only after central verification and only for known IDs or fixed non-symlink descendants of resolved `CODEX_HOME`, while conflicting provenance and unsafe paths fail closed? Evidence: FR-001, FR-005, FR-006, plan requirement mapping, migration, and unsafe-path risk.
- [x] CHK015 [Recovery] Does a cleanup failure retain the verified central installation, report bounded close-Codex-and-retry guidance, and converge idempotently without restoring obsolete bytes? Evidence: US4 scenario 3, FR-006, plan migration/rollback, and T031-T034.
- [x] CHK016 [Portability] Does the contract avoid claiming a portable race-free process detector while making stopped Codex an explicit precondition and filesystem-lock failure observable? Evidence: FR-006, assumptions, out-of-scope, and plan Codex-running risk.
- [x] CHK017 [Coverage] Are the contradicted finding, both public TDD seams, documentation, broad verification, real-host cleanup, final Oracle, and archive represented without renumbering prior work? Evidence: tasks C001 and T030-T039.
- [x] CHK018 [Safety] Are both products' exact legacy plugin IDs, marketplace names/provenance, cache roots, snapshot roots, preflight signatures, and plugin-before-marketplace-before-orphan removal order enumerated rather than left to implementation inference? Evidence: `spec.md` immutable target sets and `plan.md` immutable cleanup registry/order.

## Convergence 2 revalidation

- [x] CHK019 [Consistency] Do US2, FR-001, SC-003, assumptions, and the plan agree that only thoth-mem's implicit Windows Codex lookup uses the operator-visible command-shell contract while explicit overrides and non-Windows execution remain direct? Evidence: C002 amendments use the same bounded distinction throughout `spec.md` and `plan.md`.
- [x] CHK020 [Security] Does the Windows resolver keep Node shell execution disabled, pass a fixed manager argument vector, avoid installation enumeration or version selection, and retain the existing version/capability inspection as the trust boundary? Evidence: FR-001 and the plan's Windows native-manager invocation section.
- [x] CHK021 [Coverage] Are artifact approval, failing tests, minimal implementation, simplify/documentation, a real read-only dry run, stopped-host migration, final Oracle verification, and archive ordered without weakening C001 cleanup safety? Evidence: tasks C002 and T040-T044 feed T037-T039.
