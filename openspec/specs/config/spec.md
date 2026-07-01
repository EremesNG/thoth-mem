# Delta for Config

## ADDED Requirements
### Requirement: Embedding Configuration Resolution MUST Be Deterministic
The system MUST resolve embedding settings in this precedence order: explicit `THOTH_*` environment overrides, then persisted config in the resolved data dir (`{THOTH_DATA_DIR|~/.thoth}/config.json`), then local fallback when no provider is configured.

#### Scenario: Environment overrides win
- GIVEN both persisted config and `THOTH_*` embedding variables are present
- WHEN effective embedding configuration is computed
- THEN environment values MUST take precedence for overlapping fields

#### Scenario: Persisted config is used when environment is unset
- GIVEN no embedding-related environment overrides are set
- WHEN persisted config contains embedding provider settings
- THEN effective embedding configuration MUST match persisted config

#### Scenario: Local fallback is used only when provider is unset
- GIVEN no embedding provider is configured in environment or persisted config
- WHEN embedding configuration is computed
- THEN local Transformers.js fallback SHALL be selected

### Requirement: Embedding Metadata MUST Be Canonical for Index Lineage
The system MUST derive stable metadata for active embedding configuration, including provider, model, dimensions, and deterministic config hash used by semantic index lineage/rebuild detection.

#### Scenario: Config hash remains stable for equivalent config
- GIVEN two logically equivalent embedding configurations
- WHEN metadata is computed
- THEN the derived config hash MUST be identical

#### Scenario: Config hash changes when embedding identity changes
- GIVEN provider/model/dimensions settings change
- WHEN metadata is recomputed
- THEN the derived config hash MUST change

### Requirement: Context Output Budget MUST Be Configurable With Deterministic Resolution
The system MUST provide a context/summary OUTPUT character-budget setting
(working name `maxContextChars`) and MUST resolve it in this precedence order:
explicit `THOTH_*` environment override (working name `THOTH_MAX_CONTEXT_CHARS`),
then persisted config in the resolved data dir
(`{THOTH_DATA_DIR|~/.thoth}/config.json`), then a built-in default. The resolved
value MUST govern the bound enforced by `Store.getContext` and therefore by
`mem_context`, `mem_project action=summary`, and the HTTP/CLI summary surfaces.
The built-in default `maxContextChars` MUST be `8000`: a finite, positive
character count aligned with the existing capped retrieval patterns (`mem_recall`
`MAX_CONTEXT_CHARS=6000`; `formatContextResults` `maxChars=4000`;
`formatProjectGraph` `maxChars=6000`) and set modestly above `mem_recall`'s
`6000` because context/summary output aggregates multiple recent observations
(recent sessions, prompts, observation previews, and memory stats) in one render.
The default MUST be a single documented value; per-surface default divergence
MUST NOT be introduced (per-call override is provided separately below).

#### Scenario: Environment override wins for the output budget
- GIVEN both a persisted `maxContextChars` and the `THOTH_MAX_CONTEXT_CHARS`
  environment variable are set
- WHEN the effective output budget is computed
- THEN the environment value MUST take precedence

#### Scenario: Persisted value is used when environment is unset
- GIVEN no `THOTH_MAX_CONTEXT_CHARS` environment override is set
- WHEN persisted config contains a `maxContextChars` value
- THEN the effective output budget MUST match the persisted value

#### Scenario: Built-in default applies when unset everywhere
- GIVEN neither an environment override nor a persisted value is present
- WHEN the effective output budget is computed
- THEN the finite, positive built-in default of `8000` MUST be applied

#### Scenario: Per-call override supersedes the resolved default without persisting
- GIVEN a resolved default `maxContextChars` (from env, persisted config, or the
  built-in default)
- WHEN a caller supplies an explicit per-call output budget to `mem_context` or
  `mem_project action=summary`
- THEN that per-call value MUST govern the bound for that invocation only
- AND the resolved default MUST be unchanged for subsequent calls (the override
  MUST NOT mutate persisted configuration)

