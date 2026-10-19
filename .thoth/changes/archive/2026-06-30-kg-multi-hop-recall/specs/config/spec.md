# Delta for Config

## ADDED Requirements

### Requirement: Multi-Hop Traversal Knobs MUST Resolve Deterministically With Env Overrides
The system MUST provide configuration knobs governing entity-anchored multi-hop
KG traversal and MUST resolve each in the established precedence order: explicit
`THOTH_*` environment override, then persisted config in the resolved data dir
(`{THOTH_DATA_DIR|~/.thoth}/config.json`), then a built-in default — mirroring the
existing `graphFactsSource` and embedding resolution patterns
(`src/config.ts:426-455`). The knobs and their defaults are:

| Knob | Type | Default | Env override |
| --- | --- | --- | --- |
| `kgMultiHopEnabled` | boolean | `true` | `THOTH_KG_MULTI_HOP_ENABLED` |
| `kgMaxDepth` | integer | `2` | `THOTH_KG_MAX_DEPTH` |
| `kgNeighborhoodLimit` | integer | `50` | `THOTH_KG_NEIGHBORHOOD_LIMIT` |
| `kgMultiHopWeight` | number | `0.7` | `THOTH_KG_MULTI_HOP_WEIGHT` |
| `kgDepthDecay` | number | `0.5` | `THOTH_KG_DEPTH_DECAY` |
| `kgTraversalTimeoutMs` | integer | `50` | `THOTH_KG_TRAVERSAL_TIMEOUT_MS` |

Boolean env values MUST be parsed via the existing `parseBoolean` helper
(`src/config.ts:174`) and numeric env values via `parseNumber`
(`src/config.ts:167`). These knobs MUST be reflected in `config.schema.json` and
in the typed config surface. The resolved `kgMultiHopEnabled`, `kgMaxDepth`,
`kgNeighborhoodLimit`, `kgMultiHopWeight`, `kgDepthDecay`, and
`kgTraversalTimeoutMs` MUST govern, respectively, whether traversal runs, the
recursion depth guard, the neighborhood cap, the multi-hop effective weight, the
per-hop depth attenuation, and the coarse elapsed degrade guard described in the
retrieval and knowledge-graph deltas.

#### Scenario: Environment override wins for a multi-hop knob
- GIVEN both a persisted `kgMaxDepth` and the `THOTH_KG_MAX_DEPTH` environment
  variable are set to different values
- WHEN the effective config is computed
- THEN the environment value MUST take precedence for `kgMaxDepth`

#### Scenario: Persisted value is used when environment is unset
- GIVEN no `THOTH_KG_*` environment override for a knob is set
- WHEN persisted config contains a value for that knob
- THEN the effective value MUST match the persisted value

#### Scenario: Built-in defaults apply when unset everywhere
- GIVEN neither an environment override nor a persisted value is present for the
  multi-hop knobs
- WHEN the effective config is computed
- THEN `kgMultiHopEnabled` MUST be `true`, `kgMaxDepth` MUST be `2`,
  `kgNeighborhoodLimit` MUST be `50`, `kgMultiHopWeight` MUST be `0.7`,
  `kgDepthDecay` MUST be `0.5`, and `kgTraversalTimeoutMs` MUST be `50`

#### Scenario: Disabling the flag is the rollback switch
- GIVEN `kgMultiHopEnabled` is resolved to `false` (via env or persisted config)
- WHEN retrieval runs
- THEN multi-hop traversal MUST NOT execute (mirroring the B1 `graphFactsSource`
  config-toggle rollback discipline)

### Requirement: Multi-Hop Relation Allow-List MUST Be Configurable and Default to the Structural Set
The system MUST provide a configurable relation allow-list that governs which
`kg_triples.relation` values traversal follows, resolved with the same
env>persisted>default precedence. The built-in default MUST be the 18 structural
relations enumerated in the knowledge-graph delta
(`USES`, `DEPENDS_ON`, `BELONGS_TO`, `PART_OF`, `OWNS`, `CONFIGURES`,
`IMPLEMENTS`, `RUNS_IN`, `DEPLOYS_TO`, `CAUSES`, `FIXES`, `BLOCKS`, `UNBLOCKS`,
`AFFECTS`, `REFERENCES`, `AUTHENTICATES_WITH`, `PRECEDES`, `FOLLOWS`), excluding
the 8 metadata/synthetic relations
(`HAS_WHAT`, `HAS_WHY`, `HAS_WHERE`, `HAS_LEARNED`, `HAS_TOPIC`, `HAS_SCOPE`,
`MENTIONS`, `EXTRACTED_FROM`). The setting MUST be an allow-list (fail-safe: an
unrecognized or empty configured value MUST NOT silently traverse the excluded
metadata relations). A `THOTH_*` environment override MUST be supported and parsed
deterministically (e.g. a delimited relation list).

#### Scenario: Default allow-list follows only structural relations
- GIVEN no relation-allow-list override is configured
- WHEN the effective allow-list is resolved
- THEN it MUST contain exactly the 18 structural relations and MUST NOT contain
  any of the 8 excluded metadata/synthetic relations

#### Scenario: Configured allow-list overrides the default
- GIVEN a persisted or environment relation allow-list that differs from the
  default
- WHEN the effective allow-list is resolved
- THEN it MUST match the configured set rather than the built-in default

#### Scenario: Empty or invalid configured allow-list fails safe
- GIVEN a configured relation allow-list that is empty or contains no recognized
  relation
- WHEN the effective allow-list is resolved
- THEN traversal MUST NOT fall back to following the excluded metadata relations
  (it follows fewer edges, never more)

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **CL-5 (RESOLVED — `kgMultiHopEnabled` default `true`, eval-gated):** Default ON,
  gated on the no-regression eval (evals delta). On observed regression the
  default flips to `false`. Rollback is the flag, mirroring B1 `graphFactsSource`.
- **CL-2/CL-3 (RESOLVED — weight `0.7`, decay `0.5`):** `kgMultiHopWeight = 0.7`
  and `kgDepthDecay = 0.5` are the encoded defaults consumed by the retrieval
  delta's fusion/attenuation requirements.
- **CL-4 (RESOLVED — `kgTraversalTimeoutMs = 50` is a coarse guard, not an async
  timeout):** Because `better-sqlite3` is synchronous, `kgTraversalTimeoutMs`
  governs a measured-elapsed guard around the bounded traversal, not a mid-query
  interrupt. The deterministic cost ceiling (`kgMaxDepth` +
  `kgNeighborhoodLimit` + relation filtering) is the primary bound.
- **CL-6 (RESOLVED — structural allow-list):** The default 18/8 split partitions
  the actual 26 `KG_RELATION_TYPES` (`src/indexing/kg-extractor.ts:11-15`)
  exactly; `IN_PROJECT`/`HAS_TYPE`/`HAS_TOPIC_KEY` are adapter-synthesized, not
  real relations, so they are not part of the allow/deny partition.
- **Knob placement (design decision, code-grounded):** The knobs live most
  naturally either inside `RetrievalDefaults` (`src/config.ts:7-13`, DUPLICATED in
  `src/retrieval/sqlite-vec.ts:10`) or in a new dedicated `knowledgeGraph` config
  block; design decides. If they land in `RetrievalDefaults`, BOTH duplicated
  copies MUST stay in sync (as B1 did). This spec requires deterministic
  resolution + env override regardless of the chosen home.
- **Scope guard:** No MCP tool, HTTP route, or CLI command is added or changed by
  these config knobs (constitution **P1/P3**); they are resolution-layer additions
  consumed internally by retrieval.
