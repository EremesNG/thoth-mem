# Delta for Store

> Change A — Output Caps Only. Maps to baseline `openspec/specs/store/spec.md`.
> ADDS an output-budget contract to `Store.getContext` and a preview/truncation
> mode to `formatObservationMarkdown`. The existing
> `observation_facts` / FTS5 compatibility requirement in the baseline is
> preserved unchanged (verified live; not a pruning target under this change).

## ADDED Requirements

### Requirement: Store.getContext MUST Accept And Enforce A Max-Output-Chars Budget
`Store.getContext` MUST accept a maximum-output-character budget and MUST enforce
it on the rendered context string before returning, mirroring the budget
discipline already applied elsewhere in the codebase (`mem_recall`
`trimToBudget`, `src/tools/mem-recall.ts:24-29`; `formatProjectGraph` `maxChars`
and `formatContextResults` `maxChars` caps). The budget MUST default from
resolved configuration (`maxContextChars`) and MUST be overridable per call.
Enforcement MUST be deterministic for identical inputs and MUST surface a
shown/omitted (or truncation) indicator in the returned string so the bound is
measured, not merely claimed.

#### Scenario: getContext output never exceeds the budget
- GIVEN recent observations whose full rendering would exceed the supplied
  max-output-chars budget
- WHEN `Store.getContext` renders the context
- THEN the returned string length MUST be less than or equal to the supplied
  budget
- AND the returned string MUST include an indicator of how much was shown versus
  omitted

#### Scenario: getContext budget defaults from config and is overridable
- GIVEN a configured default `maxContextChars`
- WHEN `Store.getContext` is called without an explicit budget
- THEN the configured default MUST be applied
- AND WHEN `Store.getContext` is called with an explicit per-call budget
- THEN the per-call budget MUST take precedence for that call without mutating
  configuration

#### Scenario: getContext unbounded sentinel disables enforcement
- GIVEN the documented unbounded sentinel `0` is supplied as the budget
- WHEN `Store.getContext` renders a large store
- THEN the output MUST NOT be truncated by the budget

### Requirement: formatObservationMarkdown MUST Support A Preview/Truncation Mode
`formatObservationMarkdown` (`src/utils/content.ts:28-38`) MUST support a
preview/truncation rendering mode that emits a bounded preview of `obs.content`
(reusing the existing `truncateForPreview` primitive, `src/utils/content.ts:3-12`,
with a configurable preview length defaulting to 300) instead of the full body.
The preview mode MUST be the mode used by bounded context rendering in
`Store.getContext`. The existing full-content rendering behavior MUST remain
available for callers that explicitly request it, so non-context callers are not
silently changed.

#### Scenario: Preview mode truncates long observation content
- GIVEN an observation whose content exceeds the configured preview length
- WHEN `formatObservationMarkdown` renders it in preview mode
- THEN the emitted block MUST contain a bounded preview of the content, not the
  full body
- AND the block MUST retain the observation header metadata (id, type, title)

#### Scenario: Full mode remains available for explicit callers
- GIVEN a caller that explicitly requests full rendering
- WHEN `formatObservationMarkdown` renders an observation in full mode
- THEN the emitted block MUST contain the complete `obs.content`

### Requirement: Bounded Context Rendering MUST Preserve Existing Section Structure And Escalation
When `Store.getContext` renders bounded output, it MUST preserve the existing
context section structure (recent sessions, recent prompts, recent observations,
and memory stats) and MUST include a pointer directing callers to `mem_get` for
full observation bodies. Bounding MUST reduce the recent-observation content to
previews and trim to budget; it MUST NOT drop the structural sections or the
memory-stats summary that callers depend on.

#### Scenario: Bounded render keeps structure and mem_get pointer
- GIVEN bounded rendering is active in `Store.getContext`
- WHEN the context is rendered for a populated store
- THEN the output MUST still contain the recent-sessions, recent-prompts,
  recent-observations, and memory-stats sections
- AND the output MUST contain a pointer to `mem_get` for retrieving full
  observation content

## MODIFIED Requirements

## REMOVED Requirements