### Requirement: Context Output Budget MUST Support An Unbounded Sentinel
The output-budget configuration MUST support the explicit, documented sentinel
value `0`, meaning "no output cap", that disables the bound (restoring full-dump
output) for rollback and debugging. The sentinel `0` MUST be selectable only by
an explicit configured value (via `THOTH_MAX_CONTEXT_CHARS` or persisted config)
and MUST NOT be the default; because the default is finite and positive (`8000`),
the sentinel is never reached by default. When `0` is resolved, `Store.getContext`
MUST NOT truncate output by the budget.

#### Scenario: Sentinel disables the output bound
- GIVEN the unbounded sentinel `0` is configured (via environment or persisted
  config)
- WHEN the effective output budget is resolved and applied
- THEN context/summary output MUST NOT be truncated by `maxContextChars`
- AND WHEN the sentinel is absent
- THEN the finite resolved budget MUST be enforced

### Requirement: maxContentLength MUST Be Input-Validation Warn-Only And Distinct From The Output Cap
The existing `maxContentLength` setting (default 100000) MUST be defined at the
spec level as an INPUT-validation, save-time concern that WARNS and MUST NOT
silently truncate written content (the behavior already implemented by
`validateContentLength`, `src/utils/content.ts:14-26`, surfaced through
`src/config.ts`). `maxContentLength` MUST remain conceptually and operationally
DISTINCT from `maxContextChars`: `maxContentLength` governs the size of content
on the way IN (write/save validation), while `maxContextChars` governs the size
of rendered context on the way OUT (read/retrieval). The two MUST NOT be
conflated, and changing one MUST NOT change the behavior governed by the other.

#### Scenario: Oversized save warns without truncation
- GIVEN content longer than `maxContentLength` is saved
- WHEN the content is validated at save time
- THEN a warning MUST be produced advising the content is large
- AND the stored content MUST NOT be silently truncated

#### Scenario: Input and output knobs are independent
- GIVEN `maxContextChars` is changed
- WHEN content is saved
- THEN save-time `maxContentLength` validation behavior MUST be unchanged
- AND GIVEN `maxContentLength` is changed
- WHEN context/summary output is rendered
- THEN the `maxContextChars` output bound MUST be unchanged

## MODIFIED Requirements

## REMOVED Requirements

## ADDED Requirements (kg-multi-hop-recall, B2)

### Requirement: Multi-Hop Traversal Knobs MUST Resolve Deterministically With Env Overrides
The system MUST provide configuration knobs governing entity-anchored multi-hop KG traversal and MUST resolve each in the established precedence order: explicit `THOTH_*` environment override, then persisted config in the resolved data dir (`{THOTH_DATA_DIR|~/.thoth}/config.json`), then a built-in default — mirroring the existing `graphFactsSource` and embedding resolution patterns. The knobs and their defaults are:

| Knob | Type | Default | Env override |
| --- | --- | --- | --- |
| `kgMultiHopEnabled` | boolean | `true` | `THOTH_KG_MULTI_HOP_ENABLED` |
| `kgMaxDepth` | integer | `2` | `THOTH_KG_MAX_DEPTH` |
| `kgNeighborhoodLimit` | integer | `50` | `THOTH_KG_NEIGHBORHOOD_LIMIT` |
| `kgMultiHopWeight` | number | `0.7` | `THOTH_KG_MULTI_HOP_WEIGHT` |
| `kgDepthDecay` | number | `0.5` | `THOTH_KG_DEPTH_DECAY` |
| `kgTraversalTimeoutMs` | integer | `50` | `THOTH_KG_TRAVERSAL_TIMEOUT_MS` |
| `kgRelationAllowList` | string[] | 18 structural relations | `THOTH_KG_RELATION_ALLOW_LIST` |

Boolean env values MUST be parsed via the existing `parseBoolean` helper and numeric env values via `parseNumber`. The resolved knobs MUST govern whether traversal runs, recursion depth, neighborhood cap, effective sub-source weight, per-hop decay, and coarse elapsed guard behavior in the retrieval layer.

