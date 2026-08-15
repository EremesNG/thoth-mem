import {
  resolveBrowserExecutable,
  startOwnedBrowser,
  stopOwnedBrowser,
  type OwnedBrowser,
} from './dashboard-browser-process.js';

const GLOBAL_BROWSER_STARTUP_TIMEOUT_MS = 20_000;
const GLOBAL_BROWSER_TEARDOWN_TIMEOUT_MS = 20_000;

export interface SharedDashboardBrowser {
  debugPort: number;
  pid: number;
  profile: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    dashboardBrowser: SharedDashboardBrowser;
  }
}

interface SharedBrowserSetupOptions {
  browserPath?: string;
  startupTimeoutMs?: number;
  teardownTimeoutMs?: number;
}

export interface SharedBrowserProvider {
  provide(key: 'dashboardBrowser', value: SharedDashboardBrowser): void;
}

export async function setupSharedDashboardBrowser(
  project: SharedBrowserProvider,
  options: SharedBrowserSetupOptions = {},
): Promise<() => Promise<void>> {
  const chromePath = options.browserPath ?? resolveBrowserExecutable();
  if (!chromePath) {
    throw new Error('Real browser unavailable: Chrome or Edge executable is required');
  }

  const controller = new AbortController();
  const startupTimeoutMs = options.startupTimeoutMs ?? GLOBAL_BROWSER_STARTUP_TIMEOUT_MS;
  const startupDeadline = setTimeout(() => {
    controller.abort(new Error(`Shared dashboard browser startup exceeded ${startupTimeoutMs}ms`));
  }, startupTimeoutMs);
  let browser: OwnedBrowser;
  try {
    browser = await startOwnedBrowser(chromePath, { signal: controller.signal });
  } finally {
    clearTimeout(startupDeadline);
  }

  const pid = browser.chrome.pid;
  if (!pid) {
    await stopOwnedBrowser(browser);
    throw new Error('Shared dashboard browser started without a process identifier');
  }
  project.provide('dashboardBrowser', {
    debugPort: browser.debugPort,
    pid,
    profile: browser.profile,
  });

  return async () => {
    const teardownTimeoutMs = options.teardownTimeoutMs ?? GLOBAL_BROWSER_TEARDOWN_TIMEOUT_MS;
    await bounded(
      stopOwnedBrowser(browser),
      teardownTimeoutMs,
      'Shared dashboard browser teardown',
    );
  };
}

export default setupSharedDashboardBrowser;

async function bounded<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
