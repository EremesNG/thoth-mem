# Testing and verification

Use the nearest terminating Vitest file first. Unit tests are the memory-core, tool, and benchmark suites; integration tests are under `tests/integration/`, `tests/setup/`, and `tests/packaging/`.

Verified commands:

```sh
pnpm exec vitest run <test-file> --config vitest.unit.config.ts
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm run integration:verify
pnpm run integration:smoke
pnpm run benchmark:fixture
pnpm run prepublishOnly
git diff --check
```

There is no lint or browser lane. `integration:smoke` packs the real tarball, installs it in a disposable directory, verifies all three native inventories, cold-starts its CLI, and executes every packaged lifecycle runner with host-shaped fixtures without touching real host homes. It does not launch real host binaries or prove host-model consumption. External benchmark lanes may remain unavailable only when the report says so explicitly.

Memory-operating-model seams are covered by:

- `tests/integration/lifecycle.test.ts` for the automatic-capture allowlist, private/recognizable-credential filtering, one-state-change idempotency, restart/post-compaction recovery, degraded identity, and truthful no-fit delivery;
- `tests/memory-core/context.test.ts` for handoff-first selection, failed/mixed lessons, temporal truth, deterministic aggregate budgets, hidden actions, and project isolation;
- `tests/memory-core/continuation.test.ts` for Unicode caps, useful-content floors/ratio, metadata-starvation abstention, complete metadata, trust delimiters, poisoning/control characters, and embedded supporting-evidence omission;
- `tests/tools/mcp.test.ts` for the compact → context → get funnel, shared briefing selection, deferred evidence IDs, and history provenance;
- `tests/integration/adapters.test.ts`, `tests/integration/opencode-native-plugin.test.ts`, and `tests/integration/public-plugin-runner.test.ts` for pre-hash credential sanitation, verbatim final-context injection, and identity-only fallback across all hosts;
- `tests/benchmarks/report.test.ts` and `tests/benchmarks/runner.test.ts` for hidden actionable fields, abstention, poisoning, isolation, injected characters/tokens, useful-content ratio, and equal Top-K/final-context comparability.

Run the nearest file first, then `pnpm run build`, `pnpm test`, `pnpm run integration:verify`, `pnpm run integration:smoke`, `pnpm run benchmark:fixture`, and `pnpm run prepublishOnly`. The committed fixture must make zero network/model calls and must not claim external quality while LongMemEval-S, LoCoMo, AMB/BEAM/PersonaMem, or SDEBench lanes are unavailable.
