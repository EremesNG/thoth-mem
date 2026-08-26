export const ALL_TESTS = ['tests/**/*.test.ts'];
export const INTEGRATION_TESTS = [
  'tests/integration.test.ts',
  'tests/integration/**/*.test.ts',
  'tests/setup/**/*.test.ts',
  'tests/packaging/**/*.test.ts',
];
export const ALL_BROWSER_TESTS: string[] = [];
export const UNIT_TEST_EXCLUDES = [...INTEGRATION_TESTS];
