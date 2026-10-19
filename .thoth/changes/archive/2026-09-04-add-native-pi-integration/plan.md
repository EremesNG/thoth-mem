# Implementation Plan: Native Pi Integration

## Technical context

thoth-mem currently ships a native OpenCode entry plus Codex and Claude Code
plugin assets, while `src/memory-core/service.ts` and `src/tools/index.ts` own the
single lifecycle and six-tool behavior. Pi `0.84.4` is installed locally and its
documented package/extension surface can load one package-declared extension and
Skill, register native tools, identify the current session/project, transform
model context, and observe compaction and shutdown.

The new Pi adapter will remain thin. One long-lived MCP stdio client will launch
the package-relative `dist/index.js`, execute all six tools, and submit lifecycle
operations through the existing `mem_session` handler. Pi will never import the
SQLite service. Its native context hook will only inject a shared-validator-
approved recovery block. Setup will be a dedicated manager adapter because Pi's
npm/local source model and plain-text inspection differ from Codex/Claude's
marketplace manager.

Adding `pi` to the harness taxonomy requires schema revision 10 because
`sessions.harness` is constrained by the revision-9 allowlist. The migration
will create a verified pre-v10 backup, rebuild only the sessions table while
preserving its dependent relations, restore foreign-key enforcement, and prove
logical equivalence before recording the revision. Public and local Pi smoke
will use disposable `PI_CODING_AGENT_DIR`, runtime data, npm cache, and session
directories. The public-source smoke will resolve the exact candidate tarball
and its complete frozen runtime dependency closure from a loopback-only
npm-compatible registry fixture instead of the real registry, rejecting graph,
integrity, or non-loopback-request drift; the real user Pi installation will not
be modified.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The proposal keeps exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`; Pi registers native projections of those same six contracts and adds no MCP operation.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — Pi delegates to the existing local SQLite/FTS5 core and adds no model, network, vector, graph, reranker, or optional projection dependency.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Pi-specific events, session IDs, leaf IDs, context messages, and package commands remain in new adapter/setup modules; lifecycle and tool requests cross the existing host-neutral MCP contracts.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Pi reuses the existing tool results and continuation renderer, then validates the same 1,000-code-point host block without changing retrieval budgets or selection.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The change declares Pi as a new supported host, defines a clean managed installation, adds no compatibility aliases, and requires both receipt-owned setup rollback and a verified retained pre-v10 database backup.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Extend only the setup harness parser/help with `pi`; dispatch to a dedicated Pi manager while preserving the global-only scope and existing flags. | `src/cli.ts`, `src/setup/pi.ts`, `README.md` | `tests/setup/plugins.test.ts`, `tests/setup/pi.test.ts`, packed CLI help |
| FR-002 | Model Pi state as exact configured source plus resolved installed package path. Treat only receipt-owned prior sources as replaceable; fail closed on unowned/conflicting thoth-mem provenance. Before each external remove/install, persist its mutation intent and retained repair backup; after any success, nonzero result, throw, or interrupted restart, reconcile actual manager state before deciding whether to restore or continue. Once the desired package and receipt commit are independently verified, preserve unrelated records added later and never re-enter rollback because of their drift. | `src/setup/pi.ts`, `src/setup/transaction.ts` | Disposable unrelated-package, conflict, switch, mutate-then-nonzero/throw, hard interruption, exact-tree rollback, terminal post-commit drift, and recovery fixtures in `tests/setup/pi.test.ts` |
| FR-003 | Gate `0.84.x` on `--version` plus install/list/remove help fragments; allow another version only with `--force-version` and the same capabilities. Journal provider and manager mutation intent before execution, retain journal/backup evidence across uncertain outcomes, independently reconcile `pi list` and installed paths, validate regular `package.json#pi` assets plus isolated extension loadability, and remove recovery evidence only after exact prior-tree restoration or independently verified desired-state commit. A persisted `receipt-committed` phase is terminal: recovery revalidates only the owned desired package/resources and exact receipt, tolerates unrelated post-commit drift, never rolls back a valid commit for cleanup failure, and retains the journal without mutation when owned validity cannot be proven. | `src/setup/pi.ts`, `src/config/runtime.ts`, `src/cli.ts` | Plan hash/no-write, malformed output, missing capability, wrong package, mutate-then-nonzero/throw, interruption at each mutation window, failed rollback, retained recovery evidence, post-commit unrelated mutation, cleanup deletion failure, and idempotency cases |
| FR-004 | Add a Pi package manifest pointing at `dist/pi.js` and the Pi Skill. Generate its six tool registrations from the authoritative descriptions and Zod-derived JSON Schemas; do not depend on a community adapter. | `package.json`, `src/tools/index.ts`, `src/integration/pi/index.ts`, `integrations/pi/skills/thoth-mem/` | Registration parity with MCP `tools/list`; packed import proves no `better-sqlite3`/`MemoryService` graph in `dist/pi.js` |
| FR-005 | Own one reconnectable MCP SDK `Client`/`StdioClientTransport` per Pi extension runtime. Resolve `dist/index.js` relative to the extension, cap connect/call/output, share it between native tool calls and `mem_session`, translate successful content/details, throw bounded Pi errors for MCP `isError`, and close on teardown. | `src/integration/pi/mcp-client.ts`, `src/integration/pi/index.ts`, `src/index.ts` | Fake transport unit tests plus packed child smoke covering six tools, concurrent calls, abort/timeout, reconnect, invalid/oversized responses, and close |
| FR-006 | Register documented Pi hooks: start performs enroll+recover; root `interactive`/`rpc` input captures; pre-compact checkpoints without raw conversation content; compact guides; failed compact/settled never finalize; shutdown finalizes except hot reload and always closes the child. | `src/integration/pi/index.ts`, `src/integration/pi/lifecycle.ts`, `src/memory-core/contracts.ts` | Host-shaped event tests in `tests/integration/pi-native-plugin.test.ts` and shared lifecycle assertions |
| FR-007 | Resolve project identity from `ctx.cwd`; validate bounded `getSessionId()` and `getLeafId()` at the adapter. Treat only the native Pi session as root and never infer authority from community subprocess conventions or recalled data. | `src/integration/pi/lifecycle.ts`, `src/integration/project-identity.ts`, `integrations/pi/skills/thoth-mem/references/pi.md` | Git, linked-worktree, non-Git, malformed ID, mismatched returned identity, and explicitly degraded caller fixtures |
| FR-008 | Build Pi capture event keys from session ID, current leaf ID, input source/streaming behavior, and privacy-sanitized text. Reuse the core receipt idempotency and add `pi` to `HARNESS_VALUES` together with the FR-013 schema migration. | `src/integration/pi/lifecycle.ts`, `src/memory-core/contracts.ts`, `src/tools/index.ts` | Two distinct same-leaf prompts, identical retry, changed leaf, private-block, credential, and taxonomy tests |
| FR-009 | Extract OpenCode's identity-only and verified recovery checks into one host-neutral helper. Pi caches only the validated result and its `context` hook removes/replaces only `customType=thoth-mem-recovery`; raw Pi compaction summaries never enter lifecycle summary fields. | `src/integration/recovery.ts`, `src/integration/opencode/plugin.ts`, `src/integration/pi/index.ts` | Existing OpenCode regression suite plus Pi duplicate-context, identity mismatch, source leakage, cap, malformed block, compact success/failure fixtures |
| FR-010 | Catch every extension/bridge/lifecycle failure, emit bounded diagnostics through available Pi UI or stderr, and return control to Pi. A single MCP child serializes database bootstrap ownership for both tools and lifecycle. | `src/integration/pi/mcp-client.ts`, `src/integration/pi/index.ts`, `src/integration/recovery.ts` | Launch/exit/timeout/protocol/oversize/UI-diagnostic faults and simultaneous first tool/lifecycle calls against one fresh data directory |
| FR-011 | Expand the canonical inventory with `pi`, add only its Skill/reference assets, build `dist/pi.js`, and declare the package resources/keyword and required Pi/typebox peer contract. Synchronization copies the canonical Skill and observation guidance into the Pi bundle. | `package.json`, `scripts/build.mjs`, `scripts/sync-plugin-distribution.mjs`, `integrations/inventory.json`, `src/integration/package-inventory.ts`, `integrations/pi/` | `tests/packaging/first-product.test.ts`, `pnpm run integration:sync`, `pnpm run integration:verify`, tarball file assertions |
| FR-012 | Extend disposable verification to import the Pi entry, verify its thin dependency graph, run local setup twice, and run public setup against a loopback npm-compatible registry serving the exact candidate plus every exact runtime-transitive dependency materialized from the frozen installed graph. Load that installed candidate with Pi `0.84.4` under disposable environment roots, reject closure/integrity/non-loopback-request drift, assert source/version/asset/dependency hashes, enumerate six tools, and exercise start/input/context/compact/shutdown without real-home or real-registry dependence. | `scripts/verify-integration-package.mjs`, `scripts/verify-packed-plugins.mjs`, `tests/integration/public-marketplace-smoke.test.ts`, `docs/agent/testing.md` | `pnpm run integration:verify`, `pnpm run integration:smoke`, candidate/closure metadata and integrity rejection, package-request log contains loopback only, focused packed smoke on Windows/Linux, real installed-Pi disposable smoke |
| FR-013 | Advance to schema revision 10 and rebuild only `sessions` with the widened generated harness constraint. Freeze every historical schema fixture to the pre-Pi allowlist; create or reuse a retained pre-v10 backup; acquire an immediate write-excluding migration lock; recheck exact live-to-backup logical equivalence before mutation; reject valid-but-mismatched backup or drift; preserve exact sessions plus every dependent relation; restore foreign-key enforcement; validate integrity/logical baselines; and record revision 10 only inside the successful transaction. | `src/memory-core/contracts.ts`, `src/memory-core/sqlite/schema.ts`, `src/memory-core/sqlite/migrations.ts`, `tests/memory-core/schema-migration.test.ts`, `tests/memory-core/taxonomy-migration.test.ts`, `tests/memory-core/taxonomy.test.ts` | Frozen revision-9 fixture with sessions/evidence/events/summaries/receipts migrates, mismatched backup and drift fail before mutation, injected failure rolls back, exact backup validates, reopen is idempotent, and Pi lifecycle succeeds |

