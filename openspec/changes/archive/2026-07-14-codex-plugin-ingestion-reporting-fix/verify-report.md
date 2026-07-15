# Verification Report: Codex Plugin Ingestion and Reporting Fix

## Round

round 2

## Completeness

- Pipeline: `full`
- Persistence: `openspec`
- OpenSpec preflight: PASS
  - `openspec/config.yaml`: presente y con mecanismos completos.
  - `openspec/specs/`: presente.
  - `openspec/changes/`: presente.
  - `openspec/memory/constitution.md`: presente.
- Artifacts reviewed:
  - `proposal.md`
  - `specs/cli/spec.md`
  - `specs/harness-integration/spec.md`
  - `design.md`
  - `tasks.md`
  - `plan-review.md`
  - `verify-report.md` de round 1
  - `checklists/requirements.md`
- Plan review: `[OKAY]`.
- Tasks: 22/22 completas.
- Requirements: 10/10 cubiertos.
- Scenarios: 45/45 conformes.
- Clarification markers: 0.
- Requirements checklist: 42 checked, 1 waived, 0 incomplete.
- Round 1 remediation:
  - C1: RESOLVED.
  - W1: RESOLVED.

## Build and Test Evidence

| Check | Resultado |
| --- | --- |
| `pnpm exec tsc --noEmit` | PASS |
| `pnpm test -- tests/setup/codex-cli.test.ts` | PASS — 77/77 |
| `pnpm test -- tests/setup/engine.test.ts` | PASS — 46/46 |
| `pnpm test -- tests/packaging/packed-install.test.ts` | PASS — 29/29 |
| `pnpm test -- tests/setup/rollback.test.ts` | PASS — 48 passed, 1 skipped |
| `pnpm run build` | PASS |
| `pnpm test` | PASS — 60 files, 945 passed, 1 skipped |
| `pnpm run integration:verify` | PASS — 15 native assets |
| Protected surface hashes | PASS — 11/11 iguales al baseline |
| IDE diagnostics | PASS — 0 errores |
| `git diff --check` | PASS |
| Verification mutation check | PASS — estado Git idéntico antes y después |

Round 2 reprodujo independientemente el suite packed y la suite completa. La remediación solo amplía cobertura controlada; no cambia código de producción ni superficies protegidas.

Los hashes confirman ausencia de deriva en tipos públicos, formato CLI, esquema y validación V2, metadata, inventario y bundle Codex.

## Compliance Matrix

### CLI