#### Scenario: Environment override wins for a multi-hop knob
- GIVEN both a persisted multi-hop knob value and its matching `THOTH_*` environment variable are set to different values
- WHEN the effective config is computed
- THEN the environment value MUST take precedence

#### Scenario: Persisted value is used when environment is unset
- GIVEN no environment override for a knob is set
- WHEN persisted config contains a value
- THEN the effective config MUST match the persisted value

#### Scenario: Built-in defaults apply when unset everywhere
- GIVEN neither an environment override nor a persisted value is present
- WHEN the effective config is computed
- THEN `kgMultiHopEnabled` MUST be `true`, `kgMaxDepth` MUST be `2`, `kgNeighborhoodLimit` MUST be `50`, `kgMultiHopWeight` MUST be `0.7`, `kgDepthDecay` MUST be `0.5`, `kgTraversalTimeoutMs` MUST be `50`, and `kgRelationAllowList` MUST default to the 18 structural relations

#### Scenario: Empty or invalid configured allow-list fails safe
- GIVEN a configured relation allow-list that is empty or contains no recognized relation
- WHEN the effective allow-list is resolved
- THEN traversal MUST NOT fall back to excluded metadata/synthetic relations

### Requirement: Multi-Hop Relation Allow-List MUST Be Configurable and Default to the Structural Set
The system MUST provide a configurable allow-list for traversal relations, parsed with the same env>persisted>default precedence. The default MUST be the 18 structural relations (`USES`, `DEPENDS_ON`, `BELONGS_TO`, `PART_OF`, `OWNS`, `CONFIGURES`, `IMPLEMENTS`, `RUNS_IN`, `DEPLOYS_TO`, `CAUSES`, `FIXES`, `BLOCKS`, `UNBLOCKS`, `AFFECTS`, `REFERENCES`, `AUTHENTICATES_WITH`, `PRECEDES`, `FOLLOWS`) and MUST exclude the 8 metadata/synthetic relations.

#### Scenario: Default allow-list follows only structural relations
- GIVEN no relation-allow-list override is configured
- WHEN the effective allow-list is resolved
- THEN it MUST contain exactly the 18 structural relations and MUST NOT contain excluded relations

#### Scenario: Configured allow-list overrides the default
- GIVEN a persisted or environment relation allow-list differs from the default
- WHEN the effective allow-list is resolved
- THEN it MUST match the configured set rather than the built-in default


## ADDED Requirements (kg-supersedes-edges, B3)


> Sub-change **B3** (`kg-supersedes-edges`). Adds supersession knobs to the
> `KnowledgeGraphConfig` block (`src/config.ts:39-47`), resolved with the
> established env > persisted > default precedence (the B2 pattern,
> `resolveKnowledgeGraphConfig`, `src/config.ts:447-474`), and mirrored in
> `config.schema.json`.

## ADDED Requirements

### Requirement: Supersession Knobs MUST Resolve Deterministically With Env Overrides
The system MUST provide configuration knobs governing KG supersession on the
`KnowledgeGraphConfig` block and MUST resolve each in the established precedence
order: explicit `THOTH_*` environment override, then persisted config in the
resolved data dir (`{THOTH_DATA_DIR|~/.thoth}/config.json`), then a built-in
default — mirroring the existing multi-hop and embedding resolution patterns.
Boolean env values MUST be parsed via the existing `parseBoolean` helper and
numeric env values via `parseNumber`. The knobs and their defaults are:

| Knob | Type | Default | Env override |
| --- | --- | --- | --- |
| `kgSupersedeEnabled` | boolean | `true` | `THOTH_KG_SUPERSEDE_ENABLED` |
| `kgSupersedeContentPatterns` | boolean | `false` | `THOTH_KG_SUPERSEDE_CONTENT_PATTERNS` |
| `kgSupersedeConfidenceThreshold` | number | `0.8` | `THOTH_KG_SUPERSEDE_CONFIDENCE_THRESHOLD` |
| `kgSupersedeDeprioritizeWeight` | number | `0.5` | `THOTH_KG_SUPERSEDE_DEPRIORITIZE_WEIGHT` |