### Component and interface details

1. `src/tools/index.ts` will expose an immutable registration catalog containing
   each `MemoryToolName`, description, and JSON Schema generated from the same
   Zod registration schema already passed to MCP. `registerTools()` will consume
   that catalog, so MCP and Pi cannot silently diverge.
2. `src/integration/pi/mcp-client.ts` will expose a small injected-transport seam
   for deterministic tests and a production constructor that launches literal
   Node with the package-relative CLI. It will guard one in-flight connection
   promise, permit MCP's supported concurrent requests after connection, reset
   only its owned transport on failure, and never enumerate or terminate unrelated
   processes.
3. `src/integration/pi/lifecycle.ts` will convert only documented Pi fields into
   `mem_session` arguments. Event keys will use the existing SHA-256/privacy
   conventions. Pre-compaction will change lifecycle state without persisting Pi
   transcript/model/tool content; Pi's free-form compaction summary is deliberately
   ignored as unsupported provenance.
4. `src/integration/recovery.ts` will retain the current OpenCode validation
   behavior byte-for-byte in semantics and parameterize only the host/session/
   directory inputs needed by Pi. Pi context replacement will identify its own
   message by `customType`, not by scanning or rewriting arbitrary user/model text.
5. `src/setup/pi.ts` will use a synchronous injectable executor like the existing
   setup managers. Its schema-versioned journal records the desired source,
   receipt-owned prior source and package-tree backup, provider pre-state, and a
   durable intent phase before each external remove/install mutation. Because an
   external command may mutate and then return nonzero, throw, or be interrupted,
   recovery will inspect actual manager records and installed paths before deciding
   which owned action occurred; it will not infer completion from a post-command
   flag alone. Journal and backup evidence remain until recovery proves exact prior
   package-tree restoration or normal execution independently verifies and commits
   the desired state. A persisted `receipt-committed` phase is a terminal boundary:
   restart recovery revalidates the owned desired package, regular resources,
   loadability, and exact receipt without requiring the unrelated package inventory
   to remain frozen after commit. Unrelated drift and cleanup deletion failures
   cannot enter rollback; they are preserved, and inability to prove the owned
   commit retains the journal and fails without manager mutation. The receipt records public versus local provenance, exact
   source/version/path, provider state, Pi version, capabilities, and verification
   results.
