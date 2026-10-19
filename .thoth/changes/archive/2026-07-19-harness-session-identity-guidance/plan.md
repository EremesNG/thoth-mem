# Implementation Plan: Harness session identity guidance

## Technical context

The canonical recipe at `skills/thoth-mem/SKILL.md` defines stable identity semantics but has no harness lookup routing. Codex and Claude command hooks already deliver `session_id` and `cwd` to `plugin/runners/hook-runner.mjs`; OpenCode supplies root identity through its event and plugin context. The adapters normalize those fields and `resolveLifecycleIdentity` produces one root session/project pair, but `MemoryIntegrationCore.hostOutputFor` currently emits only the `mem_context` text, so the verified identity is not visible to the root model. The shared plugin publishes one copied skill file, and `scripts/sync-integration-assets.mjs`, `integrations/inventory.json`, and `scripts/verify-integration-package.mjs` currently know only that file, not auxiliary references.

The accepted public seams are:

1. `MemoryIntegrationCore.handle(...) -> LifecycleResult.hostOutputDirective.text` for model-visible native lifecycle context.
2. The canonical `skills/thoth-mem/` bundle for progressive agent guidance.
3. The inventory-declared `plugin/skills/thoth-mem/` bundle and explicit sync/verifier commands for delivered assets.

No MCP tool, storage schema, lifecycle parameter, or host payload schema changes.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The implementation retains exactly the existing six MCP tools and changes only guidance, lifecycle output text, and packaged assets.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Retrieval ranking and fallback are untouched; identity lookup and unavailable states remain explicit.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Shared identity semantics remain in the host-neutral core while native field discovery stays in thin harness references and existing adapters.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — The host-output contract remains capped at 1,000 Unicode code points and will reserve space for a complete identity header before retaining bounded context.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — No public tool, CLI, HTTP, taxonomy, or persistence contract is renamed or removed.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add a mandatory harness-selection paragraph that keeps common invariants in the root recipe and routes to exactly one relative reference. | `skills/thoth-mem/SKILL.md`; packaged copy | Canonical and packaged skill text/files |
| FR-002 | Add Codex source priority: verified injected identity, targeted `CODEX_THREAD_ID` read, optional unambiguous task cross-check; explicitly reject `projectId` and nearby IDs. | `skills/thoth-mem/references/codex.md` | Canonical reference content |
| FR-003 | Add Claude Code source priority based on verified injected identity and official native hook `session_id`/`cwd`, with no invented environment fallback. | `skills/thoth-mem/references/claude-code.md` | Canonical reference content |
| FR-004 | Add OpenCode source priority based on verified injected identity and exact native root fields/context accepted by the adapter, rejecting delegated identity. | `skills/thoth-mem/references/opencode.md` | Canonical reference content |
| FR-005 | Format a model-visible verified identity header from the already resolved lifecycle identity and prepend it to successful recovery/post-compaction context. Pass the existing plan identity into host-output construction rather than re-resolving it. | `src/integration/core/lifecycle.ts`; `LifecycleResult.hostOutputDirective.text` | `MemoryIntegrationCore.handle` result |
| FR-006 | Reserve code-point budget for the complete header and separator; truncate only recovery context. If the header itself exceeds `MAX_HOST_OUTPUT_TEXT_CODE_POINTS`, return unavailable. | `src/integration/core/lifecycle.ts`, exported host-output bound | Boundary-focused lifecycle tests |
| FR-007 | Declare a fixed canonical-to-packaged reference map and synchronize each file through the existing `writeIfChanged` path. | `scripts/sync-integration-assets.mjs`; `plugin/skills/thoth-mem/references/*.md` | `syncIntegrationAssets` fixture result and byte equality |
| FR-008 | Add three unique shared inventory roles and resolve each expected reference relative to the plugin root during runtime declaration validation. | `integrations/inventory.json`; `scripts/verify-integration-package.mjs` | Inventory/package verifier tests |

The identity header format will be stable and compact:

```text
thoth-mem verified identity: root_session_id=<id>; project=<name>
```

It reports values already used for confirmed lifecycle effects; it does not derive a second identity or expose unrelated hook payload fields. Harness references treat this block as the primary root-agent source. Codex documents `CODEX_THREAD_ID` as a verified current-runtime recovery check, not a public cross-version guarantee. References map the resolved ID to both `mem_session.id` and other tools' `session_id`, keep project distinct from native saved-project identifiers, and direct ambiguous cases to explicit degradation.

### Test-first vertical slices

1. Lifecycle seam: add one failing supported-enrollment assertion for the header, implement identity propagation/formatting, then add the output-limit and overlong-header cases.
2. Skill seam: add a failing canonical/package contract assertion for exactly three routed references, then add the canonical references and root routing.
3. Delivery seam: add failing inventory/sync/verifier expectations for the three references, then implement inventory declarations, synchronization, packaged copies, and read-only validation.

### Optional support artifacts

- `research.md`: Not needed; current runtime evidence, official Codex hook fields, repository adapters, and packaging code resolve the implementation questions.
- `data-model.md`: Not needed; no schema or persisted identity representation changes.
- `contracts/`: Not needed; FR/SC and the existing lifecycle/asset interfaces fully describe the change.
- `quickstart.md`: Not needed; the harness references are the user-facing operational guidance.

## Risks and migrations

- Identity text consumes part of the existing context budget. Mitigation: preserve the complete identity first and truncate only the trailing recovery context by Unicode code points.
- Session or project values could make the header exceed the bound. Mitigation: fail output readiness closed instead of truncating identity; memory effects remain confirmed and independently available.
- Harness references can drift from adapters. Mitigation: keep them limited to identity field mapping, add tests for required source names/rejections, and retain adapter fields as repository evidence.
- New canonical reference files may not reach installed plugins. Mitigation: inventory each packaged file, synchronize byte-for-byte, and make the verifier reject missing/undeclared/stale assets.
- `CODEX_THREAD_ID` is observable but not present in the public Codex manual inspected during discovery. Mitigation: label it as current-runtime recovery and keep official hook identity as the primary path.
- Rollback is a focused reversal of the lifecycle formatter, routing paragraph, reference files, and inventory/sync declarations; no data migration or persisted cleanup is required.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — All decisions operate behind the unchanged six-tool surface.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — The design adds an explicit unavailable branch for unsafe identity output and does not alter retrieval lanes.
- **P3 — Harness-Agnostic Memory Contract**: PASS — One core header consumes normalized identity; per-harness discovery remains outside the core in adapters and references.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — A single formatter enforces the existing 1,000-code-point maximum and trims only optional context.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — Existing public schemas and names are preserved, and the plugin bundle gains additive documentation assets.
