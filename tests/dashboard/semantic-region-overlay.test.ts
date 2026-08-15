import { describe, expect, it } from 'vitest';
import { buildSemanticRegionOverlays } from '../../dashboard/src/components/map/semantic-region-overlay.js';

describe('semantic region overlay geometry', () => {
  it('omits semantic regions until real projected source points are available', () => {
    expect(buildSemanticRegionOverlays([
      { id: 'project:empty', label: 'Empty', memberCount: 12, color: '#4ee8dc', focused: false, points: [] },
    ], { width: 320, height: 180 })).toEqual([]);
  });

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

  it('contains sparse, collinear, and single-core groups and translates with their projected sources', () => {
    const cases = [
      { id: 'project:single', label: 'Single', memberCount: 1, color: '#4ee8dc', focused: false, points: [{ x: 90, y: 80 }] },
      { id: 'project:pair', label: 'Pair', memberCount: 2, color: '#8ab8ff', focused: false, points: [{ x: 150, y: 110 }, { x: 205, y: 110 }] },
      { id: 'project:line', label: 'Line', memberCount: 4, color: '#d6a8ff', focused: false, points: [{ x: 250, y: 150 }, { x: 275, y: 150 }, { x: 300, y: 150 }, { x: 325, y: 150 }] },
    ];
    const base = buildSemanticRegionOverlays(cases, { width: 480, height: 300 });
    expect(base).toHaveLength(3);
    for (const region of cases) {
      const overlay = base.find((candidate) => candidate.id === region.id)!;
      expect(overlay.sourcePointCount).toBe(region.points.length);
      for (const point of region.points) {
        expect(point.x).toBeGreaterThanOrEqual(overlay.bounds.x);
        expect(point.x).toBeLessThanOrEqual(overlay.bounds.x + overlay.bounds.width);
        expect(point.y).toBeGreaterThanOrEqual(overlay.bounds.y);
        expect(point.y).toBeLessThanOrEqual(overlay.bounds.y + overlay.bounds.height);
      }
    }

    const translated = buildSemanticRegionOverlays(cases.map((region) => ({
      ...region,
      points: region.points.map((point) => ({ x: point.x + 40, y: point.y + 24 })),
    })), { width: 560, height: 360 });
    const baseSingle = base.find((overlay) => overlay.id === 'project:single')!;
    const translatedSingle = translated.find((overlay) => overlay.id === 'project:single')!;
    expect(translatedSingle.bounds.x - baseSingle.bounds.x).toBeCloseTo(40, 1);
    expect(translatedSingle.bounds.y - baseSingle.bounds.y).toBeCloseTo(24, 1);
    expect(translatedSingle.labelAnchor.x - baseSingle.labelAnchor.x).toBeCloseTo(40, 1);
    expect(translatedSingle.labelAnchor.y - baseSingle.labelAnchor.y).toBeCloseTo(24, 1);
  });

  it('suppresses a colliding label instead of scattering it away from its contour', () => {
    const crowded = buildSemanticRegionOverlays(Array.from({ length: 8 }, (_, index) => ({
      id: `project:${index}`,
      label: `Project ${index}`,
      memberCount: 10 - index,
      color: '#4ee8dc',
      focused: false,
      points: [{ x: 150 + (index % 2) * 4, y: 90 + (index % 3) * 3 }],
    })), { width: 320, height: 180 });
    expect(crowded.some((overlay) => overlay.labelVisible)).toBe(true);
    expect(crowded.some((overlay) => !overlay.labelVisible)).toBe(true);
    for (const overlay of crowded.filter((candidate) => candidate.labelVisible)) {
      const horizontalGap = Math.max(
        overlay.bounds.x - (overlay.labelBounds.x + overlay.labelBounds.width),
        overlay.labelBounds.x - (overlay.bounds.x + overlay.bounds.width),
        0,
      );
      const verticalGap = Math.max(
        overlay.bounds.y - (overlay.labelBounds.y + overlay.labelBounds.height),
        overlay.labelBounds.y - (overlay.bounds.y + overlay.bounds.height),
        0,
      );
      expect(Math.hypot(horizontalGap, verticalGap)).toBeLessThanOrEqual(12);
    }
  });

  it('treats fixed interface bounds as occupied label space', () => {
    const [overlay] = buildSemanticRegionOverlays([{
      id: 'project:fixed-ui',
      label: 'Fixed UI project',
      memberCount: 3,
      color: '#67e8f9',
      focused: false,
      points: [{ id: 'community:1', x: 160, y: 100 }],
      cameraBound: true,
    }], { width: 320, height: 200 }, [{ x: 0, y: 0, width: 320, height: 200 }]);

    expect(overlay?.labelVisible).toBe(false);
    expect(overlay?.sourcePointCount).toBe(1);
  });
});
