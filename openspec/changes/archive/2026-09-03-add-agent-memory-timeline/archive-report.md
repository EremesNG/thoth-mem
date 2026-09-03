# Archive Report: Agent Memory Timeline

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-09-03-add-agent-memory-timeline/`

## Completed scope

- Added a bounded, read-only `mem_project action=timeline` over exact-project promoted memories while retaining the exact six-tool MCP registry.
- Implemented deterministic validity-time ordering, inclusive normalized bounds, scoped live keyset cursors, compact disclosure, item and character budgets, and selective `mem_get` expansion.
- Taught the canonical `thoth-mem` Skill and byte-identical OpenCode, Codex, and Claude Code copies to route chronological exploration through the timeline and expand only selected IDs.
- Updated packaging assertions, public documentation, routed agent guidance, and durable `tools`, `retrieval`, `harness-integration`, and `packaging` requirements.

## Verification lineage

- `verify-report.md` records the second independent fresh Oracle PASS across completeness, correctness, and coherence, with FR-001 through FR-007 and SC-001 through SC-005 mapped to implementation, executed evidence, prior-contract comparison, and archive-parser behavior.
- Focused, full, integration, packed-smoke, benchmark, Skill-validation, prepublish, diff-hygiene, and SDD-ready checks passed.

## Canonical specification sync

- Updated: `harness-integration`, `packaging`, `retrieval`, `tools`.
## Deviations and residual warnings

- No accepted product-scope deviation. A post-archive delta audit found that the first replacement text omitted existing scenarios owned by the same four requirement titles; the change was reopened, a plan review rejected two remaining statement-level omissions, and fresh plan/final Oracles approved the repaired replacements that preserve those contracts and add the timeline.
- W-001: optional future regression cases can exercise additional canonical-base64 cursor corruption shapes.
- W-002: optional future regression coverage can insert a concurrent backdated memory between live keyset pages.

## Follow-up

- Consider W-001 and W-002 when the timeline test matrix is next expanded; neither blocks this archive.
