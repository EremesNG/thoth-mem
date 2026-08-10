import { describe, expect, it } from 'vitest';
import type { VizEdge, VizNode } from '../../dashboard/src/api/client.js';
import { accessibleNodeSummary, buildAdjacency, graphCommandForKey, nodeEmphasis } from '../../dashboard/src/components/map/map-navigation.js';
import { withDashboardBrowser } from './dashboard-browser-harness.js';

const nodes: VizNode[] = ['observation','fact','session','topic','project'].map((kind, index) => ({ id: `${kind}:${index}`, kind: kind as VizNode['kind'], label: `${kind} private [private]hidden[/private]`, snippet: '', project: null, topic_key: null, type: null, seed_x: index, seed_y: index }));
const edges: VizEdge[] = [{ id:'e', source_id:nodes[0].id, target_id:nodes[1].id, relation:'supports', label:'supports', summary:'' }];

describe('neural observatory semantics', () => {
  it('derives focus, neighbor, unrelated and degraded emphasis', () => {
    expect(nodeEmphasis(nodes[0].id,nodes[0].id,edges,'ready')).toBe('focused');
    expect(nodeEmphasis(nodes[1].id,nodes[0].id,edges,'ready')).toBe('neighbor');
    expect(nodeEmphasis(nodes[2].id,nodes[0].id,edges,'ready')).toBe('unrelated');
    expect(nodeEmphasis(nodes[2].id,nodes[0].id,edges,'degraded')).toBe('degraded');
  });
  it('maps every documented keyboard command and exposes private-safe summaries', () => {
    expect(['0','+','-','r','p','Escape','ArrowDown','ArrowUp','Enter','e'].map(graphCommandForKey)).not.toContain(null);
    expect(accessibleNodeSummary(nodes[0])).not.toContain('hidden');
    expect(buildAdjacency(nodes,edges).get(nodes[0].id)).toEqual([nodes[1].id]);
  });
  it('opens memory details inside the atlas without moving the page, camera, or keyboard focus', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.viewport(1440, 900);
      await browser.goto('/?project=browser-nebula');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready' && document.querySelectorAll('.graph-navigator li').length > 0`);
      await browser.click('button[title="Zoom in (+)"]');
      await browser.evaluate(`document.querySelector('.cosmos-graph-host canvas')?.focus()`);

      const before = await browser.evaluate<{
        scrollY: number;
        canvas: { width: number; height: number };
        active: string;
      }>(`(() => {
        const canvas=document.querySelector('[data-testid="map-canvas-shell"]')?.getBoundingClientRect();
        if (!canvas) throw new Error('Missing atlas canvas');
        return { scrollY, canvas: { width: canvas.width, height: canvas.height }, active: document.activeElement?.tagName ?? '' };
      })()`);

      await browser.click('.graph-navigator li > button:first-child');
      await browser.waitFor(`document.querySelector('.atlas-dock')?.getAttribute('data-open') === 'true' && Boolean(document.querySelector('.memory-overview h2')?.textContent)`);

      const after = await browser.evaluate<{
        scrollY: number;
        canvas: { width: number; height: number };
        active: string;
        dockInside: boolean;
        dialogCount: number;
      }>(`(() => {
        const canvas=document.querySelector('[data-testid="map-canvas-shell"]')?.getBoundingClientRect();
        const stage=document.querySelector('.map-stage')?.getBoundingClientRect();
        const dock=document.querySelector('.atlas-dock')?.getBoundingClientRect();
        if (!canvas || !stage || !dock) throw new Error('Missing in-atlas details');
        return {
          scrollY,
          canvas: { width: canvas.width, height: canvas.height },
          active: document.activeElement?.tagName ?? '',
          dockInside: dock.left >= stage.left - 1 && dock.right <= stage.right + 1 && dock.top >= stage.top - 1 && dock.bottom <= stage.bottom + 1,
          dialogCount: document.querySelectorAll('.memory-overview[role="dialog"]').length,
        };
      })()`);

      expect(Math.abs(after.scrollY - before.scrollY)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.canvas.width - before.canvas.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(after.canvas.height - before.canvas.height)).toBeLessThanOrEqual(2);
      expect(after.active).toBe(before.active);
      expect(after.dockInside).toBe(true);
      expect(after.dialogCount).toBe(0);

      await browser.click('.atlas-dock-close');
      await browser.waitFor(`document.querySelector('.atlas-dock')?.getAttribute('data-open') === 'false'`);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-last-command')).toBe('zoom-in');
    }, { observations: 24 });
  }, 40_000);
  it('presents exploration, details and administration around user goals', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/?project=browser-nebula');
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 0`);
      expect(await browser.text('.observatory-header h1')).toContain('Memory universe');
      expect(await browser.text('.observatory-tabs')).toContain('Overview');
      expect(await browser.text('.observatory-tabs')).toContain('Related');
      expect(await browser.text('.observatory-tabs')).toContain('Story');
      expect(await browser.text('.observatory-tabs')).toContain('Changes');
      expect(await browser.text('.observatory-tabs')).toContain('Health');
      expect(await browser.text('.observatory-context-strip')).not.toContain('Context:');

      await browser.clickText('.graph-navigator li > button:first-child', 'Browser memory 1');
      await browser.waitFor(`document.querySelector('.memory-overview h2')?.textContent?.includes('Browser memory 1')`);
      expect(await browser.text('.memory-overview .lens-kicker')).toContain('Memory overview');
      expect(await browser.count('.memory-overview .lens-primary-action')).toBe(1);
      expect(await browser.text('.memory-overview .lens-primary-action')).toContain('Explore connections');
      expect(await browser.count('.memory-overview details.technical-disclosure:not([open])')).toBe(1);
      expect(await browser.evaluate(`document.querySelector('.memory-overview')?.innerText.includes('obs:1')`)).toBe(false);
      expect(await browser.evaluate<boolean>('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      expect(await browser.evaluate<number>('scrollX')).toBe(0);

      await browser.goto('/console/operations');
      await browser.waitFor(`document.querySelector('.control-room')`);
      expect(await browser.text('.control-room-header h1')).toContain('Capture and maintain memories');
      expect(await browser.count('.control-room [data-user-goal]')).toBeGreaterThanOrEqual(2);
      expect(await browser.count('.control-room .primary-action')).toBe(1);
      expect(await browser.count('.control-room details.technical-disclosure')).toBeGreaterThanOrEqual(1);
    }, { observations: 12 });
  }, 40_000);
});
