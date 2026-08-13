const WORLD_LONG_AXIS = 1_200;
const MIN_WORLD_SPAN = 96;
const COINCIDENT_JITTER = 34;
const MIN_CLUSTER_DISTANCE = 420;
const WORLD_CENTER = 2_048;
const UNIVERSE_WIDTH = 1_120;
const UNIVERSE_HEIGHT = 700;

export type NeuralAtlasLayoutLevel = 'universe' | 'community' | 'neighborhood' | 'raw';

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

export function preserveNeuralAtlasPositions(
  previousIds: readonly string[],
  previousPositions: readonly number[],
  nextIds: readonly string[],
  nextPositions: readonly number[],
): number[] {
  const previousIndexById = new Map(previousIds.map((id, index) => [id, index]));
  return nextIds.flatMap((id, nextIndex) => {
    const previousIndex = previousIndexById.get(id);
    if (previousIndex !== undefined) {
      const previousX = previousPositions[previousIndex * 2];
      const previousY = previousPositions[previousIndex * 2 + 1];
      if (Number.isFinite(previousX) && Number.isFinite(previousY)) return [previousX, previousY];
    }
    const nextX = nextPositions[nextIndex * 2];
    const nextY = nextPositions[nextIndex * 2 + 1];
    return [Number.isFinite(nextX) ? nextX : 0, Number.isFinite(nextY) ? nextY : 0];
  });
}

