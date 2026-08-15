import { defineConfig } from 'vitest/config';

import { INTEGRATION_TESTS } from './vitest.test-patterns.js';

export default defineConfig({
  test: {
    root: '.',
    include: INTEGRATION_TESTS,
    testTimeout: 10000,
    maxWorkers: 1,
  },
});
