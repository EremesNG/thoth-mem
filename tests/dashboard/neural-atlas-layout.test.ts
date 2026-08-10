import { describe, expect, it } from 'vitest';

import {
  buildNeuralAtlasLayout,
  type NeuralAtlasLayoutNode,
} from '../../dashboard/src/components/map/neural-atlas-layout.js';

function node(
  id: string,
  seedX: number,
  seedY: number,
  community = 0,
  degree = 1,
): NeuralAtlasLayoutNode {
  return { id, seedX, seedY, community, degree };
}

function aspect(layout: ReturnType<typeof buildNeuralAtlasLayout>): number {
  return layout.extent.width / layout.extent.height;
}

describe('Neural Atlas world layout', () => {
  it('derives deterministic finite world coordinates without a viewport input', () => {
    const nodes = [
      node('obs:a', -8, -2, 0, 4),
      node('obs:b', -5, 3, 0, 2),
      node('obs:c', 2, -1, 1, 3),
      node('obs:d', 9, 4, 1, 1),
      node('obs:isolated', 14, -5, 2, 0),
    ];
    const links = [[0, 1], [1, 2], [2, 3]] as Array<[number, number]>;

    const first = buildNeuralAtlasLayout(nodes, links);
    const second = buildNeuralAtlasLayout(nodes, links);

    expect(first).toEqual(second);
    expect(first.positions).toHaveLength(nodes.length * 2);
    expect(first.positions.every(Number.isFinite)).toBe(true);
    expect(first.clusterCenters.every(Number.isFinite)).toBe(true);
    expect(first.clusterStrengths.every(Number.isFinite)).toBe(true);
    expect(first.extent).toMatchObject({ nodeCount: 5, communityCount: 3 });
    expect(first.extent.width).toBeGreaterThan(0);
    expect(first.extent.height).toBeGreaterThan(0);
  });

  it('preserves the natural aspect of wide and tall seed worlds instead of squaring them', () => {
    const wide = buildNeuralAtlasLayout([
      node('wide:a', 0, 0),
      node('wide:b', 10, 0.5),
      node('wide:c', 20, 2),
    ], [[0, 1], [1, 2]]);
    const tall = buildNeuralAtlasLayout([
      node('tall:a', 0, 0),
      node('tall:b', 0.5, 10),
      node('tall:c', 2, 20),
    ], [[0, 1], [1, 2]]);

    expect(aspect(wide)).toBeCloseTo(10, 1);
    expect(aspect(tall)).toBeCloseTo(0.1, 2);
    expect(aspect(wide)).toBeGreaterThan(4);
    expect(aspect(tall)).toBeLessThan(0.25);
  });

  it('keeps sparse, disconnected, and coincident fixtures usable', () => {
    const single = buildNeuralAtlasLayout([node('only', 4, 4, 0, 0)], []);
    const coincident = buildNeuralAtlasLayout([
      node('same:a', 1, 1, 0, 2),
      node('same:b', 1, 1, 0, 1),
      node('same:c', 1, 1, 1, 1),
      node('same:d', 1, 1, 2, 0),
    ], [[0, 1]]);

    expect(single.positions).toHaveLength(2);
    expect(single.extent.width).toBeGreaterThan(0);
    expect(single.extent.height).toBeGreaterThan(0);
    expect(new Set(coincident.positions.map((value) => Math.round(value * 1000))).size).toBeGreaterThan(1);
    expect(coincident.extent.width).toBeGreaterThan(0);
    expect(coincident.extent.height).toBeGreaterThan(0);
    expect(coincident.clusterCenters).toHaveLength(6);
  });

  it('turns interleaved seeds into readable community constellations', () => {
    const layout = buildNeuralAtlasLayout([
      node('alpha:hub', -10, -2, 0, 5),
      node('beta:hub', -8, 2, 1, 5),
      node('alpha:one', 4, 1, 0, 2),
      node('beta:one', 5, -1, 1, 2),
      node('alpha:two', 9, -2, 0, 1),
      node('beta:two', 10, 2, 1, 1),
    ], [[0, 2], [0, 4], [1, 3], [1, 5], [0, 1]]);
    const point = (index: number): [number, number] => [layout.positions[index * 2], layout.positions[index * 2 + 1]];
    const distance = (left: number, right: number) => Math.hypot(
      point(left)[0] - point(right)[0],
      point(left)[1] - point(right)[1],
    );
    const within = [distance(0, 2), distance(0, 4), distance(1, 3), distance(1, 5)];
    const across = [distance(0, 1), distance(2, 3), distance(4, 5)];

    expect(Math.max(...within)).toBeLessThan(Math.min(...across));
    expect(layout.extent.width / layout.extent.height).toBeGreaterThan(1.35);
  });
});