export function buildNeuralAtlasLayout(
  nodes: NeuralAtlasLayoutNode[],
  links: Array<readonly [number, number]>,
  level: NeuralAtlasLayoutLevel = 'raw',
  focusIndex?: number,
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
  const rawLayout = level === 'universe'
    ? layoutUniverseNetwork(nodes, links)
    : level === 'neighborhood'
    ? layoutNeighborhoodSupport(nodes, links, focusIndex)
    : communityIndices.length > 1
    ? layoutCommunityConstellations(nodes, links, communityIndices, naturalAspect)
    : layoutNaturalSeeds(nodes, seeds, seedWidth, seedHeight, seedLongAxis, seedMinX, seedMaxX, seedMinY, seedMaxY);
  const rawExtent = worldExtent(rawLayout.positions, nodes.length, communityIndices.length);
  // Cosmos simulates inside a positive world; centering here prevents negative coordinates clamping to its axes.
  const centeredNode = level === 'neighborhood' && focusIndex !== undefined && nodes[focusIndex]
    ? focusIndex
    : null;
  const offsetX = WORLD_CENTER - (centeredNode === null
    ? (rawExtent.minX + rawExtent.maxX) / 2
    : rawLayout.positions[centeredNode * 2]!);
  const offsetY = WORLD_CENTER - (centeredNode === null
    ? (rawExtent.minY + rawExtent.maxY) / 2
    : rawLayout.positions[centeredNode * 2 + 1]!);
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
    if (level === 'universe') return 0;
    if (level === 'neighborhood') return 0.42;
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

function layoutNeighborhoodSupport(
  nodes: NeuralAtlasLayoutNode[],
  links: Array<readonly [number, number]>,
  focusIndex?: number,
): { positions: number[]; centers: Map<number, [number, number]> } {
  const neighbors = nodes.map(() => new Set<number>());
  for (const [source, target] of links) {
    if (!nodes[source] || !nodes[target] || source === target) continue;
    neighbors[source]!.add(target);
    neighbors[target]!.add(source);
  }
  const hub = focusIndex !== undefined && nodes[focusIndex]
    ? focusIndex
    : nodes.map((_node, index) => index).sort((left, right) =>
    neighbors[right]!.size - neighbors[left]!.size
    || nodes[right]!.degree - nodes[left]!.degree
    || nodes[left]!.id.localeCompare(nodes[right]!.id))[0] ?? 0;
  const depth = Array.from({ length: nodes.length }, () => Number.POSITIVE_INFINITY);
  const parent = Array.from({ length: nodes.length }, () => -1);
  depth[hub] = 0;
  const queue = [hub];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    for (const next of [...neighbors[current]!].sort((left, right) => nodes[left]!.id.localeCompare(nodes[right]!.id))) {
      if (Number.isFinite(depth[next])) continue;
      depth[next] = depth[current]! + 1;
      parent[next] = current;
      queue.push(next);
    }
  }
  const maximumConnectedDepth = Math.max(0, ...depth.filter(Number.isFinite));
  const rings = new Map<number, number[]>();
  nodes.forEach((_node, index) => {
    const ring = Number.isFinite(depth[index]) ? depth[index]! : maximumConnectedDepth + 1;
    const members = rings.get(ring) ?? [];
    members.push(index);
    rings.set(ring, members);
  });
  const positions = Array.from({ length: nodes.length * 2 }, () => 0);
  const angleByNode = Array.from({ length: nodes.length }, () => 0);
  const firstHop = [...(neighbors[hub] ?? [])].sort((left, right) => (
    neighbors[right]!.size - neighbors[left]!.size || nodes[left]!.id.localeCompare(nodes[right]!.id)
  ));
  const firstHopAngle = new Map(firstHop.map((nodeIndex, rank) => [
    nodeIndex,
    rank / Math.max(1, firstHop.length) * Math.PI * 2 + stableUnit(nodes[nodeIndex]!.id, 'focus-branch') * 0.08,
  ]));
  for (const [ring, members] of [...rings].sort(([left], [right]) => left - right)) {
    members.sort((left, right) => nodes[right]!.degree - nodes[left]!.degree || nodes[left]!.id.localeCompare(nodes[right]!.id));
    if (ring === 0) continue;
    const radius = ring === 1 ? 78 + Math.sqrt(members.length) * 4
      : ring === 2 ? 146 + Math.sqrt(members.length) * 3
      : 176 + Math.min(34, (ring - 3) * 5);
    members.forEach((nodeIndex, rank) => {
      const parentAngle = parent[nodeIndex] >= 0 ? angleByNode[parent[nodeIndex]!] : rank / members.length * Math.PI * 2;
      const angle = ring === 1
        ? firstHopAngle.get(nodeIndex) ?? parentAngle
        : parentAngle + (stableUnit(nodes[nodeIndex]!.id, `support-branch:${ring}`) - 0.5) * (ring === 2 ? 0.34 : 0.2);
      angleByNode[nodeIndex] = angle;
      positions[nodeIndex * 2] = Math.cos(angle) * radius;
      positions[nodeIndex * 2 + 1] = Math.sin(angle) * radius;
    });
  }
  return {
    positions,
    centers: new Map([...new Set(nodes.map((node) => node.community))].map((community) => [community, [0, 0]])),
  };
}