6. `src/memory-core/sqlite/migrations.ts` will own one pre-v10 backup verifier
   and one revision-9-to-10 migration. After backup verification and before any
   mutation, an immediate transaction will acquire the write-excluding lock and
   compare the exact logical state of every live revision-9 table with the
   backup; a valid-but-mismatched backup or intervening source write aborts.
   The table swap will disable foreign-key enforcement only for the bounded
   outer migration window, restore it in a `finally` path, and require integrity,
   foreign-key, schema constraint, row, sequence, FTS, and dependent-relation
   equivalence before success. Current schema DDL in
   `src/memory-core/sqlite/schema.ts` will derive the widened check from current
   `HARNESS_VALUES`; every pre-v10 schema fixture will use a separately frozen
   pre-Pi allowlist.
7. Package verification will treat the Pi bundle as a separate native entry, not
   part of the Codex/Claude public marketplace distribution lock. The existing
   `plugin/` catalog remains unchanged; Pi consumes the npm package directly.
   During prepublication smoke, `scripts/verify-packed-plugins.mjs` will own a
   loopback-only npm-compatible registry fixture. Before starting it, the script
   will derive the complete runtime transitive graph from `pnpm-lock.yaml` and
   the installed dependency tree, require exact name/version agreement, pack the
   candidate and each dependency into scratch, and record content hashes. The
   fixture will serve only those packuments/tarballs, log every request, redirect
   only the child npm/Pi environment, assert no package request escaped loopback,
   compare `pi list` plus installed manifest/resource/dependency hashes with the
   staged ledger, and close the server and disposable roots in `finally`.

