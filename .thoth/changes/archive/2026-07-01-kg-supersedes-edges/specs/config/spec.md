# Delta for Config

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
