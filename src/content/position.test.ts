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
    ).toEqual({ top: 128, left: 200, placement: "bottom" });
  });

  it("places the bubble above when there is not enough space below", () => {
    expect(
      computeBubblePosition({
        selectionRect: { top: 540, bottom: 560, left: 200, width: 80 },
        bubbleSize: { width: 180, height: 100 },
        viewport: { width: 800, height: 600 },
        margin: 8,
      }),
    ).toEqual({ top: 432, left: 200, placement: "top" });
  });

  it("keeps the bubble inside the left and right viewport edges", () => {
    expect(
      computeBubblePosition({
        selectionRect: { top: 100, bottom: 120, left: 760, width: 40 },
        bubbleSize: { width: 180, height: 100 },
        viewport: { width: 800, height: 600 },
        margin: 8,
      }),
    ).toEqual({ top: 128, left: 612, placement: "bottom" });
  });
});
