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
  it('presents exploration, details and administration around user goals', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/?project=browser-nebula');
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 0`);
      expect(await browser.text('.observatory-header h1')).toContain('Explore your memory');
      expect(await browser.text('.observatory-tabs')).toContain('Explore');
      expect(await browser.text('.observatory-tabs')).toContain('Find related');
      expect(await browser.text('.observatory-tabs')).toContain('Follow the story');
      expect(await browser.text('.observatory-tabs')).toContain('See what changed');
      expect(await browser.text('.observatory-tabs')).toContain('Check readiness');
      expect(await browser.text('.observatory-context-strip')).not.toContain('Context:');

      await browser.clickText('.graph-navigator li > button:first-child', 'Browser memory 1');
      await browser.waitFor(`document.querySelector('.memory-lens h2')?.textContent?.includes('Browser memory 1')`);
      expect(await browser.text('.memory-lens .lens-kicker')).toContain('Memory details');
      expect(await browser.count('.memory-lens .lens-primary-action')).toBe(1);
      expect(await browser.text('.memory-lens .lens-primary-action')).toContain('Explore connections');
      expect(await browser.count('.memory-lens details.technical-disclosure:not([open])')).toBe(1);
      expect(await browser.evaluate(`document.querySelector('.memory-lens')?.innerText.includes('obs:1')`)).toBe(false);
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
