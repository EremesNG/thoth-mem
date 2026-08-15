import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

const BROWSER_STARTUP_ATTEMPTS = 2;
const BROWSER_STARTUP_TIMEOUT_MS = 12_000;
const BROWSER_STDERR_LIMIT = 4_096;

const BROWSER_PATHS: Partial<Record<NodeJS.Platform, readonly string[]>> = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
  ],
};

export interface BrowserExecutableResolutionOptions {
  environment?: NodeJS.ProcessEnv;
  pathExists?: (path: string) => boolean;
  platform?: NodeJS.Platform;
}

export interface OwnedBrowser {
  chrome: ChildProcess;
  debugPort: number;
  profile: string;
}

export interface StartOwnedBrowserOptions {
  signal: AbortSignal;
  startupFailures?: number;
  beforeReady?: () => Promise<void>;
  onResource?: (kind: 'profile' | 'pid', value: string | number) => void;
}

export async function startOwnedBrowser(
  chromePath: string,
  options: StartOwnedBrowserOptions,
): Promise<OwnedBrowser> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < BROWSER_STARTUP_ATTEMPTS; attempt += 1) {
    throwIfAborted(options.signal);
    const profile = mkdtempSync(resolve(tmpdir(), 'thoth-dashboard-browser-'));
    options.onResource?.('profile', profile);
    const chrome = spawn(chromePath, browserLaunchArguments(profile), {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    if (chrome.pid) options.onResource?.('pid', chrome.pid);
    let stderr = '';
    chrome.stderr?.setEncoding('utf8');
    chrome.stderr?.on('data', (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-BROWSER_STDERR_LIMIT);
    });
    try {
      await options.beforeReady?.();
      if (attempt < (options.startupFailures ?? 0)) {
        throw new Error(`Injected transient browser startup failure on attempt ${attempt + 1}`);
      }
      const debugPort = await readDevToolsPort(
        resolve(profile, 'DevToolsActivePort'),
        options.signal,
        chrome,
        () => stderr,
      );
      return { chrome, profile, debugPort: Number(debugPort) };
    } catch (error) {
      lastError = asError(error);
      const cleanupErrors: Error[] = [];
      await terminateBrowser(chrome).catch((cause) => cleanupErrors.push(asError(cause)));
      await removeOwnedBrowserProfile(profile).catch((cause) => cleanupErrors.push(asError(cause)));
      if (cleanupErrors.length) {
        throw new AggregateError([lastError, ...cleanupErrors], 'Failed browser startup attempt cleanup');
      }
      throwIfAborted(options.signal);
    }
  }
  throw new Error(
    `Chrome startup retries exhausted after ${BROWSER_STARTUP_ATTEMPTS} attempts: ${lastError?.message ?? 'unknown startup failure'}`,
  );
}

export async function stopOwnedBrowser(browser: OwnedBrowser): Promise<void> {
  const errors: Error[] = [];
  await terminateBrowser(browser.chrome).catch((error) => errors.push(asError(error)));
  await removeOwnedBrowserProfile(browser.profile).catch((error) => errors.push(asError(error)));
  if (errors.length) throw new AggregateError(errors, 'Owned browser cleanup failed');
}

export function resolveBrowserExecutable(options: BrowserExecutableResolutionOptions = {}): string | null {
  const environment = options.environment ?? process.env;
  const pathExists = options.pathExists ?? existsSync;
  const platform = options.platform ?? process.platform;
  const candidates = [
    environment.THOTH_MEM_BROWSER_PATH,
    environment.CHROME_PATH,
    environment.CHROME_BIN,
    environment.EDGE_PATH,
    ...(BROWSER_PATHS[platform] ?? []),
  ];
  return candidates.find((candidate): candidate is string =>
    typeof candidate === 'string' && candidate.length > 0 && pathExists(candidate)) ?? null;
}

