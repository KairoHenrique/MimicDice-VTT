import { describe, expect, it, vi } from "vitest";

class FakeCanvas {
  nodeName = "CANVAS";
  width = 1;
  height = 1;
  getContext() {
    return {
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData: () => {},
      createImageData: () => ({ data: new Uint8ClampedArray(4) }),
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      fillText: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      fill: () => {},
      measureText: () => ({ width: 0 }),
      transform: () => {},
      rect: () => {},
      clip: () => {},
    };
  }
}

vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
vi.stubGlobal("document", {
  createElement: (tag: string) => {
    if (tag === "canvas") return new FakeCanvas();
    return {};
  },
});

import { CanvasInteraction } from "./CanvasInteraction";
import { SquareGrid } from "../grid";
import { PlaceableObject } from "../placeables/PlaceableObject";

function createMockCanvas(activeTool = "stepRuler") {
  const grid = new SquareGrid({
    type: 1, // square
    size: 100,
    distance: 1.5,
    units: "m",
    style: "solidLines",
    thickness: 1,
    color: "#000000",
    alpha: 0.2,
  });

  const mockToken = {
    id: "token-1",
    document: { documentName: "Token", id: "token-1", x: 100, y: 100, width: 1, height: 1 },
    w: 100,
    h: 100,
    destroyed: false,
  };

  const canvas: any = {
    ready: true,
    grid,
    dimensions: { units: "m" },
    stage: {
      on: () => {},
      scale: { x: 1, y: 1 },
      pivot: { x: 0, y: 0 },
    },
    tokens: {
      controlled: [mockToken],
      placeables: [mockToken],
    },
  };

  (globalThis as any).game = {
    user: { id: "user-1", color: "#3b82f6", isGM: true },
  };

  (globalThis as any).ui = {
    controls: {
      tool: { name: activeTool },
    },
  };

  return { canvas, mockToken };
}

describe("stepRuler", () => {
  it("initializes step ruler on a selected token at cell center with 0 steps", () => {
    const { canvas, mockToken } = createMockCanvas("stepRuler");
    const interaction = new CanvasInteraction(canvas);

    interaction.initStepRuler(mockToken as any);

    const state = interaction.stepRulerState;
    expect(state).not.toBeNull();
    expect(state?.tokenId).toBe("token-1");
    expect(state?.totalSteps).toBe(0);
    expect(state?.totalDistance).toBe(0);
    expect(state?.waypoints.length).toBe(1);
    // Center of cell (1, 1) is (150, 150)
    expect(state?.waypoints[0]).toEqual({ x: 150, y: 150 });
  });

  it("accumulates steps when moving across adjacent grid cells", () => {
    const { canvas, mockToken } = createMockCanvas("stepRuler");
    const interaction = new CanvasInteraction(canvas);

    interaction.initStepRuler(mockToken as any);

    // Move to cell (1, 2) -> center (250, 150)
    interaction.stepRulerTrackMovement({ x: 250, y: 150 });

    expect(interaction.stepRulerState?.totalSteps).toBe(1);
    expect(interaction.stepRulerState?.totalDistance).toBe(1.5);
    expect(interaction.stepRulerState?.waypoints.length).toBe(2);

    // Move to cell (1, 3) -> center (350, 150)
    interaction.stepRulerTrackMovement({ x: 350, y: 150 });

    expect(interaction.stepRulerState?.totalSteps).toBe(2);
    expect(interaction.stepRulerState?.totalDistance).toBe(3.0);
    expect(interaction.stepRulerState?.waypoints.length).toBe(3);
  });

  it("counts steps going back (steps returning to previous cells also add to ruler)", () => {
    const { canvas, mockToken } = createMockCanvas("stepRuler");
    const interaction = new CanvasInteraction(canvas);

    interaction.initStepRuler(mockToken as any);

    // Step 1: forward to (250, 150)
    interaction.stepRulerTrackMovement({ x: 250, y: 150 });
    expect(interaction.stepRulerState?.totalSteps).toBe(1);

    // Step 2: forward to (350, 150)
    interaction.stepRulerTrackMovement({ x: 350, y: 150 });
    expect(interaction.stepRulerState?.totalSteps).toBe(2);

    // Step 3: BACK to (250, 150)
    interaction.stepRulerTrackMovement({ x: 250, y: 150 });
    expect(interaction.stepRulerState?.totalSteps).toBe(3);
    expect(interaction.stepRulerState?.totalDistance).toBe(4.5);
    expect(interaction.stepRulerState?.waypoints.length).toBe(4);

    // Step 4: BACK to original starting cell (150, 150)
    interaction.stepRulerTrackMovement({ x: 150, y: 150 });
    expect(interaction.stepRulerState?.totalSteps).toBe(4);
    expect(interaction.stepRulerState?.totalDistance).toBe(6.0);
    expect(interaction.stepRulerState?.waypoints.length).toBe(5);

    // Verify label updated
    expect(interaction.stepRulerLabel.text).toContain("4 quadrados");
    expect(interaction.stepRulerLabel.text).toContain("6 m");
  });

  it("interpolates intermediate steps when moving multiple cells in a single update", () => {
    const { canvas, mockToken } = createMockCanvas("stepRuler");
    const interaction = new CanvasInteraction(canvas);

    interaction.initStepRuler(mockToken as any);

    // Fast drag 3 squares right from cell (1, 1) to (1, 4) -> (450, 150)
    interaction.stepRulerTrackMovement({ x: 450, y: 150 });

    expect(interaction.stepRulerState?.totalSteps).toBe(3);
    expect(interaction.stepRulerState?.totalDistance).toBe(4.5);
    expect(interaction.stepRulerState?.waypoints.length).toBe(4);

    // Fast drag 2 squares back to (1, 2) -> (250, 150)
    interaction.stepRulerTrackMovement({ x: 250, y: 150 });

    expect(interaction.stepRulerState?.totalSteps).toBe(5);
    expect(interaction.stepRulerState?.totalDistance).toBe(7.5);
    expect(interaction.stepRulerState?.waypoints.length).toBe(6);
  });

  it("resets back to 0 steps on Escape or resetStepRuler", () => {
    const { canvas, mockToken } = createMockCanvas("stepRuler");
    const interaction = new CanvasInteraction(canvas);

    interaction.initStepRuler(mockToken as any);
    interaction.stepRulerTrackMovement({ x: 250, y: 150 });
    expect(interaction.stepRulerState?.totalSteps).toBe(1);

    interaction.resetStepRuler();
    expect(interaction.stepRulerState?.totalSteps).toBe(0);
    expect(interaction.stepRulerState?.totalDistance).toBe(0);
    expect(interaction.stepRulerState?.waypoints.length).toBe(1);
  });

  it("prevents selecting or controlling tokens when ruler tool is active", () => {
    createMockCanvas("ruler");

    class MockPlaceable extends PlaceableObject {
      protected override async _draw() {}
      protected override _refresh() {}
      get testPasses() {
        return this.passesPressToBoard();
      }
    }

    const doc = {
      id: "tok-1",
      documentName: "Token",
      layer: { active: true },
      testUserPermission: () => true,
    };
    const placeable = new MockPlaceable(doc);

    expect(placeable.canControl()).toBe(false);
    expect((placeable as any).testPasses).toBe(true);

    // Switch tool to select
    (globalThis as any).ui.controls.tool.name = "select";
    expect(placeable.canControl()).toBe(true);
    expect((placeable as any).testPasses).toBe(false);
  });
});