function layoutUniverseNetwork(
  nodes: NeuralAtlasLayoutNode[],
  links: Array<readonly [number, number]>,
): { positions: number[]; centers: Map<number, [number, number]> } {
  const orderedIndices = nodes
    .map((_node, index) => index)
    .sort((left, right) => nodes[left].id.localeCompare(nodes[right].id));
  const positions = Array.from({ length: nodes.length * 2 }, () => 0);
  orderedIndices.forEach((nodeIndex) => {
    const id = nodes[nodeIndex].id;
    const x = stableUnit(id, 'universe-field-x') * 2 - 1;
    const y = stableUnit(id, 'universe-field-y') * 2 - 1;
    const warp = stableUnit(id, 'universe-field-warp') * Math.PI * 2;
    positions[nodeIndex * 2] = (x * 0.82 + Math.sin(warp + y * 2.4) * 0.18) * UNIVERSE_WIDTH * 0.44;
    positions[nodeIndex * 2 + 1] = (y * 0.78 + Math.cos(warp + x * 2.1) * 0.22) * UNIVERSE_HEIGHT * 0.44;
  });

  const orderedLinks = links
    .filter(([source, target]) => source !== target && nodes[source] && nodes[target])
    .map(([source, target]) => nodes[source].id.localeCompare(nodes[target].id) <= 0
      ? [source, target] as const
      : [target, source] as const)
    .sort(([leftSource, leftTarget], [rightSource, rightTarget]) =>
      nodes[leftSource].id.localeCompare(nodes[rightSource].id)
      || nodes[leftTarget].id.localeCompare(nodes[rightTarget].id));
  const idealDistance = Math.sqrt((UNIVERSE_WIDTH * UNIVERSE_HEIGHT) / Math.max(1, nodes.length));

  for (let iteration = 0; iteration < 120; iteration += 1) {
    const displacement = Array.from({ length: positions.length }, () => 0);
    for (let leftRank = 0; leftRank < orderedIndices.length; leftRank += 1) {
      const left = orderedIndices[leftRank];
      for (let rightRank = leftRank + 1; rightRank < orderedIndices.length; rightRank += 1) {
        const right = orderedIndices[rightRank];
        let dx = positions[left * 2] - positions[right * 2];
        let dy = positions[left * 2 + 1] - positions[right * 2 + 1];
        if (dx === 0 && dy === 0) {
          const phase = stableUnit(`${nodes[left].id}:${nodes[right].id}`, 'separate') * Math.PI * 2;
          dx = Math.cos(phase) * 0.01;
          dy = Math.sin(phase) * 0.01;
        }
        const distance = Math.max(1, Math.hypot(dx, dy));
        const force = (idealDistance * idealDistance) / distance * 0.12;
        const forceX = dx / distance * force;
        const forceY = dy / distance * force;
        displacement[left * 2] += forceX;
        displacement[left * 2 + 1] += forceY;
        displacement[right * 2] -= forceX;
        displacement[right * 2 + 1] -= forceY;
      }
    }
    for (const [source, target] of orderedLinks) {
      const dx = positions[source * 2] - positions[target * 2];
      const dy = positions[source * 2 + 1] - positions[target * 2 + 1];
      const distance = Math.max(1, Math.hypot(dx, dy));
      const force = distance * distance / idealDistance * 0.22;
      const forceX = dx / distance * force;
      const forceY = dy / distance * force;
      displacement[source * 2] -= forceX;
      displacement[source * 2 + 1] -= forceY;
      displacement[target * 2] += forceX;
      displacement[target * 2 + 1] += forceY;
    }
    const temperature = 38 * (1 - iteration / 120) + 2;
    for (const nodeIndex of orderedIndices) {
      displacement[nodeIndex * 2] -= positions[nodeIndex * 2] * 0.012;
      displacement[nodeIndex * 2 + 1] -= positions[nodeIndex * 2 + 1] * 0.012;
      const dx = displacement[nodeIndex * 2];
      const dy = displacement[nodeIndex * 2 + 1];
      const distance = Math.max(1, Math.hypot(dx, dy));
      positions[nodeIndex * 2] += dx / distance * Math.min(distance, temperature);
      positions[nodeIndex * 2 + 1] += dy / distance * Math.min(distance, temperature);
    }
  }

  normalizeUniverseExtent(positions);
  return {
    positions,
    centers: new Map(nodes.map((node, index) => [
      node.community,
      [positions[index * 2], positions[index * 2 + 1]] as [number, number],
    ])),
  };
}

