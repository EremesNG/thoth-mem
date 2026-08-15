export const ALL_TESTS = ['tests/**/*.test.ts'];

export const BROWSER_SMOKE_TESTS = ['tests/dashboard/**/*.browser.test.ts'];
export const BROWSER_PERFORMANCE_TESTS = ['tests/dashboard/**/*.performance.test.ts'];
export const ALL_BROWSER_TESTS = [...BROWSER_SMOKE_TESTS, ...BROWSER_PERFORMANCE_TESTS];

export const INTEGRATION_TESTS = [
  'tests/integration.test.ts',
  'tests/http-*.test.ts',
  'tests/integration/**/*.test.ts',
  'tests/setup/**/*.test.ts',
  'tests/packaging/**/*.test.ts',
];

export const UNIT_TEST_EXCLUDES = [...ALL_BROWSER_TESTS, ...INTEGRATION_TESTS];
