const WORLD_LONG_AXIS = 1_200;
const MIN_WORLD_SPAN = 96;
const COINCIDENT_JITTER = 34;
const MIN_CLUSTER_DISTANCE = 420;
const WORLD_CENTER = 2_048;

export interface NeuralAtlasLayoutNode {
  id: string;
  seedX: number;
  seedY: number;
  community: number;
  degree: number;
}

export interface NeuralAtlasWorldExtent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  nodeCount: number;
  communityCount: number;
}

export interface NeuralAtlasLayout {
  positions: number[];
  clusterCenters: number[];
  clusterStrengths: number[];
  extent: NeuralAtlasWorldExtent;
}

export function buildNeuralAtlasLayout(
  nodes: NeuralAtlasLayoutNode[],
  links: Array<readonly [number, number]>,
): NeuralAtlasLayout {
  if (nodes.length === 0) {
    return {
      positions: [],
      clusterCenters: [],
      clusterStrengths: [],
      extent: {
        minX: -MIN_WORLD_SPAN / 2,
        minY: -MIN_WORLD_SPAN / 2,
        maxX: MIN_WORLD_SPAN / 2,
        maxY: MIN_WORLD_SPAN / 2,
        width: MIN_WORLD_SPAN,
        height: MIN_WORLD_SPAN,
        nodeCount: 0,
        communityCount: 0,
      },
    };
  }

  const seeds = nodes.map((node) => ({
    x: finiteSeed(node.seedX, node.id, 0),
    y: finiteSeed(node.seedY, node.id, 1),
  }));
  const seedMinX = Math.min(...seeds.map((seed) => seed.x));
  const seedMaxX = Math.max(...seeds.map((seed) => seed.x));
  const seedMinY = Math.min(...seeds.map((seed) => seed.y));
  const seedMaxY = Math.max(...seeds.map((seed) => seed.y));
  const seedWidth = seedMaxX - seedMinX;
  const seedHeight = seedMaxY - seedMinY;
  const seedLongAxis = Math.max(seedWidth, seedHeight);
  const communityIndices = [...new Set(nodes.map((node) => node.community))]
    .sort((left, right) => left - right);
  const naturalAspect = seedHeight > 0 ? seedWidth / seedHeight : seedWidth > 0 ? 4 : 1;
  const rawLayout = communityIndices.length > 1
    ? layoutCommunityConstellations(nodes, communityIndices, naturalAspect)
    : layoutNaturalSeeds(nodes, seeds, seedWidth, seedHeight, seedLongAxis, seedMinX, seedMaxX, seedMinY, seedMaxY);
  const rawExtent = worldExtent(rawLayout.positions, nodes.length, communityIndices.length);
  // Cosmos simulates inside a positive world; centering here prevents negative coordinates clamping to its axes.
  const offsetX = WORLD_CENTER - (rawExtent.minX + rawExtent.maxX) / 2;
  const offsetY = WORLD_CENTER - (rawExtent.minY + rawExtent.maxY) / 2;
  const positions = rawLayout.positions.map((value, index) => value + (index % 2 === 0 ? offsetX : offsetY));
  const centerByCommunity = new Map(
    [...rawLayout.centers].map(([community, center]): [number, [number, number]] => [
      community,
      [center[0] + offsetX, center[1] + offsetY],
    ]),
  );

  const maximumCommunity = Math.max(...communityIndices);
  const clusterCenters = Array.from({ length: (maximumCommunity + 1) * 2 }, () => 0);
  for (const community of communityIndices) {
    const center = centerByCommunity.get(community)!;
    clusterCenters[community * 2] = center[0];
    clusterCenters[community * 2 + 1] = center[1];
  }

  const linkedDegrees = Array.from({ length: nodes.length }, () => 0);
  for (const [source, target] of links) {
    if (source >= 0 && source < nodes.length) linkedDegrees[source] += 1;
    if (target >= 0 && target < nodes.length) linkedDegrees[target] += 1;
  }
  const clusterStrengths = nodes.map((node, index) => {
    const degree = Math.max(node.degree, linkedDegrees[index]);
    return 0.035 + Math.min(0.075, Math.sqrt(Math.max(0, degree)) * 0.018);
  });

  return {
    positions,
    clusterCenters,
    clusterStrengths,
    extent: worldExtent(positions, nodes.length, communityIndices.length),
  };
}

function layoutNaturalSeeds(
  nodes: NeuralAtlasLayoutNode[],
  seeds: Array<{ x: number; y: number }>,
  seedWidth: number,
  seedHeight: number,
  seedLongAxis: number,
  seedMinX: number,
  seedMaxX: number,
  seedMinY: number,
  seedMaxY: number,
): { positions: number[]; centers: Map<number, [number, number]> } {
  const scale = seedLongAxis > 0 ? WORLD_LONG_AXIS / seedLongAxis : 1;
  const centerX = (seedMinX + seedMaxX) / 2;
  const centerY = (seedMinY + seedMaxY) / 2;
  const duplicateCounts = new Map<string, number>();
  for (const seed of seeds) {
    const key = seedKey(seed.x, seed.y);
    duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
  }

  const positions = nodes.flatMap((node, index) => {
    const seed = seeds[index];
    let x = (seed.x - centerX) * scale;
    let y = (seed.y - centerY) * scale;
    const coincident = seedLongAxis === 0 || (duplicateCounts.get(seedKey(seed.x, seed.y)) ?? 0) > 1;
    if (coincident || seedWidth === 0 || seedHeight === 0) {
      const angle = stableUnit(node.id, 'angle') * Math.PI * 2;
      const radius = COINCIDENT_JITTER + Math.min(8, Math.max(0, node.degree)) * 2;
      if (coincident || seedWidth === 0) x += Math.cos(angle) * radius;
      if (coincident || seedHeight === 0) y += Math.sin(angle) * radius;
    }
    return [x, y];
  });
  const community = nodes[0]?.community ?? 0;
  const center = positions.length === 2
    ? [positions[0], positions[1]] as [number, number]
    : [
        positions.filter((_value, index) => index % 2 === 0).reduce((sum, value) => sum + value, 0) / nodes.length,
        positions.filter((_value, index) => index % 2 === 1).reduce((sum, value) => sum + value, 0) / nodes.length,
      ] as [number, number];
  return { positions, centers: new Map([[community, center]]) };
}

