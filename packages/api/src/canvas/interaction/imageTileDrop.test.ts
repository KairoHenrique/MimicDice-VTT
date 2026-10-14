import { beforeEach, describe, expect, it, vi } from "vitest";

const textureSize = { width: 150, height: 75 };
let isGM = true;

vi.stubGlobal("window", { location: { origin: "http://localhost" } });
vi.mock("../textures", () => ({ loadTexture: async () => textureSize }));
vi.mock("../../runtime", () => ({ currentGame: () => ({ user: { isGM } }), currentUi: () => ({ notifications: { warn: vi.fn() } }) }));

const { placeImageTile } = await import("./imageTileDrop");

function fakeCanvas() {
  const created: any[] = [];
  const canvas = {
    grid: { size: 100, getSnappedPoint: (point: { x: number; y: number }) => ({ x: Math.round(point.x / 25) * 25, y: Math.round(point.y / 25) * 25 }) },
    dimensions: { sceneWidth: 1000, sceneHeight: 1000 },
    scene: { createEmbeddedDocuments: async (_type: string, data: any[]) => (created.push(...data), data) },
  };
  return { canvas, created };
}

describe("placeImageTile", () => {
  beforeEach(() => {
    isGM = true;
    textureSize.width = 150;
    textureSize.height = 75;
  });

  it("uses the image's own size, centered on the drop and snapped by quarter squares", async () => {
    const { canvas, created } = fakeCanvas();
    await placeImageTile(canvas, "uploads/peca.png", { x: 510, y: 512 });
    expect(created[0]).toMatchObject({ x: 425, y: 475, width: 150, height: 75, texture: { src: "uploads/peca.png" } });
  });

  it("scales pieces made for another grid", async () => {
    const { canvas, created } = fakeCanvas();
    await placeImageTile(canvas, "uploads/peca.png", { x: 500, y: 500 }, { pixelsPerSquare: 75 });
    expect(created[0]).toMatchObject({ width: 200, height: 100 });
  });

  it("keeps huge images inside the scene", async () => {
    textureSize.width = 4000;
    textureSize.height = 2000;
    const { canvas, created } = fakeCanvas();
    await placeImageTile(canvas, "uploads/mapa.jpg", { x: 500, y: 500 });
    expect(created[0]).toMatchObject({ width: 1000, height: 500 });
  });

  it("refuses players and unsafe paths", async () => {
    const { canvas, created } = fakeCanvas();
    await placeImageTile(canvas, "uploads/../segredo.png", { x: 0, y: 0 });
    await placeImageTile(canvas, "uploads/script.js", { x: 0, y: 0 });
    isGM = false;
    await placeImageTile(canvas, "uploads/peca.png", { x: 0, y: 0 });
    expect(created).toHaveLength(0);
  });
});
