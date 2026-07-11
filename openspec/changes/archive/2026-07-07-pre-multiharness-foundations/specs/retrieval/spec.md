# Delta for Retrieval

## ADDED Requirements
### Requirement: Recall and Context Paths MUST Emit Token-Savings Measurement Metadata
Retrieval and context-producing paths MUST expose measurement metadata sufficient to compare full source size, retained evidence size, returned payload size, and token savings. Metrics MUST distinguish character counts from exact token counts and deterministic token estimates. When exact tokenizer accounting is unavailable, estimates MUST be labeled as estimates and computed deterministically.

#### Scenario: Retrieval result reports size bases
- GIVEN a recall request returns ranked evidence
- WHEN output metadata or eval instrumentation is inspected
- THEN full source size, evidence size, and returned payload size MUST be available
- AND the basis MUST indicate whether the measurements are characters, exact tokens, or estimated tokens

#### Scenario: Token estimates are labeled
- GIVEN exact tokenizer support is unavailable
- WHEN token-savings metadata is emitted
- THEN estimated token counts MUST be present only as estimates
- AND the output MUST NOT imply billing-exact token accounting

### Requirement: Retrieval MUST Measure Compact/Context Answers Versus mem_get Escalation
The retrieval funnel MUST support telemetry that counts when compact/context evidence is sufficient and when the caller escalates to `mem_get` for full content. The measurement MUST avoid claiming `mem_get` avoidance when a later full fetch is required for the same answer path.

#### Scenario: Compact recall answers without escalation
- GIVEN compact or context recall evidence contains enough source-attributed information for an answer path
- AND no correlated full `mem_get` call follows for the same path
- WHEN telemetry is summarized
- THEN the path MAY count as `mem_get` avoided

#### Scenario: Later full fetch prevents avoidance credit
- GIVEN compact or context recall runs for an answer path
- AND a correlated `mem_get` full fetch follows because full content is required
- WHEN telemetry is summarized
- THEN the path MUST count as escalated
- AND it MUST NOT count as avoided

### Requirement: Recall-After-Compaction Evidence MUST Be Measurable
Retrieval instrumentation and evals MUST include evidence that after a compaction-like context loss, the recall funnel can recover source material using compact recall, context expansion, and optional `mem_get` escalation. The evidence MUST report quality and payload savings without storing raw sensitive content.

#### Scenario: Compaction recovery uses the recall funnel
- GIVEN a task requires recovering prior source material after only a compact summary remains
- WHEN the recall-after-compaction scenario runs
- THEN compact recall, context expansion, and any full-fetch escalation MUST be measured separately
- AND the report MUST include recovered evidence quality and payload-size metrics

#### Scenario: Compaction telemetry is privacy-safe
- GIVEN recovered memories contain private or secret-like content
- WHEN recall-after-compaction telemetry is recorded
- THEN the telemetry MUST include only sanitized bounded metadata, counts, hashes, or signatures
- AND raw sensitive content MUST NOT be persisted in telemetry

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- This change measures the existing four-lane retrieval and recall funnel; it does not add a fifth lane, global answer synthesis, or query-time subquery planning.
- Correlation between recall and `mem_get` may use trace ids, request ids, or a deterministic bounded time/window heuristic selected during design.

## Handoff Hints
- Design should reuse existing retrieval eval envelope fields where possible and add only the missing escalation/token fields.
- Design must keep lane attribution unchanged: `sentence`, `chunk`, `lexical`, and `kg`.
- Verification should include compact-only, context-expanded, and full-fetch-escalated paths.