| # | Requirement › Scenario | Evidence | Result |
| --- | --- | --- | --- |
| 1 | Manager Operations › Clean current plugin installation verifies complete | `tests/setup/codex-cli.test.ts:1522`, `tests/packaging/packed-install.test.ts:1358` | PASS |
| 2 | Manager Operations › Nonzero mutation followed by exact verification succeeds | `tests/setup/codex-cli.test.ts:804`, `tests/setup/codex-cli.test.ts:1799`, `tests/setup/engine.test.ts:1271` | PASS |
| 3 | Manager Operations › Marketplace failure does not suppress a safe plugin attempt | `tests/setup/codex-cli.test.ts:661`, `tests/setup/codex-cli.test.ts:1850`, `tests/setup/codex-cli.test.ts:2061` | PASS |
| 4 | Manager Operations › Exactly one verified manager operation is partial | `tests/setup/codex-cli.test.ts:1567` | PASS |
| 5 | Manager Operations › Safe attempts verify no requested manager state | `tests/setup/codex-cli.test.ts:833` | PASS |
| 6 | Manager Operations › Unreconciled orphan residue requires user action | `tests/setup/codex-cli.test.ts:1745`, `tests/packaging/packed-install.test.ts:1514` | PASS |
| 7 | Failure Diagnostics › Recognized orphan collision remains useful and bounded | `tests/setup/codex-cli.test.ts:1745` | PASS |
| 8 | Failure Diagnostics › Secret-bearing command output is redacted before persistence | `tests/setup/codex-cli.test.ts:1745`, `src/setup/codex-cli.ts:1031` | PASS |
| 9 | Failure Diagnostics › Oversized nonzero output is handled deterministically | `tests/setup/codex-cli.test.ts:1799`, `src/setup/codex-cli.ts:1549` | PASS |
| 10 | Failure Diagnostics › Error text cannot override exact absence | `tests/setup/codex-cli.test.ts:1745`, `tests/setup/codex-cli.test.ts:1980` | PASS |
| 11 | Receipt Evidence › Failed attempt does not confirm later planned rows | `tests/setup/engine.test.ts:1232` | PASS |
| 12 | Receipt Evidence › Attempt checkpoint precedes verification checkpoint | `tests/setup/codex-cli.test.ts:2061`, `src/setup/codex-cli.ts:351` | PASS |
| 13 | Receipt Evidence › Checkpoint failure stops the flow truthfully | `tests/setup/engine.test.ts:1271`, `tests/setup/rollback.test.ts:416` | PASS |
| 14 | Receipt Evidence › Renderings agree with signed evidence | `tests/setup/engine.test.ts:1232`, `src/setup/engine.ts:1394` | PASS |
| 15 | Receipt Evidence › Nonzero then verified is rendered consistently | `tests/setup/engine.test.ts:1271` | PASS |
| 16 | Automated Verification › Clean and orphan regressions use controlled execution | `tests/packaging/packed-install.test.ts:1358`, `tests/packaging/packed-install.test.ts:1514` | PASS |
| 17 | Automated Verification › Packed-flow regression remains disposable | Physical orphan, controlled remove and fresh rerun at `tests/packaging/packed-install.test.ts:1514` | PASS |
| 18 | Automated Verification › Real-home target is rejected by automated verification | Equal, contained and containing overlap cases at `tests/packaging/packed-install.test.ts:1259`; simulated active home is fully disposable; invocation count remains zero, receipt directory is absent and sentinel unchanged | PASS |
| 19 | Safe Registration › Both manager operations verify complete without legacy state | `tests/setup/codex-cli.test.ts:1522` | PASS |
| 20 | Safe Registration › One modern operation has an ordinary failure after another succeeds | `tests/setup/codex-cli.test.ts:1567` | PASS |
| 21 | Safe Registration › Manual-recovery ambiguity overrides one verified operation | `tests/setup/codex-cli.test.ts:1850` | PASS |
| 22 | Safe Registration › Pre-mutation unavailable manager capability uses legacy strategy | `tests/setup/codex-cli.test.ts:602`, `tests/setup/codex-cli.test.ts:1619` | PASS |
| 23 | Safe Registration › Marketplace success cannot mask unavailable plugin state | `tests/setup/codex-cli.test.ts:1636`, `tests/setup/engine.test.ts:1144` | PASS |
| 24 | Deterministic Results › Complete and no-op results exit zero | `tests/setup/engine.test.ts:164`, `tests/setup/codex-cli.test.ts:1659` | PASS |
| 25 | Deterministic Results › Operational failure exits one | `tests/setup/engine.test.ts:164`, checkpoint-failure suites | PASS |
| 26 | Deterministic Results › Ordinary partial external completion exits two | `tests/setup/codex-cli.test.ts:1567`, `tests/packaging/packed-install.test.ts:1358` | PASS |
| 27 | Deterministic Results › Manual action exits three and outranks partial | `tests/setup/codex-cli.test.ts:1850`, `tests/packaging/packed-install.test.ts:1514` | PASS |

### Harness Integration

