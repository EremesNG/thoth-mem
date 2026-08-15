import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { withDashboardBrowser } from './dashboard-browser-harness.js';

const SCREENSHOT_LIMIT = 2 * 1024 * 1024;
const DOM_LIMIT = 512 * 1024;
const METADATA_LIMIT = 32 * 1024;

describe('dashboard browser failure diagnostics', () => {
  it('captures bounded failure-only evidence without replacing the original error', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thoth-browser-diagnostics-'));
    try {
      await expect(withDashboardBrowser(async (browser) => {
        await browser.goto('/');
        throw new Error('diagnostic acceptance probe');
      }, {
        diagnostics: { directory, enabled: true },
      })).rejects.toThrow('diagnostic acceptance probe');

      const runDirectories = await readdir(directory);
      expect(runDirectories).toHaveLength(1);
      const artifactDirectory = join(directory, runDirectories[0]);
      const files = (await readdir(artifactDirectory)).sort();
      expect(files).toEqual(['dom.html', 'failure.json', 'screenshot.jpg']);

      const screenshot = await readFile(join(artifactDirectory, 'screenshot.jpg'));
      const dom = await readFile(join(artifactDirectory, 'dom.html'));
      const metadata = await readFile(join(artifactDirectory, 'failure.json'));
      expect(screenshot.byteLength).toBeGreaterThan(0);
      expect(screenshot.byteLength).toBeLessThanOrEqual(SCREENSHOT_LIMIT);
      expect(dom.byteLength).toBeGreaterThan(0);
      expect(dom.byteLength).toBeLessThanOrEqual(DOM_LIMIT);
      expect(metadata.byteLength).toBeLessThanOrEqual(METADATA_LIMIT);
      expect(JSON.parse(metadata.toString('utf8'))).toMatchObject({
        error: { message: 'diagnostic acceptance probe' },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it('creates no diagnostic artifacts for a passing acceptance invocation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thoth-browser-diagnostics-'));
    try {
      await withDashboardBrowser(async (browser) => {
        await browser.goto('/');
      }, {
        diagnostics: { directory, enabled: true },
      });
      expect(await readdir(directory)).toHaveLength(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it('does not capture intentional lifecycle fault injections', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thoth-browser-diagnostics-'));
    try {
      await expect(withDashboardBrowser(async () => undefined, {
        diagnostics: { directory, enabled: true },
        faultInjection: { phase: 'work', deadlineMs: 200 },
      })).rejects.toThrow(/deadline/i);
      expect(await readdir(directory)).toHaveLength(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it('preserves the acceptance failure when diagnostic capture itself fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thoth-browser-diagnostics-'));
    const blockedOutput = join(directory, 'blocked-output');
    try {
      await writeFile(blockedOutput, 'not a directory');
      await expect(withDashboardBrowser(async (browser) => {
        await browser.goto('/');
        throw new Error('capture failure preservation probe');
      }, {
        diagnostics: { directory: blockedOutput, enabled: true },
      })).rejects.toThrow('capture failure preservation probe');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);
});