## Optional support artifacts

- `research.md`: Created because Pi's external package-manager, event, identity, compaction, and TypeBox contracts determine correctness and are version-sensitive.
- `data-model.md`: Created to make the revision-10 sessions-table rebuild, dependent foreign keys, backup, invariants, and rollback checks executable without inference.
- `contracts/`: Not needed; the existing MCP/lifecycle contracts remain canonical and the Pi-only mapping is fully specified in `research.md` and this plan.
- `quickstart.md`: Not needed; user-facing setup usage belongs in the existing README and CLI help.

## Risks and migrations

- Pi exposes plain-text rather than JSON package inventory. The parser will accept
  only the documented bounded section/source/path structure with colors disabled;
  ambiguous or malformed output fails before mutation.
- npm and local Pi sources have different identities and can coexist. Setup will
  replace only a prior source owned by a valid receipt; any unowned competing
  thoth-mem source is a provenance conflict, not implicit cleanup.
- An async MCP transport can fail during load or after a tool is registered. Tools
  and hooks remain registered, each call degrades independently, and the next call
  may establish a fresh owned transport.
- Hot reload emits shutdown/start events. `reason=reload` closes transport and
  preserves session state; other replacement/quit reasons finalize idempotently.
- Zod-to-JSON-Schema and TypeBox acceptance could drift. Registration parity and
  an actual Pi `0.84.4` disposable load are blocking verification, and the package
  pins the tested development version while declaring the documented peer surface.
- Rebuilding a referenced sessions table can retarget or invalidate dependent
  foreign keys if SQLite rename behavior is assumed implicitly. The migration
  uses an explicit enforcement-off table-swap window, restores enforcement in
  `finally`, validates every dependent relation and logical baseline before
  commit, and retains a verified revision-9 backup for recovery. The accepted
  backup must also match the exact live state inside the immediate migration
  lock; a valid foreign/stale backup or intervening writer aborts before mutation.
- Real package publication and mutation of the user's existing Pi home remain out
  of scope. The local installed binary is used only with redirected disposable
  agent/session/data roots. Public-source parity is tested through Pi's actual
  npm path against the candidate-and-closure-seeded loopback registry; registry
  protocol or dependency drift remains visible because Pi/npm must install and
  load that exact hermetic graph while the request log rejects external package
  resolution.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The design derives Pi registrations from the same six-tool catalog, verifies parity against MCP enumeration, and explicitly forbids a seventh public tool.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — One local Node MCP child remains the only Pi persistence/retrieval dependency; no optional or remote lane enters save, recall, setup, or smoke.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Pi payload normalization, package inspection, context message shape, and capability gates are isolated in Pi modules; every state change goes through existing `mem_session`/tool handlers, and unsupported compaction/delegation facts remain explicit.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Shared continuation validation enforces the existing item/source/taxonomy/1,000-code-point limits, and Pi neither reselects nor rewrites recovered content.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The plan adds one documented clean Pi package/setup path, refuses ambiguous prior provenance, defines receipt-owned rollback, declares the narrow revision-10 migration with verified backup/recovery, and introduces no legacy alias or dual runtime.
