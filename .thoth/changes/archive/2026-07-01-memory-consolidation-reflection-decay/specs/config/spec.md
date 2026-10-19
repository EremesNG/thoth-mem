# Delta for Config

## ADDED Requirements

### Requirement: Maintenance Configuration MUST Resolve Deterministically With Env Overrides
The system MUST provide additive configuration for memory maintenance and MUST resolve each setting in the established precedence order: explicit `THOTH_*` environment override, then persisted config in the resolved data dir, then built-in defaults. Configuration MUST cover at least maintenance enablement, dry-run/apply behavior, consolidation thresholds, reflection enablement and limits, decay enablement and policy, automatic trigger enablement, and maintenance read-path consumption. Invalid configured values MUST fail safe by disabling the affected optional maintenance behavior or falling back to a documented conservative default.

#### Scenario: Environment override wins for maintenance settings
- GIVEN a persisted maintenance setting and a matching `THOTH_*` environment override are both present
- WHEN effective configuration is computed
- THEN the environment value MUST take precedence for that setting

#### Scenario: Defaults are conservative when unset
- GIVEN no maintenance settings are configured
- WHEN effective configuration is computed
- THEN automatic mutating maintenance MUST NOT run by default
- AND manual dry-run MUST be available where the maintenance entry point is available
- AND read-path maintenance consumption MUST use documented conservative defaults

### Requirement: Maintenance MUST Be Disableable Without Migration
The configuration MUST provide a rollback path that disables automatic maintenance and disables read-path consumption of consolidation/decay metadata without requiring destructive migration. Disabling maintenance MUST NOT delete reflected memories or maintenance metadata; it MUST only stop new automatic outcomes and stop maintenance-specific ranking/suppression effects.

#### Scenario: Disablement stops automatic outcomes
- GIVEN automatic maintenance has previously been enabled
- WHEN maintenance enablement is turned off
- THEN no new automatic consolidation, reflection, or decay outcome MUST be recorded
- AND existing memory records MUST remain intact

#### Scenario: Read-path consumption can be disabled independently
- GIVEN consolidation and decay metadata exists
- WHEN read-path maintenance consumption is disabled
- THEN retrieval and context assembly MUST ignore that metadata
- AND the metadata MUST remain available for audit or later re-enable

### Requirement: Decay Policy Configuration MUST Be Explicit and Measurable
Decay configuration MUST define measurable policy inputs, such as age, redundancy, source type, topic/project scope, access or recall evidence, and score thresholds. A decay policy MUST be explainable for each decayed memory: the system MUST be able to report why the memory received its decay state or score. The default policy MUST NOT hard-delete, archive, or soft-delete memories.

#### Scenario: Decay reason is explainable
- GIVEN a memory receives decay metadata
- WHEN maintenance results are inspected
- THEN the system MUST report the policy input or reason class that caused decay
- AND the reported reason MUST be based on configured measurable criteria

#### Scenario: Default decay policy does not remove records
- GIVEN default maintenance configuration is active
- WHEN decay evaluates stale or redundant memories
- THEN it MUST record only reversible ranking metadata
- AND it MUST NOT archive, soft-delete, or hard-delete source records

### Requirement: Config Schema MUST Document Maintenance Settings
The persisted configuration schema MUST document the additive maintenance settings with their types, defaults, and nesting location. Schema validation MUST accept known maintenance settings and continue to reject unknown properties wherever the existing schema uses closed objects.

#### Scenario: Schema accepts known maintenance settings
- GIVEN persisted config sets documented maintenance settings
- WHEN the config is validated
- THEN validation MUST succeed for those settings

#### Scenario: Schema remains closed for unknown settings
- GIVEN a persisted config sets an unrecognized maintenance property under a closed config object
- WHEN the config is validated
- THEN validation MUST fail rather than silently accepting the unknown property

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **Conservative defaults:** Automatic mutating maintenance defaults off; manual dry-run is the safest default operator posture. Design may choose exact names, but must preserve the env > persisted > default precedence.
- **Separate switches:** Automatic maintenance, read-path consumption, and manual admin execution should be independently controllable for rollback and testing.
- **Read-path default:** When read-path maintenance consumption is unset, design should choose the least surprising conservative behavior: consume only already-recorded, reversible maintenance metadata and provide a separate switch that restores post-C1 baseline ranking/evidence exactly over the same portable records.
