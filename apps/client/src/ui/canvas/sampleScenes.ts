interface SampleScene {
  name: string;
  src: string;
  darkness: boolean;
}

const SAMPLE_SCENES: readonly SampleScene[] = [
  { name: "Exemplo: Taverna", src: "maps/taverna.jpg", darkness: false },
  { name: "Exemplo: Floresta", src: "maps/floresta.jpg", darkness: false },
  { name: "Exemplo: Masmorra", src: "maps/masmorra.jpg", darkness: true },
];

const MAP_WIDTH = 2400;
const MAP_HEIGHT = 1800;
const GRID_SIZE = 100;

function sceneSource(sample: SampleScene): Record<string, unknown> {
  return {
    name: sample.name,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    padding: 0.1,
    backgroundColor: "#111111",
    background: { src: sample.src },
    grid: { type: 1, size: GRID_SIZE, distance: 1.5, units: "m", color: "#000000", alpha: 0.25 },
    tokenVision: sample.darkness,
    environment: { globalLight: { enabled: !sample.darkness } },
    navigation: true,
  };
}

/** Creates the bundled example maps that are not in the world yet; returns how many were added. */
export async function createSampleScenes(): Promise<number> {
  const existing = new Set<string>(game.scenes.contents.map((scene: any) => scene.name));
  const missing = SAMPLE_SCENES.filter((sample) => !existing.has(sample.name));
  if (missing.length === 0) return 0;
  await CONFIG.Scene.documentClass.createDocuments(missing.map(sceneSource));
  return missing.length;
}
