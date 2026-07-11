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