export function browserLaunchArguments(
  profile: string,
  platform: NodeJS.Platform = process.platform,
): string[] {
  return [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    ...(platform === 'linux' ? ['--disable-dev-shm-usage'] : []),
    '--disable-component-update',
    '--disable-sync',
    '--disable-default-apps',
    '--disable-breakpad',
    '--disable-crash-reporter',
    'about:blank',
  ];
}

export function browserHasExited(
  exitCode: number | null,
  signalCode: NodeJS.Signals | null,
): boolean {
  return exitCode !== null || signalCode !== null;
}

export function browserProcessHasExited(
  exitCode: number | null,
  signalCode: NodeJS.Signals | null,
  pid: number | undefined,
): boolean {
  return browserHasExited(exitCode, signalCode)
    || (typeof pid === 'number' && !processExists(pid));
}

export function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

export function isOwnedBrowserProfilePath(path: string): boolean {
  const root = resolve(tmpdir());
  const target = resolve(path);
  const relativePath = relative(root, target);
  return relativePath.length > 0
    && relativePath !== '..'
    && !relativePath.startsWith(`..${sep}`)
    && !isAbsolute(relativePath)
    && basename(target).startsWith('thoth-dashboard-browser-');
}

export function pathExists(path: string): boolean {
  return existsSync(path);
}

async function removeOwnedBrowserProfile(path: string): Promise<void> {
  const target = resolve(path);
  if (!isOwnedBrowserProfilePath(target)) {
    throw new Error(`Refusing to remove unvalidated browser profile: ${target}`);
  }
  const deadline = Date.now() + 10_000;
  let lastError: unknown;
  while (existsSync(target)) {
    try {
      rmSync(target, { recursive: true, force: true });
    } catch (error) {
      lastError = error;
    }
    if (!existsSync(target)) return;
    if (Date.now() >= deadline) {
      throw lastError instanceof Error
        ? lastError
        : new Error(`Timed out removing browser profile: ${target}`);
    }
    await delay(50);
  }
}

async function terminateBrowser(chrome: ChildProcess): Promise<void> {
  if (browserHasExited(chrome.exitCode, chrome.signalCode)) return;
  chrome.kill();
  try {
    await waitForBrowserExit(chrome, 8_000, 'Chrome exit');
  } catch {
    chrome.kill('SIGKILL');
    try {
      await waitForBrowserExit(chrome, 5_000, 'forced Chrome exit');
    } catch (error) {
      if (!browserProcessHasExited(chrome.exitCode, chrome.signalCode, chrome.pid)) throw error;
      await delay(500);
    }
  }
}

async function waitForBrowserExit(
  chrome: ChildProcess,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!browserHasExited(chrome.exitCode, chrome.signalCode)) {
    if (Date.now() >= deadline) throw new Error(`${label} timeout after ${timeoutMs}ms`);
    await delay(50);
  }
}

async function readDevToolsPort(
  path: string,
  signal: AbortSignal,
  chrome: ChildProcess,
  stderr: () => string,
): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < BROWSER_STARTUP_TIMEOUT_MS) {
    throwIfAborted(signal);
    if (browserHasExited(chrome.exitCode, chrome.signalCode)) {
      throw browserStartupError('Chrome exited before publishing a DevTools port', chrome, stderr());
    }
    try {
      if (existsSync(path)) {
        const [port] = readFileSync(path, 'utf8').trim().split(/\r?\n/);
        if (/^\d+$/.test(port)) return port;
      }
    } catch {
      // Chrome may still own the new file briefly on Windows.
    }
    await delay(25);
  }
  throw browserStartupError('Timeout waiting for readable Chrome DevTools port', chrome, stderr());
}

function browserStartupError(message: string, chrome: ChildProcess, stderr: string): Error {
  const status = browserHasExited(chrome.exitCode, chrome.signalCode)
    ? `exit=${chrome.exitCode ?? 'null'} signal=${chrome.signalCode ?? 'null'}`
    : 'process=running';
  const detail = stderr.trim();
  return new Error(`${message}; ${status}${detail ? `; stderr=${detail}` : ''}`);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason instanceof Error ? signal.reason : abortError('Browser lifecycle aborted');
  }
}

function abortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
