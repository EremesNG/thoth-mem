import { configDefaults, defineConfig } from 'vitest/config';

import { ALL_TESTS, UNIT_TEST_EXCLUDES } from './vitest.test-patterns.js';

export default defineConfig({
  test: {
    root: '.',
    include: ALL_TESTS,
    exclude: [...configDefaults.exclude, ...UNIT_TEST_EXCLUDES],
    testTimeout: 10000,
    maxWorkers: 1,
  },
});
