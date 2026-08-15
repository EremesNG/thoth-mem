export interface GuidedSelectRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface GuidedSelectViewport {
  offsetLeft: number;
  offsetTop: number;
  width: number;
  height: number;
}

export interface GuidedSelectPlacement {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: 'above' | 'below';
}

interface GuidedSelectPlacementInput {
  trigger: GuidedSelectRect;
  viewport: GuidedSelectViewport;
  contentHeight: number;
  minimumWidth?: number;
  collisionMargin?: number;
  gap?: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function placeGuidedSelect({
  trigger,
  viewport,
  contentHeight,
  minimumWidth = 210,
  collisionMargin = 8,
  gap = 6,
}: GuidedSelectPlacementInput): GuidedSelectPlacement {
  const viewportLeft = viewport.offsetLeft + collisionMargin;
  const viewportTop = viewport.offsetTop + collisionMargin;
  const viewportRight = viewport.offsetLeft + viewport.width - collisionMargin;
  const viewportBottom = viewport.offsetTop + viewport.height - collisionMargin;
  const availableWidth = Math.max(0, viewportRight - viewportLeft);
  const width = Math.min(availableWidth, Math.max(minimumWidth, trigger.width));
  const left = clamp(trigger.left, viewportLeft, viewportRight - width);
  const belowTop = clamp(trigger.bottom + gap, viewportTop, viewportBottom);
  const availableBelow = Math.max(0, viewportBottom - belowTop);
  const aboveBottom = clamp(trigger.top - gap, viewportTop, viewportBottom);
  const availableAbove = Math.max(0, aboveBottom - viewportTop);
  const placement = contentHeight <= availableBelow || availableBelow >= availableAbove ? 'below' : 'above';
  const maxHeight = placement === 'below' ? availableBelow : availableAbove;
  const top = placement === 'below'
    ? belowTop
    : aboveBottom - Math.min(contentHeight, availableAbove);

  return { left, top, width, maxHeight, placement };
}