`kgSupersedeEnabled` is the master flag: when false, NO supersession detection,
write, deprioritization, or current-state view applies, and behavior is
byte-identical to pre-B3. `kgSupersedeContentPatterns` gates the optional
lower-confidence content-pattern detector (the primary per-observation diff
signal is unaffected by it). `kgSupersedeConfidenceThreshold` is the minimum
confidence at or above which a content-pattern hint contributes a supersession
marking.
`kgSupersedeDeprioritizeWeight` is the retrieval down-weight applied to superseded
KG evidence (a multiplier in `[0,1)` so superseded facts rank below current
facts).

#### Scenario: Environment override wins for a supersession knob
- GIVEN both a persisted supersession knob value and its matching `THOTH_*`
  environment variable are set to different values
- WHEN the effective config is computed
- THEN the environment value MUST take precedence

#### Scenario: Persisted value is used when environment is unset
- GIVEN no environment override for a knob is set
- WHEN persisted config contains a value
- THEN the effective config MUST match the persisted value

#### Scenario: Built-in defaults apply when unset everywhere
- GIVEN neither an environment override nor a persisted value is present
- WHEN the effective config is computed
- THEN `kgSupersedeEnabled` MUST be `true`, `kgSupersedeContentPatterns` MUST be
  `false`, `kgSupersedeConfidenceThreshold` MUST be `0.8`, and
  `kgSupersedeDeprioritizeWeight` MUST be `0.5`

### Requirement: Supersession Master Flag MUST Gate All B3 Behavior
The `kgSupersedeEnabled` master flag MUST gate ALL B3 behavior end to end:
detection on save, the supersession write, retrieval deprioritization (direct and
multi-hop), and the `mem_project action=graph` current-state default. When the
flag resolves to false, every B3 behavior MUST be inert and observable output
MUST be byte-identical to pre-B3.

#### Scenario: Master flag off makes all B3 behavior inert
- GIVEN `kgSupersedeEnabled` resolves to false
- WHEN observations are saved and retrieval/graph reads run
- THEN no supersession is detected, written, or applied anywhere
- AND observable output MUST be byte-identical to pre-B3

#### Scenario: Content-pattern flag is independent of the master flag
- GIVEN `kgSupersedeEnabled` is true and `kgSupersedeContentPatterns` is false
- WHEN an observation with a supersession phrase is saved
- THEN deterministic per-observation diff supersession MUST still apply
- AND no content-pattern supersession marking MUST be created

### Requirement: `config.schema.json` MUST Document the Supersession Knobs
The persisted-config JSON schema (`config.schema.json`) MUST document the four
supersession knobs under the `knowledgeGraph` object with their types and
defaults, consistent with how the B2 multi-hop knobs are documented, so persisted
configuration validates and is discoverable.

#### Scenario: Schema validates a config carrying supersession knobs
- GIVEN a persisted config that sets the supersession knobs under `knowledgeGraph`
- WHEN the config is validated against `config.schema.json`
- THEN validation MUST succeed and the knobs MUST be recognized properties

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **CL-3 / CL-7 (RESOLVED — threshold + version):** The default confidence
  threshold for content-pattern supersession is `0.8` (HIGH, conservative, below
  the primary per-observation diff signal). B3 is a MINOR, additive,
  backward-compatible config addition (new optional knobs; absent knobs fall back
  to defaults).
- **FLAG-GATING (RESOLVED — default ON, eval-gated):** `kgSupersedeEnabled`
  defaults to `true`, gated by the eval no-regression gate (the same discipline
  B2 used for `kgMultiHopEnabled`). If the no-regression gate fails with
  supersession ON, the documented default flips to `false`.
- **Knob naming (working names):** `kgSupersedeEnabled`,
  `kgSupersedeContentPatterns`, `kgSupersedeConfidenceThreshold`, and
  `kgSupersedeDeprioritizeWeight` are working names placed on the existing
  `KnowledgeGraphConfig` block (`src/config.ts:39-47`); precise field names are a
  design decision. The spec requires only the four knobs, their semantics, their
  defaults, and env > persisted > default resolution via `resolveKnowledgeGraphConfig`
  (`src/config.ts:447-474`).
