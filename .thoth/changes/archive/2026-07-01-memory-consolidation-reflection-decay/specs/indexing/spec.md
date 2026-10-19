# Delta for Indexing

## ADDED Requirements

### Requirement: Maintenance Entry Points MUST Reuse Admin Boundaries and Stay Outside MCP Registration
The system MUST expose maintenance execution and inspection through operator/admin boundaries consistent with existing rebuild/prune operations. Manual maintenance SHOULD be invocable through CLI and HTTP admin routes when implemented, and MUST NOT add a new MCP tool. The entry point MUST support dry-run and scoped execution before mutating maintenance state.

#### Scenario: Operator previews maintenance before applying
- GIVEN an operator requests a maintenance run for all memories or a project scope
- WHEN the request is made with dry-run enabled
- THEN the system MUST report consolidation candidates, reflection candidates, decay changes, and counts
- AND no maintenance metadata or memory record MUST be changed

#### Scenario: Maintenance is not registered as an MCP tool
- GIVEN the MCP server registers workflow tools
- WHEN clients list available tools after maintenance entry points are added
- THEN no maintenance-specific MCP tool MUST appear
- AND the compact MCP registry MUST remain unchanged

### Requirement: Automatic Maintenance MUST Be Bounded, Idempotent, and Disableable
If automatic maintenance is enabled, it MUST run as bounded background or explicit job work that does not block ordinary save/update/upsert responsiveness. Automatic maintenance MUST be idempotent and retryable, MUST converge without duplicate reflected outputs or duplicate consolidation outcomes, and MUST be fully disableable through configuration so write and retrieval behavior can match the post-C1 baseline aside from existing stored reflected records.

#### Scenario: Save responsiveness is preserved
- GIVEN automatic maintenance is enabled
- WHEN a memory is saved or updated
- THEN the save operation MUST complete without waiting for consolidation, reflection, or decay work to finish
- AND pending maintenance state MUST be explicit where exposed

#### Scenario: Retried maintenance job converges
- GIVEN a maintenance job is interrupted after selecting candidates but before completion
- WHEN the job is retried with the same inputs and configuration
- THEN it MUST converge to the same recorded outcomes without duplicate reflected memories or duplicate consolidation records

### Requirement: Maintenance MUST Degrade Safely When Semantic or Model Capabilities Are Unavailable
Maintenance candidate generation MUST use deterministic signals first and MAY use semantic, sqlite-vec, KG, or optional model-assisted signals only when available. If optional signals are unavailable, stale, timed out, or degraded, maintenance MUST continue with deterministic signals or report a lane-specific degraded state. A missing optional signal MUST NOT cause source memory writes, lexical retrieval, or graph/KG paths to fail globally.

#### Scenario: Optional semantic lane is unavailable
- GIVEN sqlite-vec or embeddings are unavailable
- WHEN maintenance candidate generation runs
- THEN deterministic exact, topic-key, lexical, chronology, and KG-compatible signals MUST remain usable
- AND the run MUST report semantic candidate generation as degraded rather than failing globally

#### Scenario: Optional model reflection is unavailable
- GIVEN model-assisted reflection is configured but unavailable
- WHEN reflection runs
- THEN deterministic reflection behavior MUST still run or report no eligible reflections
- AND the run MUST NOT create unprovenanced or model-dependent outputs without source links

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **Manual first, automatic bounded:** Design should preserve a manual dry-run/apply path even if automatic jobs are added, because the proposal calls out operator review controls and false-positive risk.
- **Admin placement:** CLI + HTTP admin surfaces are the preferred trigger/inspection pattern; MCP remains workflow-level.
- **Scoped execution boundaries:** Initial maintenance scopes should be bounded to all memories, a project, or a topic key/prefix. Arbitrary query predicates or direct SQL-like filters are not required for this change.
