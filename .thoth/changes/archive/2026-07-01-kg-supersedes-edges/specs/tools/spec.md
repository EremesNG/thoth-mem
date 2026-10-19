# Delta for Tools

> Sub-change **B3** (`kg-supersedes-edges`). `mem_project action=graph` defaults
> to a current-state view (superseded facts hidden by default but still
> reachable/flagged), gated by the supersession flag. No MCP tool is
> added/removed/renamed (constitution **P1**); flag-off output is byte-identical
> to pre-B3 / B1.

## ADDED Requirements

### Requirement: `mem_project action=graph` MUST Default to a Current-State View With History Reachable
When the supersession flag is enabled, `mem_project action=graph` (rendered by
`formatProjectGraph`, `src/tools/project-views.ts:31-70`, which reads
`store.getObservationFacts({ project, topic_key })`) MUST default to a
CURRENT-STATE ledger: facts whose underlying triple is superseded MUST be hidden
from or visibly flagged in the default ledger so the view reflects current truth.
Superseded history MUST remain REACHABLE (constitution **P5**): the rendering MUST
NOT delete superseded facts, and superseded facts MUST be derivable through a
history-inclusive path (for example an explicit option/parameter or the
underlying KG read), not lost. This is the one intentional, flag-gated default
behavior change in B3; with the flag OFF the ledger MUST be byte-identical to the
pre-B3 (B1) output. The `max_chars` minimum-of-`200` budget for `action=graph`
(it does NOT accept the unbounded sentinel `0`) MUST be unchanged.

#### Scenario: Default graph view shows current truth
- GIVEN a project with superseded and current facts and the flag enabled
- WHEN `mem_project action=graph` renders the default ledger
- THEN superseded facts MUST be hidden or visibly flagged
- AND current facts MUST be shown

#### Scenario: Superseded history remains reachable
- GIVEN superseded facts exist for a project
- WHEN history is requested through the history-inclusive path
- THEN the superseded facts MUST still be retrievable
- AND they MUST NOT have been deleted

#### Scenario: Flag-off ledger is byte-identical to pre-B3
- GIVEN the supersession flag is disabled
- WHEN `mem_project action=graph` renders for any project/scope
- THEN the rendered ledger MUST be byte-for-byte identical to the pre-B3 (B1)
  output, including each fact line's `subject -- relation --> object`

#### Scenario: action=graph output budget is unchanged
- GIVEN a project whose graph ledger is large
- WHEN `mem_project action=graph` renders with the default or an explicit
  `max_chars`
- THEN the `max_chars` minimum of `200` MUST still apply
- AND `action=graph` MUST NOT accept the unbounded sentinel `0`

### Requirement: B3 MUST NOT Change the MCP Tool Surface
B3 MUST NOT add, remove, rename, or split any MCP tool; it only changes behavior
WITHIN the existing tools (the `mem_project action=graph` default view, and the
`mem_recall` superseded annotation behavior described in the retrieval delta).
The registered set MUST remain exactly `mem_save`, `mem_recall`, `mem_context`,
`mem_get`, `mem_project`, and `mem_session` (constitution **P1**).

#### Scenario: MCP registry is unchanged by B3
- GIVEN B3 is applied
- WHEN clients list available tools
- THEN exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`,
  and `mem_session` MUST be registered
- AND no supersession-specific tool MUST appear in the registry

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **CL-6 (RESOLVED — current-state default for graph only):** The current-state
  DEFAULT (hide-or-flag superseded) applies to `mem_project action=graph` only.
  `mem_recall` and the multi-hop frontier DEPRIORITIZE+flag (keep reachable)
  rather than hide (see the retrieval delta). History stays reachable everywhere
  (constitution **P5**).
- **Parity is conditional on the flag (B1 contract preserved):** B1 kept
  `action=graph` byte-for-byte. B3 INTENTIONALLY changes the default view, but
  only when `kgSupersedeEnabled` is on; flag-off restores the exact B1 output.
  This mirrors the B1/B2 flag-gated reversibility discipline and is the only
  observable behavior change in B3.
- **`mem_recall` annotation (cross-reference):** The `mem_recall` superseded
  annotation/deprioritization is specified in the retrieval delta
  (`queryKnowledgeLane` flag + fusion deprioritization). This tools delta covers
  only the `action=graph` default-view change and the unchanged tool surface.
- **Visualization vocabulary (non-breaking):** The supersession relation may
  appear in the relation vocabulary exposed by visualization/relation listings
  without breaking the existing relation set; this is additive and parity-safe.
