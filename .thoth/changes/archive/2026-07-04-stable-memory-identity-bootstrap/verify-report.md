# Verification Report: Stable Memory Identity Bootstrap

## Round

round 1

## Completeness

All OpenSpec artifacts were recovered from filesystem in `openspec` mode. Implementation covers config, store, tools, HTTP, sync, and CLI surfaces named in `tasks.md`. All 16 tasks are checked complete.

Scenario compliance: 32/32.

## Build and Test Evidence

Root-executed evidence accepted for this read-only review:

- Focused identity/bootstrap command passed: `pnpm test -- tests/store/sessions.test.ts tests/store/export-import.test.ts tests/tools/mem-session.test.ts tests/tools/mem-save.test.ts tests/http-server.test.ts tests/sync/sync.test.ts tests/cli.test.ts tests/config.test.ts tests/tools/registry.test.ts` -> 50 files passed, 640 tests passed.
- Build passed: `pnpm run build`.
- Full suite passed: `pnpm test` -> 50 files passed, 640 tests passed.
- RED/GREEN remediation evidence accepted: v2 missing-session sync import first failed with zero imports/skipped 2, then passed after fix.

Static evidence anchors:
- Identity normalization, placeholders, metadata merge, and warning formatting: `src/store/identity.ts:3`, `src/store/identity.ts:22`, `src/store/identity.ts:33`, `src/store/identity.ts:93`, `src/store/identity.ts:138`.
- Additive identity result types: `src/store/types.ts:17`, `src/store/types.ts:36`, `src/store/types.ts:92`, `src/store/types.ts:289`, `src/store/types.ts:338`, `src/store/types.ts:346`.
- Schema compatibility preserved: `src/store/schema.ts:437`, `src/store/schema.ts:447`, `src/store/schema.ts:483`.

## Compliance Matrix

