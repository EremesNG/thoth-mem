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
