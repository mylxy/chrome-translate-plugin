export interface SelectionRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface BubbleSize {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface BubblePositionInput {
  selectionRect: SelectionRect;
  bubbleSize: BubbleSize;
  viewport: ViewportSize;
  margin: number;
}

export interface BubblePosition {
  top: number;
  left: number;
  placement: "top" | "bottom";
  maxWidth: number;
  maxHeight: number;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.max(min, Math.min(value, max));
}

export function computeBubblePosition(
  input: BubblePositionInput,
): BubblePosition {
  const { selectionRect, bubbleSize, viewport, margin } = input;
  const maxWidth = Math.min(
    bubbleSize.width,
    Math.max(0, viewport.width - 2 * margin),
  );
  const maxHeight = Math.min(
    bubbleSize.height,
    Math.max(0, viewport.height - 2 * margin),
  );

  // Product behavior: align to the selection's left edge, then clamp onscreen.
  // selectionRect.width is intentionally not used for centering.
  const desiredLeft = selectionRect.left;
  const maxLeft = viewport.width - maxWidth - margin;
  const left = clamp(desiredLeft, margin, maxLeft);

  const minTop = margin;
  const maxTop = viewport.height - maxHeight - margin;
  const bottomTop = selectionRect.bottom + margin;
  const topTop = selectionRect.top - maxHeight - margin;
  const spaceBelow = viewport.height - margin - bottomTop;
  const spaceAbove = selectionRect.top - margin - margin;

  const fitsBelow = maxHeight <= spaceBelow;
  const fitsAbove = maxHeight <= spaceAbove;
  const placement =
    fitsBelow || (!fitsAbove && spaceBelow >= spaceAbove) ? "bottom" : "top";

  if (placement === "bottom") {
    return {
      top: clamp(bottomTop, minTop, maxTop),
      left,
      placement,
      maxWidth,
      maxHeight,
    };
  }

  return {
    top: clamp(topTop, minTop, maxTop),
    left,
    placement,
    maxWidth,
    maxHeight,
  };
}
