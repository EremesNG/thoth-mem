import { describe, expect, it } from 'vitest';

import { withDashboardBrowser } from './dashboard-browser-harness.js';

interface ControlAppearance {
  height: string;
  borderRadius: string;
  borderColor: string;
  backgroundColor: string;
  inputFontFamily: string;
  inputFontSize: string;
  labelColor: string;
  labelFontFamily: string;
  labelFontSize: string;
}

function appearanceScript(rootSelector: string): string {
  return `[...document.querySelectorAll(${JSON.stringify(`${rootSelector} .guided-select`)})].map((root) => {
    const control = root.querySelector('.guided-select-control');
    const input = root.querySelector('input');
    const label = root.querySelector('label');
    if (!(control instanceof HTMLElement) || !(input instanceof HTMLInputElement) || !(label instanceof HTMLLabelElement)) throw new Error('Incomplete guided selector');
    const controlStyle = getComputedStyle(control);
    const inputStyle = getComputedStyle(input);
    const labelStyle = getComputedStyle(label);
    return {
      height: controlStyle.height,
      borderRadius: controlStyle.borderRadius,
      borderColor: controlStyle.borderColor,
      backgroundColor: controlStyle.backgroundColor,
      inputFontFamily: inputStyle.fontFamily,
      inputFontSize: inputStyle.fontSize,
      labelColor: labelStyle.color,
      labelFontFamily: labelStyle.fontFamily,
      labelFontSize: labelStyle.fontSize,
    };
  })`;
}

describe('dashboard dropdown consistency', () => {
  it('uses one searchable selector pattern across the observatory and Control Room', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/');
      await browser.click('button[aria-controls="atlas-scope-panel"]');
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="ready"]')`);

      expect(await browser.count('.guided-scope-bar .guided-select')).toBe(6);
      expect(await browser.count('.guided-scope-bar select')).toBe(0);
      expect(await browser.count('.guided-scope-bar .guided-select-control')).toBe(6);
      const observatoryAppearance = await browser.evaluate<ControlAppearance[]>(appearanceScript('.guided-scope-bar'));
      expect(new Set(observatoryAppearance.map((appearance) => JSON.stringify(appearance))).size).toBe(1);
      const expectedAppearance = observatoryAppearance[0];

      await browser.click('[role="combobox"][aria-label="Field of view"]');
      await browser.fill('[role="combobox"][aria-label="Field of view"]', 'wide');
      await browser.key('ArrowDown');
      await browser.key('Enter');
      await browser.waitFor(`new URLSearchParams(location.search).get('density') === 'wide'`);

      await browser.goto('/console/operations');
      await browser.waitFor(`document.querySelector('.control-room-scope[data-resource-state="ready"]')`);
      expect(await browser.count('.control-room .guided-select')).toBe(4);
      expect(await browser.count('.control-room select')).toBe(0);
      expect(await browser.count('.control-room .guided-select-control')).toBe(4);
      expect((await browser.evaluate<ControlAppearance[]>(appearanceScript('.control-room'))).every((appearance) => JSON.stringify(appearance) === JSON.stringify(expectedAppearance))).toBe(true);

      await browser.click('[role="combobox"][aria-label="Memory type"]');
      await browser.fill('[role="combobox"][aria-label="Memory type"]', 'architecture');
      await browser.key('ArrowDown');
      await browser.key('Enter');
      expect(await browser.evaluate<string>(`document.querySelector('[role="combobox"][aria-label="Memory type"]')?.value ?? ''`)).toBe('Architecture choice');

      await browser.goto('/console/traces');
      await browser.waitFor(`document.querySelector('.trace-controls')`);
      expect(await browser.count('.control-room .guided-select')).toBe(4);
      expect(await browser.count('.control-room select')).toBe(0);
      expect(await browser.count('.control-room .guided-select-control')).toBe(4);
      expect((await browser.evaluate<ControlAppearance[]>(appearanceScript('.control-room'))).every((appearance) => JSON.stringify(appearance) === JSON.stringify(expectedAppearance))).toBe(true);

      const requestCount = browser.requests.length;
      await browser.click('[role="combobox"][aria-label="Activity source"]');
      await browser.fill('[role="combobox"][aria-label="Activity source"]', 'agent tools');
      await browser.key('ArrowDown');
      await browser.key('Enter');
      await browser.waitFor(`document.querySelector('[role="combobox"][aria-label="Activity source"]')?.value === 'Agent tools'`);
      await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 100))`);
      expect(browser.requests.slice(requestCount).some(({ url }) => url.includes('/operation-traces?') && new URL(url).searchParams.get('origin') === 'mcp')).toBe(true);

      await browser.viewport(360, 800);
      expect(await browser.evaluate<boolean>('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      await browser.click('[role="combobox"][aria-label="Memory action"]');
      await browser.waitFor(`document.querySelector('[role="listbox"][aria-label="Memory action choices"]')`);
      expect(await browser.evaluate<boolean>(`(() => {
        const popover = document.querySelector('.guided-select-popover');
        if (!(popover instanceof HTMLElement)) return false;
        const bounds = popover.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight;
      })()`)).toBe(true);
    }, { observations: 12 });
  }, 40_000);
});
