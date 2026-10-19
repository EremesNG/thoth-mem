# Requirements Quality Checklist

## Domain: tools
- [x] completeness: Covers MCP `mem_session`, `mem_save`, HTTP mirror behavior, fallback visibility, and the unchanged six-tool surface.
- [x] clarity: Requirements distinguish explicit identity preservation from deterministic compatibility fallback.
- [x] measurability: Scenarios assert concrete outputs: preserved ids/projects, fallback reported, and registry equality.
- [x] testability: Scenarios can be covered by MCP tool-handler tests, HTTP route tests, and registry inspection.

## Domain: store
- [x] completeness: Covers session/project persistence, nullable prompt/observation project compatibility, deterministic fallbacks, import/applyV2Chunk, and historical placeholder stability.
- [x] clarity: Requirements separate non-null `sessions.project` behavior from nullable prompt/observation project behavior.
- [x] measurability: Scenarios define expected persisted rows, enrichment rules, fallback reports, and non-rewrite behavior.
- [x] testability: Scenarios can be covered with in-memory Store tests and export/import/apply chunk fixtures.

## Domain: sync
- [x] completeness: Covers export identity preservation, import degradation reporting, fallback idempotency, and CLI sync-dir default visibility.
- [x] clarity: Requirements preserve legacy compatibility while making missing identity observable.
- [x] measurability: Scenarios assert exported fields, warning/reporting behavior, replay convergence, and resolved-directory output.
- [x] testability: Scenarios can be covered with sync import/export tests plus CLI sync command output tests.

## Domain: config
- [x] completeness: Covers centralized data-dir bootstrap preservation and deterministic optional identity default resolution.
- [x] clarity: Requirements explicitly state that existing `THOTH_DATA_DIR` semantics are unchanged.
- [x] measurability: Scenarios assert precedence between explicit input, centralized config, and fallback behavior.
- [x] testability: Scenarios can be covered by config resolution tests and integration tests for server/CLI Store initialization.