| Domain | Requirement / Scenarios | Verdict | Evidence |
| --- | --- | --- | --- |
| config | Data-dir bootstrap: THOTH_DATA_DIR semantics; server/CLI centralized config | compliant | `src/config.ts:1087`, `src/config.ts:1100`, `src/server.ts:62`, `src/cli.ts:280`; `tests/config.test.ts:83` |
| config | Identity defaults: explicit wins; no new config required; config-derived identity cannot override explicit | compliant | `src/store/identity.ts:40`, `src/store/identity.ts:44`; no new identity config in `src/config.ts:1087`; explicit no-fallback tests `tests/tools/mem-save.test.ts:90`, `tests/http-server.test.ts:628` |
| store | Session persistence: explicit session/project; placeholder enrichment; no stable-project downgrade | compliant | `src/store/index.ts:1367`, `src/store/index.ts:1376`, `src/store/index.ts:1387`; `tests/store/sessions.test.ts:15`, `tests/store/sessions.test.ts:36` |
| store | Nullable prompt/observation compatibility: prompt project null; observation project null | compliant | `src/store/schema.ts:455`, `src/store/schema.ts:489`; `src/store/index.ts:1799`, `src/store/index.ts:3259`; `tests/store/sessions.test.ts:47` |
| store | Fallback deterministic/reportable: repeated missing prompt fallback; explicit distinguishable from fallback | compliant | `src/store/identity.ts:22`, `src/store/identity.ts:44`, `src/store/identity.ts:122`; `src/store/index.ts:1833`, `src/store/index.ts:3353`; `tests/tools/mem-save.test.ts:90`, `tests/tools/mem-save.test.ts:104` |
| store | Import/apply: explicit identity preserved; legacy degraded reported; applyV2Chunk preserves mutation identity | compliant | `src/store/index.ts:5615`, `src/store/index.ts:5646`, `src/store/index.ts:5691`, `src/store/index.ts:5838`, `src/store/index.ts:5922`, `src/store/index.ts:5961`; `tests/store/export-import.test.ts:523`, `tests/sync/sync.test.ts:461` |
| store | Historical placeholders: manual-save IDs and unknown project are not silently rewritten | compliant | `src/store/index.ts:1372` only enriches project on same id; no ID rewrite path; observation/prompt project writes preserve nullable/record values at `src/store/index.ts:5656`, `src/store/index.ts:5701`; regression coverage `tests/store/sessions.test.ts:36` |
| sync | Export preserves explicit identity and nullable project compatibility | compliant | `src/sync/index.ts:191`, `src/sync/index.ts:231`; `tests/sync/sync.test.ts:223` |
| sync | Import reports degraded identity; explicit imported identity is not warned by helper semantics | compliant | `src/sync/index.ts:738`, `src/sync/index.ts:741`, `src/sync/index.ts:786`; `tests/sync/sync.test.ts:410`, `tests/sync/sync.test.ts:461` |
| sync | Import idempotency: replayed legacy chunk; equivalent payload no divergent placeholders | compliant | `src/sync/index.ts:708`, `src/sync/index.ts:740`, `src/sync/index.ts:752`; `tests/sync/sync.test.ts:541`, `tests/sync/sync.test.ts:660` |
| sync | CLI sync dir: default shown; explicit dir supported | compliant | `src/cli.ts:529`, `src/cli.ts:536`, `src/cli.ts:550`, `src/cli.ts:565`; `tests/cli.test.ts:403`, `tests/cli.test.ts:415` |
| tools | MCP session/save preserve explicit identity | compliant | `src/tools/mem-session.ts:45`, `src/tools/mem-save.ts:121`, `src/tools/mem-save.ts:142`; `tests/tools/mem-session.test.ts:27`, `tests/tools/mem-save.test.ts:90` |
| tools | MCP fallback identity observable/deterministic for missing session/project | compliant | `src/tools/mem-session.ts:101`, `src/tools/mem-save.ts:28`, `src/tools/mem-save.ts:198`; `tests/tools/mem-session.test.ts:44`, `tests/tools/mem-save.test.ts:104`, `tests/tools/mem-save.test.ts:141`, `tests/tools/mem-save.test.ts:152` |
| tools | HTTP mirrors MCP identity semantics | compliant | `src/http-routes.ts:744`, `src/http-routes.ts:912`, `src/http-routes.ts:935`, `src/http-routes.ts:1252`, `src/http-routes.ts:1351`, `src/http-routes.ts:1394`; `tests/http-server.test.ts:625` |
| tools | Compact MCP registry remains exactly six tools | compliant | `src/tools/index.ts:22`, `src/tools/index.ts:37`; `tests/tools/registry.test.ts:8`, `tests/tools/registry.test.ts:97` |

## Design Coherence

The implementation matches the design:

- Central helper module exists and is used by Store/MCP/HTTP/sync/CLI paths: `src/store/identity.ts:33`, `src/store/index.ts:1792`, `src/http-routes.ts:912`, `src/sync/index.ts:16`, `src/cli.ts:9`.
- Metadata is additive; row schemas remain unchanged and nullable prompt/observation projects are preserved: `src/store/types.ts:92`, `src/store/types.ts:289`, `src/store/schema.ts:455`, `src/store/schema.ts:489`.
- Placeholder vocabulary is preserved: `manual-save-${project || 'unknown'}` and `unknown`: `src/store/identity.ts:22`, `src/store/identity.ts:45`.
- MCP surface remains unchanged at six tools: `src/tools/index.ts:22`.
- CLI keeps the CWD `.thoth-sync` default while printing the resolved directory: `src/cli.ts:529`, `src/cli.ts:536`.

## Issues Found

### Critical

None.

### Warnings

None.

### Constitution Suggestion

This change touched governance/principles in the design artifacts. Consider running `sdd-constitution` to record a constitution amendment. This is advisory only and does not affect the verdict.

## Verdict

pass

VERIFICATION

After writing, read the file back enough to confirm it exists and includes `## Verdict` and `pass`.