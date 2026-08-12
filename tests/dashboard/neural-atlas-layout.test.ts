import { describe, expect, it } from 'vitest';

import {
  buildNeuralAtlasLayout,
  preserveNeuralAtlasPositions,
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

  it('places disconnected universe regions in an organic halo instead of a rectangular frame', () => {
    const nodes = Array.from({ length: 96 }, (_entry, index) => node(
      `region:${index.toString().padStart(3, '0')}`,
      index,
      (index * 17) % 23,
      index,
      index < 24 ? (index === 0 ? 23 : 3) : 0,
    ));
    const links: Array<[number, number]> = [];
    for (let index = 1; index < 24; index += 1) {
      links.push([0, index]);
      if (index > 1) links.push([index - 1, index]);
    }

    const layout = buildNeuralAtlasLayout(nodes, links, 'universe');
    const xs = nodes.map((_entry, index) => layout.positions[index * 2]);
    const ys = nodes.map((_entry, index) => layout.positions[index * 2 + 1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;
    const perimeterIndices = nodes
      .map((_entry, index) => index)
      .filter((index) => Math.min(
        (xs[index] - minX) / width,
        (maxX - xs[index]) / width,
        (ys[index] - minY) / height,
        (maxY - ys[index]) / height,
      ) <= 0.006);
    const exactSideCounts = [
      xs.filter((value) => Math.abs(value - minX) < 1e-6).length,
      xs.filter((value) => Math.abs(value - maxX) < 1e-6).length,
      ys.filter((value) => Math.abs(value - minY) < 1e-6).length,
      ys.filter((value) => Math.abs(value - maxY) < 1e-6).length,
    ];

    expect(perimeterIndices.length).toBeLessThan(nodes.length * 0.2);
    expect(Math.max(...exactSideCounts)).toBeLessThanOrEqual(2);
  });

  it('preserves existing world positions through incremental pages and repeated progression', () => {
    const prefixNodes = [
      node('alpha:anchor', -10, -2, 0, 5),
      node('alpha:one', -7, 2, 0, 2),
      node('beta:anchor', 8, -1, 1, 4),
      node('beta:one', 11, 3, 1, 1),
    ];
    const expandedNodes = [
      ...prefixNodes,
      node('alpha:later', -2, 4, 0, 9),
      node('beta:later', 17, -4, 1, 8),
      node('gamma:anchor', 25, 2, 2, 6),
    ];
    const prefix = buildNeuralAtlasLayout(prefixNodes, [[0, 1], [2, 3]]);
    const expanded = buildNeuralAtlasLayout(expandedNodes, [[0, 1], [2, 3], [0, 4], [2, 5], [5, 6]]);
    const merged = preserveNeuralAtlasPositions(
      prefixNodes.map((entry) => entry.id),
      prefix.positions,
      expandedNodes.map((entry) => entry.id),
      expanded.positions,
    );

    expect(merged.slice(0, prefix.positions.length)).toEqual(prefix.positions);
    expect(merged.slice(prefix.positions.length).every(Number.isFinite)).toBe(true);

    let progressed = merged;
    for (let step = 0; step < 24; step += 1) {
      const proposed = expanded.positions.map((value, index) => value + ((step + index) % 3) - 1);
      progressed = preserveNeuralAtlasPositions(
        expandedNodes.map((entry) => entry.id),
        progressed,
        expandedNodes.map((entry) => entry.id),
        proposed,
      );
    }
    expect(progressed).toEqual(merged);

    const xs = progressed.filter((_value, index) => index % 2 === 0);
    const ys = progressed.filter((_value, index) => index % 2 === 1);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(width / height).toBeGreaterThan(1.1);
  });
});
