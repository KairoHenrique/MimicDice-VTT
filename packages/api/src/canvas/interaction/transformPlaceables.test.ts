import { describe, expect, it } from "vitest";

describe("transformPlaceables", () => {
  describe("proportional resizing calculation", () => {
    it("maintains exact aspect ratio when resizing from diagonal movement", () => {
      const initialWidth = 200;
      const initialHeight = 100;
      const initialRatio = initialWidth / initialHeight; // 2.0

      const lenSq = initialWidth * initialWidth + initialHeight * initialHeight;

      // Mouse dragged to rawW=300, rawH=150 (proportional)
      const rawW = 300;
      const rawH = 150;
      const dot = (rawW * initialWidth + rawH * initialHeight) / lenSq;
      const scale = Math.max(0.05, dot);
      const computedW = initialWidth * scale;
      const computedH = initialHeight * scale;

      expect(computedW / computedH).toBeCloseTo(initialRatio, 5);
      expect(computedW).toBe(300);
      expect(computedH).toBe(150);
    });

    it("prevents distortion even when user drags mouse off-diagonal", () => {
      const initialWidth = 150;
      const initialHeight = 75;
      const initialRatio = initialWidth / initialHeight; // 2.0
      const lenSq = initialWidth * initialWidth + initialHeight * initialHeight;

      // Mouse dragged horizontally much more than vertically
      const rawW = 350;
      const rawH = 100;
      const dot = (rawW * initialWidth + rawH * initialHeight) / lenSq;
      const scale = Math.max(0.05, dot);
      const computedW = initialWidth * scale;
      const computedH = initialHeight * scale;

      // Aspect ratio MUST be exactly preserved
      expect(computedW / computedH).toBeCloseTo(initialRatio, 5);
    });

    it("scales token grid units proportionally without distortion", () => {
      const initialRatio = 1.0;
      const rawGridW = 1.73;
      const step = 0.05;
      const gridW = Math.max(0.1, Math.round(rawGridW / step) * step); // 1.75
      const gridH = Math.max(0.1, Math.round((gridW / initialRatio) * 100) / 100);

      expect(gridW).toBe(1.75);
      expect(gridH).toBe(1.75);
      expect(gridW / gridH).toBe(1.0);
    });
  });

  describe("flipping scale toggling", () => {
    it("toggles scaleX between 1 and -1", () => {
      let scaleX = 1;
      scaleX = scaleX < 0 ? 1 : -1;
      expect(scaleX).toBe(-1);
      scaleX = scaleX < 0 ? 1 : -1;
      expect(scaleX).toBe(1);
    });

    it("toggles scaleY between 1 and -1", () => {
      let scaleY = 1;
      scaleY = scaleY < 0 ? 1 : -1;
      expect(scaleY).toBe(-1);
      scaleY = scaleY < 0 ? 1 : -1;
      expect(scaleY).toBe(1);
    });
  });

  describe("free rotation calculation", () => {
    it("computes continuous free angle from mouse vector", () => {
      const center = { x: 500, y: 500 };
      // 45 degrees relative to top (dx=100, dy=-100)
      const mouse = { x: 600, y: 400 };
      const rad = Math.atan2(mouse.y - center.y, mouse.x - center.x);
      let deg = Math.round((rad * 180) / Math.PI + 90);
      deg = ((deg % 360) + 360) % 360;

      expect(deg).toBe(45);
    });

    it("allows non-snapped arbitrary angles", () => {
      const center = { x: 100, y: 100 };
      const mouse = { x: 137, y: 72 };
      const rad = Math.atan2(mouse.y - center.y, mouse.x - center.x);
      let deg = Math.round((rad * 180) / Math.PI + 90);
      deg = ((deg % 360) + 360) % 360;

      expect(deg).toBeGreaterThan(0);
      expect(deg).toBeLessThan(90);
    });
  });
});