- **Deprioritize-weight semantics:** `kgSupersedeDeprioritizeWeight` is the
  retrieval down-weight feeding the store/retrieval deltas (multiplier in `[0,1)`).
  Setting it to a neutral value (per the proposal's "detection-only kill switch"
  rollback note) restores legacy ranking even when supersession edges exist.

## Delta from kg-superseded-pruning

# Delta for Config

> Change **C1** (`kg-superseded-pruning`). Adds bounded-retention knobs to the
> `KnowledgeGraphConfig` block (`src/config.ts:39-51`), resolved with the
> established env > persisted > default precedence (the B2/B3 pattern,
> `resolveKnowledgeGraphConfig`, `src/config.ts:455-498`), and mirrored in
> `config.schema.json` (`knowledgeGraph`, `additionalProperties: false`, so the
> schema MUST be extended). C1 bounds the growth of the superseded rows B3 began
> retaining; every C1 knob is inert unless BOTH the C1 master flag AND B3's
> `kgSupersedeEnabled` are on.

## ADDED Requirements

### Requirement: Pruning Knobs MUST Resolve Deterministically With Env Overrides
The system MUST provide configuration knobs governing bounded retention (pruning)
of superseded KG triples on the `KnowledgeGraphConfig` block and MUST resolve each
in the established precedence order: explicit `THOTH_*` environment override, then
persisted config in the resolved data dir (`{THOTH_DATA_DIR|~/.thoth}/config.json`),
then a built-in default — mirroring the existing supersession (B3) and multi-hop
(B2) resolution patterns. Boolean env values MUST be parsed via the existing
`parseBoolean` helper and numeric env values via `parseNumber`. The knobs and
their defaults are:

| Knob | Type | Default | Env override |
| --- | --- | --- | --- |
| `kgPruneEnabled` | boolean | `true` | `THOTH_KG_PRUNE_ENABLED` |
| `kgSupersededKeepN` | integer | `10` | `THOTH_KG_SUPERSEDED_KEEP_N` |
| `kgPruneOrphanEntities` | boolean | `true` | `THOTH_KG_PRUNE_ORPHAN_ENTITIES` |

`kgPruneEnabled` is the C1 master flag that gates the AUTOMATIC incremental
enforcement path (see the knowledge-graph and store deltas). It defaults to `true`,
mirroring B3's default-ON-gated-by-eval precedent (`kgSupersedeEnabled: true`,
`src/config.ts:169`): shipping ON is CONDITIONAL on the eval no-regression gate
passing (0% regression on the existing + B2 multi-hop + B3 supersession fixtures —
see the evals delta). If that gate regresses, the feature MUST ship with
`kgPruneEnabled` default `false` and the decision MUST be documented; the manual
`prune-graph` op remains available regardless of the flag. `kgSupersededKeepN`
is the number of most-recent superseded triples retained per fact slot; it MUST be
a non-negative integer, has a GLOBAL default of `10` that is OVERRIDABLE PER
PROJECT via persisted config (the same env > persisted > default mechanism as the
other KG knobs), and governs BOTH the automatic path and the manual `prune-graph`
op. `kgPruneOrphanEntities` gates the explicit orphaned-`kg_entities`
cleanup that accompanies a prune (the FK cascade is entity→triple only, not
triple→entity — `src/store/schema.ts:213-214` — so orphan cleanup is not
automatic); when disabled, triple pruning still occurs but orphaned entity rows
are left in place.

#### Scenario: Environment override wins for a pruning knob
- GIVEN both a persisted pruning knob value and its matching `THOTH_*` environment
  variable are set to different values
- WHEN the effective config is computed
- THEN the environment value MUST take precedence

#### Scenario: Persisted value is used when environment is unset
- GIVEN no environment override for a knob is set
- WHEN persisted config contains a value
- THEN the effective config MUST match the persisted value