function layoutCommunityConstellations(
  nodes: NeuralAtlasLayoutNode[],
  communityIndices: number[],
  naturalAspect: number,
): { positions: number[]; centers: Map<number, [number, number]> } {
  const members = new Map<number, number[]>();
  for (const community of communityIndices) members.set(community, []);
  nodes.forEach((node, index) => members.get(node.community)?.push(index));
  for (const indices of members.values()) {
    indices.sort((left, right) => nodes[right].degree - nodes[left].degree || nodes[left].id.localeCompare(nodes[right].id));
  }

  const rankedCommunities = [...communityIndices].sort((left, right) =>
    (members.get(right)?.length ?? 0) - (members.get(left)?.length ?? 0) || left - right,
  );
  const aspect = Math.max(0.58, Math.min(1.9, naturalAspect || 1));
  const horizontal = aspect >= 1;
  const radius = 330 + Math.sqrt(nodes.length) * 18;
  const radiusX = horizontal ? radius * Math.sqrt(aspect) : radius * 0.74;
  const radiusY = horizontal ? radius / Math.sqrt(aspect) * 0.74 : radius / Math.sqrt(aspect);
  const centers = new Map<number, [number, number]>();

  if (rankedCommunities.length === 2) {
    const [first, second] = rankedCommunities;
    const separation = Math.max(MIN_CLUSTER_DISTANCE, horizontal ? radiusX : radiusY);
    centers.set(first, horizontal ? [-separation / 2, -separation * 0.18] : [-separation * 0.18, -separation / 2]);
    centers.set(second, horizontal ? [separation / 2, separation * 0.18] : [separation * 0.18, separation / 2]);
  } else {
    centers.set(rankedCommunities[0], [0, 0]);
    const orbiting = rankedCommunities.slice(1);
    orbiting.forEach((community, index) => {
      const angle = -Math.PI / 2 + (index / orbiting.length) * Math.PI * 2;
      centers.set(community, [Math.cos(angle) * radiusX, Math.sin(angle) * radiusY]);
    });
  }

  const positions = Array.from({ length: nodes.length * 2 }, () => 0);
  for (const community of communityIndices) {
    const center = centers.get(community)!;
    const indices = members.get(community)!;
    const phase = stableUnit(`community:${community}`, 'phase') * Math.PI * 2;
    indices.forEach((nodeIndex, rank) => {
      const node = nodes[nodeIndex];
      const ring = rank === 0 ? 0 : Math.floor((rank - 1) / 7) + 1;
      const slot = rank === 0 ? 0 : (rank - 1) % 7;
      const angle = phase + slot * (Math.PI * 2 / 7) + ring * 0.31;
      const localRadius = rank === 0 ? 0 : 54 + ring * 46 + stableUnit(node.id, 'radius') * 18;
      const degreePull = 1 - Math.min(0.24, Math.log2(Math.max(0, node.degree) + 1) * 0.045);
      positions[nodeIndex * 2] = center[0] + Math.cos(angle) * localRadius * 1.12 * degreePull;
      positions[nodeIndex * 2 + 1] = center[1] + Math.sin(angle) * localRadius * degreePull;
    });
  }
  return { positions, centers };
}

function worldExtent(
  positions: number[],
  nodeCount: number,
  communityCount: number,
): NeuralAtlasWorldExtent {
  const xs = positions.filter((_value, index) => index % 2 === 0);
  const ys = positions.filter((_value, index) => index % 2 === 1);
  const rawMinX = Math.min(...xs);
  const rawMaxX = Math.max(...xs);
  const rawMinY = Math.min(...ys);
  const rawMaxY = Math.max(...ys);
  const rawWidth = rawMaxX - rawMinX;
  const rawHeight = rawMaxY - rawMinY;
  const width = Math.max(MIN_WORLD_SPAN, rawWidth);
  const height = Math.max(MIN_WORLD_SPAN, rawHeight);
  const centerX = (rawMinX + rawMaxX) / 2;
  const centerY = (rawMinY + rawMaxY) / 2;
  return {
    minX: centerX - width / 2,
    minY: centerY - height / 2,
    maxX: centerX + width / 2,
    maxY: centerY + height / 2,
    width,
    height,
    nodeCount,
    communityCount,
  };
}

function finiteSeed(value: number, id: string, axis: number): number {
  if (Number.isFinite(value)) return value;
  return stableUnit(id, `axis:${axis}`) * 2 - 1;
}

function seedKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function stableUnit(value: string, salt: string): number {
  let hash = 2_166_136_261;
  const input = `${salt}:${value}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 4_294_967_295;
}
