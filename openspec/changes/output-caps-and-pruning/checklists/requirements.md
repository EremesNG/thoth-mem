# Requirements Quality Checklist — output-caps-and-pruning

"Unit tests for English." Every item MUST be `- [x]` or `- [-] waived: reason`
before the spec → tasks transition (gated by
`rules.requirements_quality.enforce_block`). All items are now `- [x]`: the
caps-design items previously deferred to `sdd-clarify` are resolved (default
`8000`, knob naming `maxContextChars` / `THOTH_MAX_CONTEXT_CHARS`, unbounded
sentinel `0`).

## Domain: tools

### Completeness
- [x] Bounded-output requirement covers BOTH `mem_context` and `mem_project action=summary`
- [x] Preview-by-default + `mem_get` escalation requirement is present
- [x] Per-call budget override requirement is present
- [x] Unbounded sentinel behavior requirement is present
- [x] Shared-`getContext`-layer inheritance (HTTP + CLI) requirement is present
- [x] Compact-surface requirement explicitly preserved (no tool added/removed)

### Clarity
- [x] "Bounded" is defined as a measurable character budget, not a vague limit
- [x] Escalation path (`mem_get`) is named explicitly, not implied
- [x] Distinction between default budget and per-call override is unambiguous

### Measurability
- [x] Regression baselines are quantified (~104K `mem_context`, ~74K summary)
- [x] Bound is expressed as "response length <= configured `maxContextChars`"
- [x] Shown/omitted reporting is required so the bound is measured, not claimed

### Testability
- [x] Each requirement has at least one Given/When/Then scenario
- [x] Large-store regression scenarios are independently executable
- [x] HTTP/CLI inheritance scenario is observable without per-surface code

## Domain: store

### Completeness
- [x] `Store.getContext` budget accept+enforce requirement is present
- [x] `formatObservationMarkdown` preview/truncation mode requirement is present
- [x] Existing section structure + `mem_get` pointer preservation requirement is present
- [x] Full-content rendering remains available for explicit callers

### Clarity
- [x] Budget source (config default) and override precedence are stated
- [x] Preview reuse of `truncateForPreview` (default 300) is explicit
- [x] "Distinct from input validation" boundary is clear (no save-path change)

### Measurability
- [x] Output length constraint is expressed against the supplied budget
- [x] Deterministic enforcement for identical inputs is required
- [x] Preview-length default (300) is a concrete number

### Testability
- [x] Each requirement has at least one Given/When/Then scenario
- [x] Budget-overflow, default-vs-override, and sentinel cases are separable
- [x] Preview-vs-full mode scenarios are independently assertable

## Domain: config

### Completeness
- [x] `maxContextChars` resolution order (env > persisted > default) is present
- [x] Unbounded sentinel requirement is present
- [x] `maxContentLength` input-warn-only + distinctness requirement is present
- [x] Assumptions section records applied defaults (naming, scope, sentinel)

### Clarity
- [x] Input (`maxContentLength`) vs output (`maxContextChars`) split is explicit
- [x] `THOTH_MAX_CONTEXT_CHARS` env name is stated
- [x] Final knob naming confirmed by clarify: `maxContextChars` / `THOTH_MAX_CONTEXT_CHARS`

### Measurability
- [x] Exact default `maxContextChars` value is fixed (`8000`, confirmed by clarify)
- [x] Default is constrained to "finite, positive" with aligned reference caps
- [x] Independence test (changing one knob does not affect the other) is specified

### Testability
- [x] Each requirement has at least one Given/When/Then scenario
- [x] Resolution-precedence scenarios are independently executable
- [x] Unbounded sentinel encoding fixed by clarify (`0` = "no output cap"); scenarios assert behavior
