# Contract: MCP memory workflow v2

## Registry

The registry contains exactly six tools:

| Tool | Workflow responsibility |
| --- | --- |
| `mem_save` | Capture evidence and optionally promote a durable memory or outcome |
| `mem_recall` | Ranked recall with required `mode=compact` and `mode=context` stages plus truthful optional-lane metadata |
| `mem_context` | Bounded project/session/current-work recovery assembly; it does not replace `mem_recall mode=context` |
| `mem_get` | Explicit full fetch of one evidence or memory record plus lineage |
| `mem_project` | List projects, produce bounded project briefing, and navigate deterministic topic/temporal lineage |
| `mem_session` | Enroll/resume/checkpoint/compact/finalize a root session idempotently |

Migration, setup, diagnostics, projection administration, benchmark execution, sync, HTTP, dashboard, and graph operations are not MCP tools.

## Shared response envelope

Every success response is a versioned structured payload with a bounded text rendering:

- `schema`: tool-specific `thoth-mem.mcp.v2.*` identifier.
- `data`: tool result.
- `sources`: stable memory/evidence IDs and project/session scope used by the result.
- `budget`: requested, returned, truncated, source/evidence/full character counts, an explicit `compression_ratio`, plus injected tokens when the host reports them.
- `lanes`: core and requested optional lane states; absent lanes never receive credit.
- `warnings`: bounded stable codes without raw prompt leakage.

Every error uses a stable code, bounded safe message, retryability classification, and no false success. V1 text or field compatibility is not required.

## Progressive retrieval

- `mem_recall mode=compact` is the default and returns stable IDs, title/kind/topic/outcome/status, a surgical snippet, score components, provenance IDs, and compression measurements.
- `mem_recall mode=context` expands the strongest recalled results with surgically trimmed evidence and surrounding context within an explicit character/token budget while reporting `compression_ratio` against full source content.
- `mem_context` separately assembles bounded project/session/current-work recovery context; callers still use `mem_recall mode=context` for the second stage of a query-specific recall funnel.
- `mem_get` is the only workflow tool that returns complete stored content by ID.
- Current mode prefers current valid memory. Historical mode includes superseded/retracted/failed lineage and must be requested explicitly.
- `mem_project` has no graph action in v2. Its briefing is deterministic and its navigation follows ledger IDs/topic/temporal links.

## Save semantics

`mem_save` supports two explicit intents:

1. evidence-only capture; and
2. evidence plus promoted memory.

A promoted memory declares kind, title/content, project/root session, optional topic key, optional outcome, and optional superseded memory ID. Idempotency is based on the caller/harness event key when present, not a time-window heuristic that can collapse intentional repeated prompts.

## Compatibility boundary

The six names are preserved as the chosen workflow boundary. V1 actions, graph navigation, implicit upsert behavior, text formats, optional fields, and storage semantics may be rejected. There is no negotiation or hidden dual contract in the v2 server.