#### Scenario: Built-in defaults apply when unset everywhere
- GIVEN neither an environment override nor a persisted value is present
- WHEN the effective config is computed
- THEN `kgPruneEnabled` MUST be `true`, `kgSupersededKeepN` MUST be `10`, and
  `kgPruneOrphanEntities` MUST be `true`

#### Scenario: keep-N default is overridable per project
- GIVEN the global built-in default for `kgSupersededKeepN` is `10`
- AND a specific project's persisted config sets `kgSupersededKeepN` to a different
  value
- WHEN the effective config is computed for that project
- THEN the resolved `kgSupersededKeepN` MUST match the project's persisted value
- AND projects without a persisted override MUST resolve to the global default `10`

#### Scenario: keep-N of zero is a valid configured value
- GIVEN `kgSupersededKeepN` is configured to `0`
- WHEN the effective config is computed
- THEN the resolved value MUST be `0` (retain no superseded history per slot;
  current facts are still never pruned — see the knowledge-graph delta)
- AND resolution MUST NOT silently substitute a different default

### Requirement: Pruning Master Flag MUST Gate Only the Automatic Path and Compose With B3
The `kgPruneEnabled` master flag MUST gate the AUTOMATIC incremental enforcement
path end to end: when it resolves to false, no incremental keep-N enforcement runs
during normal supersession, no orphan cleanup runs on the write path, no extra
query is issued on the hot supersession path, and behavior is byte-identical to
pre-C1. Because C1 only bounds rows that B3 creates, the automatic path MUST be
inert when EITHER `kgPruneEnabled` is false OR B3's `kgSupersedeEnabled`
(`src/config.ts:169`) is false. The manual `prune-graph` admin op (see the
indexing delta) is an explicit operator action and MUST remain available for
inspection/dry-run regardless of `kgPruneEnabled`, but it MUST still perform no
deletion when `kgSupersedeEnabled` is off (there is no supersession lifecycle to
bound).

#### Scenario: Automatic path off is byte-identical to pre-C1
- GIVEN `kgPruneEnabled` resolves to false
- WHEN observations are saved, updated, upserted, or rebuilt
- THEN no incremental keep-N enforcement or orphan cleanup MUST run
- AND no extra query MUST be issued on the supersession write path
- AND observable behavior MUST be byte-identical to pre-C1

#### Scenario: Automatic path is inert when supersession is disabled
- GIVEN `kgPruneEnabled` is true but B3's `kgSupersedeEnabled` is false
- WHEN observations are saved or rebuilt
- THEN no automatic pruning MUST occur (there are no superseded rows to bound)
- AND behavior MUST be byte-identical to pre-C1

### Requirement: The Shipped Master-Flag Default MUST Be Gated by the Eval No-Regression Gate
The shipped default of `kgPruneEnabled` MUST be `true` (feature ON by default),
CONDITIONAL on the eval no-regression gate passing. The no-regression gate is 0%
regression on the existing retrieval fixtures plus the B2 multi-hop and B3
supersession fixtures with pruning ON versus OFF (see the evals delta). If the gate
passes, the feature MUST ship with `kgPruneEnabled` default `true`. If the gate
regresses, the feature MUST ship with `kgPruneEnabled` default `false` and the
fallback decision MUST be documented. The manual `prune-graph` op MUST remain
available regardless of the resolved default.

#### Scenario: Default ships ON when the eval gate passes
- GIVEN the eval no-regression gate reports 0% regression with pruning ON versus OFF
- WHEN the shipped built-in default for `kgPruneEnabled` is set
- THEN `kgPruneEnabled` MUST default to `true`

#### Scenario: Default falls back to OFF when the eval gate regresses
- GIVEN the eval no-regression gate reports any regression with pruning ON
- WHEN the shipped built-in default for `kgPruneEnabled` is set
- THEN `kgPruneEnabled` MUST default to `false`
- AND the fallback decision MUST be documented
- AND the manual `prune-graph` op MUST remain available

