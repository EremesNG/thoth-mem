# Delta for Store

## ADDED Requirements

### Requirement: Store Maintenance Runs MUST Be Deterministic, Auditable, and Transactional
The store MUST provide an intra-memory maintenance lifecycle that can evaluate consolidation, reflection, and decay for saved memory records without requiring embeddings, sqlite-vec, an LLM, or a remote service. A maintenance evaluation MUST be deterministic for identical store contents and identical effective configuration. A mutating maintenance run MUST be transactional: either every selected consolidation/reflection/decay outcome is recorded, or no maintenance state is changed. A dry-run mode MUST report the exact outcomes that a matching apply run would record without mutating source memories or maintenance metadata.

#### Scenario: Dry-run previews deterministic outcomes
- GIVEN duplicate observations, related observations, and stale low-value observations in a store
- WHEN maintenance is run in dry-run mode twice with the same effective configuration
- THEN both dry-runs MUST report identical consolidation candidates, reflection candidates, decay changes, and counts
- AND no source memory or maintenance metadata MUST be changed

#### Scenario: Apply is all-or-nothing
- GIVEN a mutating maintenance run has selected consolidation, reflection, and decay outcomes
- WHEN an error occurs before the run commits
- THEN no selected outcome MUST be partially recorded
- AND the store MUST remain in its pre-run maintenance state

### Requirement: Consolidation MUST Preserve Source Memories and Provenance
When the store identifies exact or near-duplicate memories, it MUST record a consolidation outcome that reduces duplicate influence in read paths while preserving every source memory record. Consolidation MUST NOT hard-delete source observations, prompts, or session summaries. Each consolidation outcome MUST retain enough provenance to identify the selected canonical memory, the member source memories, the reason or signal class for the consolidation, and the maintenance run that recorded it.

#### Scenario: Duplicate sources remain reachable after consolidation
- GIVEN two or more observations are consolidated into one canonical outcome
- WHEN the canonical memory is returned by recall or context
- THEN duplicate source memories MUST NOT be emitted as independent equal-strength evidence by default
- AND each source memory MUST remain retrievable by its stable identifier through full-record retrieval
- AND the consolidation outcome MUST expose source provenance for audit

#### Scenario: Distinct decisions are not silently merged
- GIVEN two memories share similar wording but carry different decisions, projects, topic keys, or chronology
- WHEN consolidation evaluates them
- THEN the store MUST either keep them as separate outcomes or report them as review-required candidates
- AND it MUST NOT automatically collapse them into one canonical current memory without a defensible deterministic signal

### Requirement: Reflection Outputs MUST Be Source-Linked Durable Memory Records
When reflection synthesizes a durable learning from related memory records, the reflected output MUST be saved as a source-linked memory record with explicit provenance to its inputs, synthesis reason, and maintenance run. Reflection MUST be idempotent: rerunning reflection over unchanged inputs MUST update or reuse the same reflected output rather than creating duplicate summaries. Reflection MUST NOT require a remote model for the baseline path; optional model-assisted wording MAY be used only when configured and MUST preserve the same provenance contract.

#### Scenario: Reflection produces one stable learning for unchanged inputs
- GIVEN a stable cluster of related observations with enough signal for a durable learning
- WHEN reflection runs repeatedly with the same configuration
- THEN the store MUST produce at most one active reflected memory for that cluster
- AND the reflected memory MUST link to every source memory used to synthesize it

#### Scenario: Reflection remains safe without optional models
- GIVEN optional LLM or embedding capabilities are unavailable
- WHEN reflection runs
- THEN the baseline deterministic reflection path MUST either produce source-linked reflected memories or report that no reflection met the configured threshold
- AND the maintenance run MUST NOT fail globally solely because optional model assistance is unavailable

### Requirement: Decay MUST Be Reversible Ranking Metadata by Default
The store MUST represent decay as reversible metadata that lowers the default retrieval/context influence of stale, redundant, or low-value memories without deleting, archiving, or soft-deleting source memory records. Decay metadata MUST include the policy inputs or reason class that caused the decay, the effective decay state or score, and the maintenance run that recorded it. Disabling decay consumption MUST make read behavior match the post-C1 baseline except for separately stored reflection records.

#### Scenario: Decayed memory remains retrievable
- GIVEN a memory has been marked with decay metadata
- WHEN default recall or context ranks memories
- THEN the decayed memory SHOULD have lower influence than otherwise-equivalent current high-signal memory
- AND WHEN full-record retrieval is requested by id
- THEN the decayed memory MUST remain available with its full content and metadata

#### Scenario: Decay rollback is configuration-only
- GIVEN decay metadata exists in the store
- WHEN decay consumption is disabled in effective configuration
- THEN recall and context ranking MUST ignore the decay metadata
- AND source memory records MUST NOT require migration or rewrite to restore baseline influence

### Requirement: Maintenance Metadata MUST Preserve Portable Export/Import Semantics
The portable export/import format MUST continue to preserve user-authored prompts, observations, and session summaries. Reflected durable memories MUST be exported/imported when they are stored as normal portable memory records. Consolidation and decay metadata MUST be treated as internal, regenerable maintenance state unless a later spec explicitly version-bumps the export format. Import MUST NOT require consolidation or decay metadata to load older or newer exports successfully.

#### Scenario: Export preserves source and reflected memory records
- GIVEN source memories and reflected durable memory records exist
- WHEN portable export runs
- THEN exported data MUST include the portable source records and portable reflected records
- AND it MUST NOT require internal consolidation or decay metadata fields to be present in the export

#### Scenario: Import can regenerate internal maintenance state
- GIVEN an export lacks consolidation and decay metadata
- WHEN it is imported and maintenance is run afterward
- THEN import MUST succeed without that internal metadata
- AND maintenance MUST be able to recompute consolidation and decay outcomes from imported portable records

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **Conservative decay default:** Decay is ranking metadata by default, not archive, soft-delete, or hard-delete. Any future deletion/archival semantics need a separate spec with recoverability and export/import implications.
- **Portable boundary:** Reflected memories are portable only when stored as ordinary memory records. Consolidation and decay metadata remain internal and regenerable, so the export format does not need a version bump for this change.
- **Review-required candidates:** For ambiguous consolidation, the store may report a candidate without applying it automatically; design should preserve this safety valve for false-positive risk.
- **Reflected record shape:** Baseline reflected outputs should be stored as ordinary portable observation-like memory records with explicit maintenance provenance, not as session summaries or a new portable export record kind.
