export interface SemanticRegionOverlayInput {
  id: string;
  label: string;
  memberCount: number;
  color: string;
  focused: boolean;
  points: Array<{ x: number; y: number }>;
}

export interface SemanticRegionOverlay {
  id: string;
  label: string;
  memberCount: number;
  color: string;
  focused: boolean;
  path: string;
  labelAnchor: { x: number; y: number };
  bounds: { x: number; y: number; width: number; height: number };
  labelBounds: { x: number; y: number; width: number; height: number };
  sourcePointCount: number;
  lobeCount: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundedCloudPath(points: Array<{ x: number; y: number }>): string {
  const midpoint = (left: { x: number; y: number }, right: { x: number; y: number }) => ({
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  });
  const start = midpoint(points[points.length - 1]!, points[0]!);
  return [
    `M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
    ...points.map((point, index) => {
      const end = midpoint(point, points[(index + 1) % points.length]!);
      return `Q ${point.x.toFixed(2)} ${point.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
    }),
    'Z',
  ].join(' ');
}

function densityEnvelopePoints(
  id: string,
  points: Array<{ x: number; y: number }>,
  host: { width: number; height: number },
  margin: number,
  focused: boolean,
): Array<{ x: number; y: number }> {
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  center.x /= points.length;
  center.y /= points.length;
  const lobeCount = clamp(points.length * 2 + 3, 7, 17);
  const padding = clamp(18 + Math.sqrt(points.length) * 2.5, 20, 31);
  const extentX = Math.max(24, ...points.map((point) => Math.abs(point.x - center.x) + padding));
  const extentY = Math.max(22, ...points.map((point) => Math.abs(point.y - center.y) + padding));
  const radiusX = Math.min(extentX, Math.max(1, host.width * (focused ? 0.22 : 0.16)));
  const radiusY = Math.min(extentY, Math.max(1, host.height * (focused ? 0.26 : 0.19)));
  const safeCenter = {
    x: clamp(center.x, margin + radiusX, Math.max(margin + radiusX, host.width - margin - radiusX)),
    y: clamp(center.y, margin + radiusY, Math.max(margin + radiusY, host.height - margin - radiusY)),
  };
  const phase = ([...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 31) / 31;
  return Array.from({ length: lobeCount }, (_, index) => {
    const angle = (Math.PI * 2 * (index + phase * 0.18)) / lobeCount;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const support = points.reduce((maximum, point) => Math.max(
      maximum,
      (point.x - center.x) * direction.x + (point.y - center.y) * direction.y,
    ), 0);
    const radius = Math.max(padding, support + padding * (0.88 + 0.1 * Math.sin(index * 1.7 + phase * Math.PI)));
    const normalizedRadius = radius / Math.max(radiusX, radiusY);
    return {
      x: clamp(safeCenter.x + direction.x * Math.min(radiusX, radius * (0.92 + normalizedRadius * 0.08)), margin, host.width - margin),
      y: clamp(safeCenter.y + direction.y * Math.min(radiusY, radius * (0.92 + normalizedRadius * 0.08)), margin, host.height - margin),
    };
  });
}

export function buildSemanticRegionOverlays(
  inputs: SemanticRegionOverlayInput[],
  host: { width: number; height: number },
): SemanticRegionOverlay[] {
  const margin = 12;
  const shapes = [...inputs].sort((left, right) => left.id.localeCompare(right.id)).map((input) => {
    const finite = input.points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    const points = finite.length > 0 ? finite : [{ x: host.width / 2, y: host.height / 2 }];
    const padded = densityEnvelopePoints(input.id, points, host, margin, input.focused);
    const path = roundedCloudPath(padded);
    const contourPoints = padded;
    const contourXs = contourPoints.map((point) => point.x);
    const contourYs = contourPoints.map((point) => point.y);
    const bounds = {
      x: Math.min(...contourXs),
      y: Math.min(...contourYs),
      width: Math.max(...contourXs) - Math.min(...contourXs),
      height: Math.max(...contourYs) - Math.min(...contourYs),
    };
    return {
      id: input.id, label: input.label, memberCount: input.memberCount, color: input.color, focused: input.focused, path,
      bounds,
      sourcePointCount: finite.length,
      lobeCount: padded.length,
    };
  });
  const occupied: Array<{ x: number; y: number; width: number; height: number }> = [];
  return shapes.map((shape, index) => {
    const width = Math.min(Math.max(96, (`${shape.label} · ${shape.memberCount}`).length * 8.5 + 8), Math.max(1, host.width - margin * 2));
    const height = 22;
    const candidates = [
      { x: shape.bounds.x + shape.bounds.width / 2 - width / 2, y: shape.bounds.y - height - 6 },
      { x: shape.bounds.x + shape.bounds.width / 2 - width / 2, y: shape.bounds.y + shape.bounds.height + 6 },
      { x: shape.bounds.x + 8, y: shape.bounds.y + 8 },
      { x: shape.bounds.x + shape.bounds.width - width - 8, y: shape.bounds.y + 8 },
      ...Array.from({ length: 12 }, (_, slot) => ({
        x: margin + ((slot * 97 + index * 53) % Math.max(1, Math.floor(host.width - width - margin * 2))),
        y: margin + ((slot * 47 + index * 71) % Math.max(1, Math.floor(host.height - height - margin * 2))),
      })),
    ].map((candidate) => ({
      x: clamp(candidate.x, margin, Math.max(margin, host.width - margin - width)),
      y: clamp(candidate.y, margin, Math.max(margin, host.height - margin - height)),
      width,
      height,
    }));
    const labelBounds = candidates.find((candidate) => occupied.every((peer) => (
      candidate.x + candidate.width <= peer.x
      || peer.x + peer.width <= candidate.x
      || candidate.y + candidate.height <= peer.y
      || peer.y + peer.height <= candidate.y
    ))) ?? candidates[0]!;
    occupied.push(labelBounds);
    return {
      ...shape,
      labelAnchor: { x: labelBounds.x, y: labelBounds.y + labelBounds.height - 5 },
      labelBounds,
    };
  });
}