function normalizeUniverseExtent(positions: number[]): void {
  const xs = positions.filter((_value, index) => index % 2 === 0);
  const ys = positions.filter((_value, index) => index % 2 === 1);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  // One scale keeps the simulated topology intact; scaling each axis separately recreates the viewport frame.
  const scale = Math.max(UNIVERSE_WIDTH, UNIVERSE_HEIGHT) / Math.max(width, height);
  for (let index = 0; index < positions.length; index += 2) {
    positions[index] = (positions[index] - centerX) * scale;
    positions[index + 1] = (positions[index + 1] - centerY) * scale;
  }
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
  links: Array<readonly [number, number]>,
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
    rankedCommunities.forEach((community, index) => {
      const angle = index * 2.399963229728653 + stableUnit(`community:${community}`, 'field-angle') * 0.42;
      const distance = Math.sqrt((index + 0.45) / rankedCommunities.length);
      const driftX = (stableUnit(`community:${community}`, 'field-x') - 0.5) * radiusX * 0.16;
      const driftY = (stableUnit(`community:${community}`, 'field-y') - 0.5) * radiusY * 0.16;
      centers.set(community, [
        Math.cos(angle) * radiusX * distance + driftX,
        Math.sin(angle) * radiusY * distance + driftY,
      ]);
    });
  }

  const bridgeWeights = new Map<string, number>();
  for (const [source, target] of links) {
    const sourceCommunity = nodes[source]?.community;
    const targetCommunity = nodes[target]?.community;
    if (sourceCommunity === undefined || targetCommunity === undefined || sourceCommunity === targetCommunity) continue;
    const [left, right] = sourceCommunity < targetCommunity
      ? [sourceCommunity, targetCommunity]
      : [targetCommunity, sourceCommunity];
    const key = `${left}:${right}`;
    bridgeWeights.set(key, (bridgeWeights.get(key) ?? 0) + 1);
  }
  for (let iteration = 0; iteration < 90; iteration += 1) {
    const movement = new Map(communityIndices.map((community) => [community, [0, 0] as [number, number]]));
    for (let leftIndex = 0; leftIndex < rankedCommunities.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < rankedCommunities.length; rightIndex += 1) {
        const left = rankedCommunities[leftIndex]!;
        const right = rankedCommunities[rightIndex]!;
        const leftCenter = centers.get(left)!;
        const rightCenter = centers.get(right)!;
        let dx = leftCenter[0] - rightCenter[0];
        let dy = leftCenter[1] - rightCenter[1];
        if (dx === 0 && dy === 0) dx = 0.01;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const minimum = 96 + (Math.sqrt(members.get(left)!.length) + Math.sqrt(members.get(right)!.length)) * 13;
        const repulsion = distance < minimum * 1.8 ? (minimum * minimum) / distance * 0.026 : 0;
        const bridge = bridgeWeights.get(`${Math.min(left, right)}:${Math.max(left, right)}`) ?? 0;
        const attraction = bridge > 0 ? Math.max(0, distance - minimum * 1.12) * Math.min(0.055, 0.018 + Math.log2(bridge + 1) * 0.008) : 0;
        const force = repulsion - attraction;
        movement.get(left)![0] += dx / distance * force;
        movement.get(left)![1] += dy / distance * force;
        movement.get(right)![0] -= dx / distance * force;
        movement.get(right)![1] -= dy / distance * force;
      }
    }
    const temperature = 10 * (1 - iteration / 90) + 0.6;
    for (const community of rankedCommunities) {
      const center = centers.get(community)!;
      const drift = movement.get(community)!;
      drift[0] -= center[0] * 0.0025;
      drift[1] -= center[1] * 0.0025;
      const distance = Math.max(1, Math.hypot(drift[0], drift[1]));
      center[0] += drift[0] / distance * Math.min(distance, temperature);
      center[1] += drift[1] / distance * Math.min(distance, temperature);
    }
  }

  const positions = Array.from({ length: nodes.length * 2 }, () => 0);
  for (const community of communityIndices) {
    const center = centers.get(community)!;
    const indices = members.get(community)!;
    indices.forEach((nodeIndex, rank) => {
      const node = nodes[nodeIndex];
      const density = Math.sqrt(rank + 0.4);
      const angle = rank * 2.399963229728653 + stableUnit(node.id, 'cloud-angle') * 0.55;
      const localRadius = rank === 0 ? 0 : 19 * density + stableUnit(node.id, 'radius') * 11;
      const degreePull = 1 - Math.min(0.24, Math.log2(Math.max(0, node.degree) + 1) * 0.045);
      const wobble = (stableUnit(node.id, 'cloud-wobble') - 0.5) * 18;
      positions[nodeIndex * 2] = center[0] + Math.cos(angle) * localRadius * 1.12 * degreePull + wobble * 0.4;
      positions[nodeIndex * 2 + 1] = center[1] + Math.sin(angle) * localRadius * 0.88 * degreePull - wobble * 0.18;
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
