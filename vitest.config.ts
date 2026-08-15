import { configDefaults, defineConfig } from 'vitest/config';

import { ALL_BROWSER_TESTS, ALL_TESTS } from './vitest.test-patterns.js';

export default defineConfig({
  test: {
    root: '.',
    include: ALL_TESTS,
    exclude: [...configDefaults.exclude, ...ALL_BROWSER_TESTS],
    testTimeout: 10000,
    maxWorkers: 1,
  },
});
