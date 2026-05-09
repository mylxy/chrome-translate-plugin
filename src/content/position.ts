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
}

export function computeBubblePosition(
  input: BubblePositionInput,
): BubblePosition {
  const { selectionRect, bubbleSize, viewport, margin } = input;
  const desiredLeft = selectionRect.left;
  const maxLeft = viewport.width - bubbleSize.width - margin;
  const left = Math.max(margin, Math.min(desiredLeft, maxLeft));

  const bottomTop = selectionRect.bottom + margin;
  const fitsBelow = bottomTop + bubbleSize.height <= viewport.height - margin;
  if (fitsBelow) {
    return { top: bottomTop, left, placement: "bottom" };
  }

  return {
    top: Math.max(margin, selectionRect.top - bubbleSize.height - margin),
    left,
    placement: "top",
  };
}
