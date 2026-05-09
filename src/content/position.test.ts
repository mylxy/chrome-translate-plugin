import { describe, expect, it } from "vitest";
import { computeBubblePosition } from "./position";

describe("computeBubblePosition", () => {
  it("places the bubble below the selection when it fits", () => {
    expect(
      computeBubblePosition({
        selectionRect: { top: 100, bottom: 120, left: 200, width: 80 },
        bubbleSize: { width: 180, height: 100 },
        viewport: { width: 800, height: 600 },
        margin: 8,
      }),
    ).toEqual({
      top: 128,
      left: 200,
      placement: "bottom",
      maxWidth: 180,
      maxHeight: 100,
    });
  });

  it("places the bubble above when there is not enough space below", () => {
    expect(
      computeBubblePosition({
        selectionRect: { top: 540, bottom: 560, left: 200, width: 80 },
        bubbleSize: { width: 180, height: 100 },
        viewport: { width: 800, height: 600 },
        margin: 8,
      }),
    ).toEqual({
      top: 432,
      left: 200,
      placement: "top",
      maxWidth: 180,
      maxHeight: 100,
    });
  });

  it("keeps the bubble inside the left and right viewport edges", () => {
    expect(
      computeBubblePosition({
        selectionRect: { top: 100, bottom: 120, left: 760, width: 40 },
        bubbleSize: { width: 180, height: 100 },
        viewport: { width: 800, height: 600 },
        margin: 8,
      }),
    ).toEqual({
      top: 128,
      left: 612,
      placement: "bottom",
      maxWidth: 180,
      maxHeight: 100,
    });
  });

  it("uses the effective width when the bubble is wider than the viewport", () => {
    const position = computeBubblePosition({
      selectionRect: { top: 100, bottom: 120, left: 50, width: 40 },
      bubbleSize: { width: 180, height: 100 },
      viewport: { width: 100, height: 600 },
      margin: 8,
    });

    expect(position).toEqual({
      top: 128,
      left: 8,
      placement: "bottom",
      maxWidth: 84,
      maxHeight: 100,
    });
    expect(position.left + position.maxWidth).toBeLessThanOrEqual(92);
  });

  it("chooses bottom when neither side fits and below has more space", () => {
    expect(
      computeBubblePosition({
        selectionRect: { top: 20, bottom: 40, left: 20, width: 40 },
        bubbleSize: { width: 180, height: 100 },
        viewport: { width: 800, height: 140 },
        margin: 8,
      }),
    ).toEqual({
      top: 32,
      left: 20,
      placement: "bottom",
      maxWidth: 180,
      maxHeight: 100,
    });
  });

  it("chooses top when neither side fits and above has more space", () => {
    expect(
      computeBubblePosition({
        selectionRect: { top: 100, bottom: 120, left: 20, width: 40 },
        bubbleSize: { width: 180, height: 100 },
        viewport: { width: 800, height: 140 },
        margin: 8,
      }),
    ).toEqual({
      top: 8,
      left: 20,
      placement: "top",
      maxWidth: 180,
      maxHeight: 100,
    });
  });

  it("clamps to the left viewport edge", () => {
    expect(
      computeBubblePosition({
        selectionRect: { top: 100, bottom: 120, left: -20, width: 40 },
        bubbleSize: { width: 180, height: 100 },
        viewport: { width: 800, height: 600 },
        margin: 8,
      }),
    ).toEqual({
      top: 128,
      left: 8,
      placement: "bottom",
      maxWidth: 180,
      maxHeight: 100,
    });
  });

  it("aligns to the selection left instead of centering on its width", () => {
    expect(
      computeBubblePosition({
        selectionRect: { top: 100, bottom: 120, left: 200, width: 400 },
        bubbleSize: { width: 180, height: 100 },
        viewport: { width: 800, height: 600 },
        margin: 8,
      }),
    ).toEqual({
      top: 128,
      left: 200,
      placement: "bottom",
      maxWidth: 180,
      maxHeight: 100,
    });
  });
});