| # | Requirement › Scenario | Evidence | Result |
| --- | --- | --- | --- |
| 28 | Hidden Residue › Orphan temporary checkout remains unregistered | Physical `.tmp/marketplaces/thoth-mem` fixture at `tests/packaging/packed-install.test.ts:1529`; first setup preserves its digest and sentinel | PASS |
| 29 | Hidden Residue › Nonzero command cannot negate exact verified state | `tests/setup/codex-cli.test.ts:804`, `tests/setup/codex-cli.test.ts:1799` | PASS |
| 30 | Hidden Residue › Error text alone cannot prove registration | `tests/setup/codex-cli.test.ts:1745`, malformed/message-only matrix at line 1923 | PASS |
| 31 | Hidden Residue › State from another scope is not authoritative | `tests/setup/codex-cli.test.ts:1468`, isolated project flow at `tests/packaging/packed-install.test.ts:1358` | PASS |
| 32 | Orphan Classification › Collision plus exact absence classifies stale residue | `tests/setup/codex-cli.test.ts:1745`, `src/setup/codex-cli.ts:1352` | PASS |
| 33 | Orphan Classification › Temporary path alone is insufficient | `tests/setup/codex-cli.test.ts:1980` | PASS |
| 34 | Orphan Classification › Collision message alone is insufficient | Matrix at `tests/setup/codex-cli.test.ts:1923` | PASS |
| 35 | Orphan Classification › Divergent provenance or unsafe path evidence fails closed | Matrix at `tests/setup/codex-cli.test.ts:1923` | PASS |
| 36 | Orphan Reconciliation › No supported reconciliation returns user action | `tests/setup/codex-cli.test.ts:2039`; zero automatic remove | PASS |
| 37 | Orphan Reconciliation › Supported manager reconciliation remains verification-gated | Controlled remove implementation at `tests/packaging/packed-install.test.ts:1197`; exactly one explicit call deletes JSON residue and physical checkout, exact absence is reread and a fresh setup completes | PASS |
| 38 | Orphan Reconciliation › Force cannot create cleanup authority | `tests/setup/codex-cli.test.ts:1887` | PASS |
| 39 | Orphan Reconciliation › Concurrent or escaped residue blocks automatic reconciliation | Matrix at `tests/setup/codex-cli.test.ts:1923` | PASS |
| 40 | Orphan Reconciliation › Reconciliation failure does not activate legacy ownership | `tests/setup/codex-cli.test.ts:661`, `tests/setup/codex-cli.test.ts:1850` | PASS |
| 41 | Capability Mapping › Proven modern capability selects plugin manager ownership | `tests/setup/codex-cli.test.ts:581` | PASS |
| 42 | Capability Mapping › Unavailable scoped plugin management selects legacy ownership | `tests/setup/codex-cli.test.ts:602`, `tests/setup/codex-cli.test.ts:1619` | PASS |
| 43 | Capability Mapping › Version evidence alone is insufficient | Parameterized cases at `tests/setup/codex-cli.test.ts:602` | PASS |
| 44 | Capability Mapping › Modern operational failure does not activate legacy fallback | `tests/setup/codex-cli.test.ts:661`, `tests/setup/codex-cli.test.ts:1567`, `tests/setup/codex-cli.test.ts:1850` | PASS |
| 45 | Capability Mapping › Existing manager state blocks unsafe legacy coexistence | `tests/setup/codex-cli.test.ts:681`, `tests/setup/codex-cli.test.ts:1636` | PASS |

## Design Coherence

La implementación y la remediación de round 2 son coherentes con el diseño aprobado:

- Las listas exactas del scope seleccionado permanecen como única autoridad.
- Marketplace y plugin se ejecutan y verifican de forma independiente.
- Un resultado nonzero solo queda confirmado por una reread exacta.
- La clasificación de residuo exige ausencia inicial, colisión reconocida y ausencia posterior.
- Evidencia ambigua de scope, procedencia, paths o concurrencia falla cerrada.
- Setup nunca ejecuta `marketplace remove`, ni siquiera con `--force`.
- La guía manual depende de capacidad anunciada.
- Los diagnósticos permanecen sintetizados, redactados y acotados.
- Los checkpoints mantienen intento antes de reread.
- Receipt, resultado humano y JSON derivan de la misma evidencia.
- Un fallo de persistencia detiene mutaciones posteriores.
- V1/V2 y los límites de 256 checkpoints, 512 caracteres y 1 MiB permanecen intactos.
- No existe fallback legacy después de seleccionar `plugin_manager`.
- La prueba negativa de aislamiento usa únicamente un home real simulado dentro de `tmp`; no consulta ni toca el home real del usuario.
- El residuo físico existe únicamente bajo el `CODEX_HOME` disposable.
- El primer setup preserva el residuo físico y no invoca remove.
- Solo el remove explícito del launcher controlado elimina el estado JSON y el checkout.
- La nueva invocación comienza con preflight exacto y termina `complete`.
- El sentinel externo permanece sin cambios.

La corrección de round 2 no modifica código de producción ni contratos protegidos.

## Issues Found

### Critical

None.

### Warnings

None.

## Verdict

**pass**

Los 45 escenarios cuentan con evidencia concreta. C1 y W1 de round 1 quedaron corregidos sin introducir regresiones. Los gates focalizados y completos pasan, los hashes protegidos permanecen idénticos y la verificación no modificó el estado versionado del repositorio.

## Constitution Suggestion

This change touched governance/principles — consider running `sdd-constitution` to record a constitution amendment.
