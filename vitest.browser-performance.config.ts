import { defineConfig } from 'vitest/config';

import { BROWSER_PERFORMANCE_TESTS } from './vitest.test-patterns.js';

export default defineConfig({
  test: {
    root: '.',
    include: BROWSER_PERFORMANCE_TESTS,
    globalSetup: ['tests/dashboard/dashboard-browser-global-setup.ts'],
    testTimeout: 10000,
    teardownTimeout: 20000,
    maxWorkers: 1,
  },
});
