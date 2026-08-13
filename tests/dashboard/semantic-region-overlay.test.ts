import { describe, expect, it } from 'vitest';
import { buildSemanticRegionOverlays } from '../../dashboard/src/components/map/semantic-region-overlay.js';

describe('semantic region overlay geometry', () => {
  it('returns deterministic density envelopes derived from rendered stars inside the host', () => {
    const regions = [
      { id: 'region:a', label: 'Alpha', memberCount: 20, color: '#4ee8dc', focused: true, points: [{ x: 20, y: 30 }, { x: 80, y: 35 }, { x: 55, y: 90 }] },
      { id: 'region:b', label: 'Beta', memberCount: 1, color: '#8ab8ff', focused: false, points: [{ x: 180, y: 120 }] },
      { id: 'region:c', label: 'Gamma', memberCount: 2, color: '#d6a8ff', focused: false, points: [{ x: 250, y: 40 }, { x: 250, y: 40 }] },
    ];
    const first = buildSemanticRegionOverlays(regions, { width: 320, height: 180 });
    const reversed = buildSemanticRegionOverlays([...regions].reverse().map((region) => ({ ...region, points: [...region.points].reverse() })), { width: 320, height: 180 });
    expect(reversed).toEqual(first);
    expect(first).toHaveLength(3);
    expect(first.every((overlay) => overlay.path.startsWith('M') && !overlay.path.match(/NaN|Infinity/))).toBe(true);
    expect(first.every((overlay) => overlay.labelAnchor.x >= 0 && overlay.labelAnchor.x <= 320)).toBe(true);
    expect(first.every((overlay) => overlay.labelAnchor.y >= 0 && overlay.labelAnchor.y <= 180)).toBe(true);
    expect(first.every((overlay) => (
      overlay.bounds.x >= 0
      && overlay.bounds.y >= 0
      && overlay.bounds.x + overlay.bounds.width <= 320
      && overlay.bounds.y + overlay.bounds.height <= 180
    ))).toBe(true);
    expect(first.every((overlay) => (
      overlay.labelBounds.x >= 0
      && overlay.labelBounds.y >= 0
      && overlay.labelBounds.x + overlay.labelBounds.width <= 320
      && overlay.labelBounds.y + overlay.labelBounds.height <= 180
    ))).toBe(true);
    for (const [index, overlay] of first.entries()) {
      for (const peer of first.slice(index + 1)) {
        const overlaps = overlay.labelBounds.x < peer.labelBounds.x + peer.labelBounds.width
          && overlay.labelBounds.x + overlay.labelBounds.width > peer.labelBounds.x
          && overlay.labelBounds.y < peer.labelBounds.y + peer.labelBounds.height
          && overlay.labelBounds.y + overlay.labelBounds.height > peer.labelBounds.y;
        expect(overlaps, `${overlay.id} overlaps ${peer.id}`).toBe(false);
      }
    }
    expect(first.find((overlay) => overlay.id === 'region:a')).toMatchObject({ focused: true });
    const cloud = first.find((overlay) => overlay.id === 'region:a')!;
    expect(cloud.path).toMatch(/Q|C/);
    expect(cloud.path).not.toMatch(/\sL\s/);
    expect(cloud.sourcePointCount).toBe(3);
    expect(cloud.lobeCount).toBeGreaterThan(3);
    expect(cloud.lobeCount).not.toBe(12);
    expect(cloud.bounds.x).toBeGreaterThanOrEqual(12);
    expect(cloud.bounds.y).toBeGreaterThanOrEqual(12);
    expect(cloud.bounds.x + cloud.bounds.width).toBeLessThanOrEqual(308);
    expect(cloud.bounds.y + cloud.bounds.height).toBeLessThanOrEqual(168);
  });
});
