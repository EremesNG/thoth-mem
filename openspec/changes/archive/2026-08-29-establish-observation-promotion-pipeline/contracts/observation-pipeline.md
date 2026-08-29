# Contract: Observation Promotion Pipeline

## Public inventory

The MCP server continues to register exactly:

`mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, `mem_session`.

No observation-specific tool is added.

## `mem_save` union

Shared identity fields remain `project_key`, `project_name`, optional paired `root_session_key` + `harness`, and stable `event_key` where the operation is idempotent. Exactly one branch is accepted.

### Direct branch

The current strict `{ evidence, memory? }` request remains valid without `metadata`. It is the deliberate path for already-authorized durable information. The same direct branch adds one optional, closed support-evidence form; it is not another tool or top-level operation:

```json
{
  "project_key": "project",
  "project_name": "Project",
  "root_session_key": "required-for-structured-support",
  "harness": "required-for-structured-support",
  "event_key": "stable-required-key",
  "evidence": {
    "kind": "explicit_save",
    "content": "bounded attributable validation receipt",
    "source_ref": "optional",
    "metadata": {
      "observation_validation": {
        "observation_id": "existing same-project candidate",
        "result": "passed|failed",
        "method": "bounded non-empty method"
      }
    }
  }
}
```

The alternative structured support form requires `evidence.kind="handoff"` and replaces metadata with exactly:

```json
{
  "observation_review_attestation": {
    "observation_id": "existing same-project candidate",
    "verdict": "accepted|rejected",
    "reviewer": "bounded non-empty reviewer identity",
    "method": "bounded non-empty review method"
  }
}
```

`metadata` is forbidden for every other public direct-evidence shape. Structured support requires verified paired session identity and `event_key`, forbids `memory`, validates that the referenced candidate already exists in the same project, applies privacy/bounds before canonical hashing, and persists the exact metadata in immutable evidence. Unknown keys, wrong evidence-kind/discriminator pair, missing candidate, cross-project reference, oversized/private values, or replay drift commits no evidence, event, receipt, memory, or observation state. Existing direct requests without `metadata` keep their accepted shape and behavior.

### Candidate branch

```json
{
  "project_key": "project",
  "project_name": "Project",
  "root_session_key": "optional-for-project-scope",
  "harness": "paired-with-root-session-key",
  "event_key": "stable-required-key",
  "observation": {
    "kind": "decision|constraint|fact|procedure|result|failure|preference",
    "scope": "session|project",
    "title": "bounded title",
    "claim": "one bounded atomic claim",
    "proposed_memory": {
      "kind": "existing MemoryKind",
      "title": "exact promoted title",
      "content": "exact promoted content",
      "topic_key": "optional stable topic",
      "outcome": "optional existing outcome"
    },
    "support_ids": ["existing evidence ID"],
    "coverage": { "from_sequence": 1, "to_sequence": 3 },
    "generator": {
      "kind": "root_agent|harness|model",
      "name": "generator",
      "version": "optional",
      "config_hash": "optional 64 lowercase hex"
    },
    "concepts": ["optional advisory facet"],
    "files": ["optional advisory path facet"],
    "predecessor_id": "optional corrected candidate"
  }
}
```

`coverage` is required for session scope and forbidden for project scope. Session identity is required for session scope. Every support is mandatory, same-project, and same-session/in-range for session scope. Unknown keys fail. A candidate must exist before either structured review-support receipt can reference it.

### Review branch

```json
{
  "project_key": "project",
  "project_name": "Project",
  "root_session_key": "required-verified-root",
  "harness": "required",
  "event_key": "stable-required-key",
  "observation_review": {
    "observation_id": "candidate ID",
    "verdict": "accepted|rejected",
    "basis": "root_user_confirmed|observable_validation|independent_review",
    "policy": { "id": "stable policy", "version": "version" },
    "reason": "bounded attributable reason",
    "support_ids": ["evidence supporting the review basis"]
  }
}
```

The service resolves a non-import root session in the candidate's project and derives review actor `agent` and authority `root_user`; the caller cannot send or override either value. A candidate accepts one terminal verdict only. Review supports are exact rather than advisory:

- `root_user_confirmed` is valid for every observation kind and requires a same-reviewer-session `root_prompt` event with actor `user` and authority `root_user`;
- `observable_validation` is valid only for `fact|procedure|result|failure` and requires a same-reviewer-session `explicit_save` event with actor `agent`, authority `root_user`, and bounded `observation_validation` metadata matching the observation and accepted/passed or rejected/failed result;
- `independent_review` is valid only for `fact|procedure|result|failure` and requires a `handoff` event from a different non-import session with actor `agent`, authority `harness`, plus bounded `observation_review_attestation` metadata matching the observation and verdict.

Every support must be same-project, predate the review, and differ from the candidate and review submission evidence. Partial/degraded/import identity or any kind/session/actor/authority/payload mismatch commits nothing. Rejection follows the same matrix and also requires its bounded reason.

### Promotion branch

```json
{
  "project_key": "project",
  "project_name": "Project",
  "root_session_key": "required-verified-root",
  "harness": "required",
  "event_key": "stable-required-key",
  "observation_promotion": { "observation_id": "accepted candidate ID" }
}
```

The promotion branch accepts no new memory prose. It commits the candidate's exact proposed memory representation or fails.

## `mem_save` results

Every successful branch returns a discriminated operation plus confirmed IDs, project/session bounds, duplicate truth, sources, closed lane state, and warnings. Candidate results expose candidate/evidence IDs; review results expose review/candidate/evidence IDs and derived state; promotion results expose promotion/candidate/review/memory/evidence IDs and derived state. Raw support contents are never returned.

## `mem_project action=observations`

Input extends the current strict action union with:

- required `project_key`;
- optional paired `root_session_key` + `harness` for exact-session filtering;
- optional `state`: `pending|accepted|rejected|promoted`;
- optional `temporal`: `current|history`, defaulting to `current`;
- bounded `limit`/`budget_chars`.

Correction lineage is a same-project, acyclic, non-branching chain: each candidate has at most one predecessor and one successor. `current` returns leaves with no successor; `history` returns non-leaves that have a successor, so the two values are disjoint. Output is a deterministic compact list ordered by state priority `pending`, `accepted`, `rejected`, `promoted`, then `created_at` ascending, then observation ID ascending. Filters run before caps. Each item includes stable observation ID, kind, scope, state, title/snippet, created time, support count, review basis/verdict when present, and promoted memory ID when present. It omits raw support payloads and advisory similarity unless explicitly requested by a future spec.

## `mem_get`

An observation ID returns `recordType: "observation"` with candidate fields, advisory facets, generator, support IDs, review record/support IDs, promotion evidence/memory ID, predecessor/successor lineage when `history=true`, and derived state. It returns no unrelated candidates and no support content.

Existing memory and summary records remain unchanged except for promoted memory lineage containing observation/promotion source IDs where applicable.

## Unchanged workflows

- `mem_recall`: searches promoted memories only.
- `mem_context`: selects session summaries and promoted memories only.
- `mem_session`: handles verified lifecycle and optional structured summaries only.
- `mem_project action=briefing`: shares the unchanged continuation selector.

## Failure contract

All invalid branch combinations, unknown nested fields/taxonomies, missing identity pairs, stale replay payloads, missing/cross-scope supports, invalid policy basis, duplicate terminal review, rejected/unreviewed promotion, content-expanding promotion, and impossible state transitions return bounded non-retryable `thoth-mem.mcp.error` envelopes with zero durable/FTS side effects.

## Limits

Contract constants bound claim/proposed-memory code points, title/reason/facet lengths, supports/facets per candidate, queue result count, canonical JSON size, and public response budget. The implementation defines exact values once in `contracts.ts`, mirrors them in Zod and SQL where applicable, and tests every boundary.
