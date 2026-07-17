# Verification Report: Portable Harness Runtime Parity

## Completeness
- Canonical proposal, three delta specs, design, and tasks reviewed.
- All 29/29 tasks checked in OpenSpec.
- Previous passive-learning blocker and README inconsistency resolved.

## Build and Test Evidence
- `pnpm run build`: passed.
- Full Vitest: 68 files, 1021 passed, 1 skipped, 0 failed.
- Public-contract gate: 55 passed.
- Focused gate: 282 passed, 1 skipped.
- Combined native correction gate: 65 passed.
- Integration verifier: 15 native assets.
- `git diff --check`: passed.
- No dist edits.

## Compliance Matrix
|#|Scenario|Result|Evidence|
|---|---|---|---|
|1|Installed assets do not prove activation|Pass|Resolver rejects missing/unmatched evidence; packed unverified paths degrade.|
|2|Verified host payload activates lifecycle|Pass|Resolver-owned immutable mappings and authority tests.|
|3|OpenCode fallback bounded|Pass|Explicit behavior mapping and fail-closed runtime tests.|
|4|Unknown payload fails closed|Pass|Exact bounded claim parsing and malformed cases.|
|5|Supported start delivers bounded recovery|Pass|Directive requires confirmed memory and verified mapping.|
|6|Unverified injection claims no delivery|Pass|Unavailable mapping and unproven consumption retained.|
|7|Confirmed compaction ordered|Pass|Durable checkpoint/reservation/consume chain and packed compact start.|
|8|Failed checkpoint retryable|Pass|No state advancement/guidance; retry tests.|
|9|Eligible subagent saves observation not prompt|Pass|Official SubagentStop runner→resolver passive mapping→adapter→core E2E.|
|10|Private/ineligible subagent excluded|Pass|Optional metadata projected out; sanitizer/no-memory-call E2E.|
|11|Passive retry/duplicate safe|Pass|Stable hashed identity, failed-save retry, confirmed duplicate no-op.|
|12|Fixed memory contracts unchanged|Pass|Six tools only; schemas/registry unchanged.|
|13|Unproven terminal does not finalize|Pass|Passive terminal unsupported; no mem_session/context/consumption; Stop no-op.|
|14|Claude plan zero-write|Pass|Plan exits before mutation and scope tests.|
|15|Unproven Claude grammar manual action|Pass|Allowlisted probe and zero mutation.|
|16|Manual config intact|Pass|Coexistence refusal and packed preservation.|
|17|Claude rollback receipt-owned|Pass|Under-lock ownership reread and later edits.|
|18|Claude setup defaults global|Pass|Public claude-code parser/routing.|
|19|Manual recovery status mapping|Pass|Stable 0/1/2/3 exits and packed cases.|
|20|Discoverable asset without execution fails proof|Pass|Unverified packed event degrades/no output.|
|21|All harnesses isolated activation evidence|Pass|Disposable loop, real memory DB and packed verifier.|
|22|Recovery/compaction exercised|Pass|OpenCode and native checkpoint→compact-start envelopes.|
|23|Unsupported delivery explicit|Pass|Degraded/no directive and mismatch tests.|
|24|Disposable Claude preserves external state|Pass|Marketplace/manual/zero-mutation cases.|
|25|Disposable Claude rollback bounded|Pass|Receipt-owned operations, later edits, lock cleanup.|

## Design Coherence
- Resolver is sole capability authority and separates passive learning from finalization.
- Claude SubagentStop chain is reachable end-to-end.
- Official optional metadata is validated then removed; only lifecycle identity and last_assistant_message reach core.
- Passive learning uses observation/learning/project/root identity only, with no prompt/topic/finalization/output/consumption claim.
- Recovery directives, compaction gate, Claude ownership, hermetic packaging and six-tool schemas remain coherent.
- README presents managed Claude setup and marketplace alternative correctly.

## Issues Found
### Blockers
None.

### Process Warning
The thoth-mem full tasks mirror is degraded; canonical OpenSpec was used as authority and is complete. This warning does not reduce implementation compliance.

## Verdict
**PASS WITH WARNINGS — 25/25 scenarios compliant.**