### Requirement: `config.schema.json` MUST Document the Pruning Knobs
The persisted-config JSON schema (`config.schema.json`, `knowledgeGraph` object,
`additionalProperties: false`) MUST document the three pruning knobs with their
types and defaults, consistent with how the B2 multi-hop and B3 supersession knobs
are documented, so persisted configuration that sets them validates and is
discoverable.

#### Scenario: Schema validates a config carrying pruning knobs
- GIVEN a persisted config that sets the pruning knobs under `knowledgeGraph`
- WHEN the config is validated against `config.schema.json`
- THEN validation MUST succeed and the knobs MUST be recognized properties

#### Scenario: Schema still rejects unknown knowledgeGraph properties
- GIVEN `knowledgeGraph` declares `additionalProperties: false`
- WHEN a persisted config sets an unrecognized property under `knowledgeGraph`
- THEN validation MUST fail, confirming the pruning knobs were added as explicit
  properties rather than by relaxing the schema

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **Knob naming (working names):** `kgPruneEnabled`, `kgSupersededKeepN`, and
  `kgPruneOrphanEntities` are working names placed on the existing
  `KnowledgeGraphConfig` block (`src/config.ts:39-51`); precise field names are a
  design decision. The spec requires only the three knobs, their semantics, their
  defaults, and env > persisted > default resolution via
  `resolveKnowledgeGraphConfig` (`src/config.ts:455-498`) with the new
  `THOTH_KG_*` env names.
- **Decision — master-flag default ON, gated by eval (clarify):** `kgPruneEnabled`
  defaults to `true`, gated by the eval no-regression gate, mirroring B3's
  default-ON-gated-by-eval precedent. Although C1 DELETES rows (B3 only MARKED),
  the retained keep-N window plus the transactional, deterministic, dry-run-backed
  prune make shipping ON acceptable once the eval gate confirms 0% regression.
  Fallback: if the eval gate regresses, ship `kgPruneEnabled` default `false` and
  document the decision; the manual `prune-graph` op is available either way. This
  resolves the former master-flag-default fork.
- **Decision — keep-N default `10`, global default overridable per project
  (clarify):** `kgSupersededKeepN` defaults to `10` — a window large enough to
  retain useful recent supersession history while bounding growth — resolved as a
  GLOBAL default that is OVERRIDABLE PER PROJECT through persisted config, using the
  same env > persisted > default mechanism as the other KG knobs. This resolves the
  former keep-N default + scope fork.
- **Orphan-cleanup default ON:** `kgPruneOrphanEntities` defaults ON because
  leaving `kg_entities` rows with zero referencing triples after a prune would
  contradict Success Criterion 3 (post-prune referential integrity). It is exposed
  as a knob only so operators can disable the extra cleanup query if desired;
  disabling it is not the default and does not affect triple pruning correctness.
- **Neutral kill switch:** Setting `kgPruneEnabled` off is a complete, config-only
  rollback of the automatic path with no migration (Success Criterion 4); the
  manual op remains for explicit, operator-initiated pruning.

## Decisions (resolved in clarify)
- **C1 master-flag default (was: default-OFF vs default-ON-gated-by-eval fork) —
  RESOLVED:** `kgPruneEnabled` ships default `true`, gated by the eval no-regression
  gate (0% regression on existing + B2 multi-hop + B3 supersession fixtures),
  mirroring B3's default-ON-gated-by-eval pattern. Fallback: if the gate regresses,
  ship default `false` and document the decision. The manual `prune-graph` op is
  available regardless. Encoded above in the knobs table, the "Built-in defaults"
  scenario, and the "Shipped Master-Flag Default MUST Be Gated by the Eval
  No-Regression Gate" requirement.
- **`kgSupersededKeepN` default + scope (was: N default + global-vs-per-project
  fork) — RESOLVED:** default `10`, resolved as a GLOBAL default OVERRIDABLE PER
  PROJECT via persisted config (env > persisted > default). Encoded above in the
  knobs table, the resolution narrative, and the "keep-N default is overridable per
  project" scenario.


