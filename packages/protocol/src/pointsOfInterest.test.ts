import { describe, expect, it } from "vitest";
import {
  DEFAULT_POI_COLOR,
  DEFAULT_POI_ICON,
  DEFAULT_POI_SIZE,
  POI_CATEGORY_PRESETS,
  POI_FLAG,
  createPointOfInterestSource,
  readPointOfInterest,
} from "./pointsOfInterest";

describe("pointsOfInterest", () => {
  it("has valid category presets", () => {
    expect(POI_CATEGORY_PRESETS.length).toBeGreaterThanOrEqual(10);
    const tavern = POI_CATEGORY_PRESETS.find((p) => p.id === "tavern");
    expect(tavern).toBeDefined();
    expect(tavern?.icon).toBe("icons/svg/tavern.svg");
  });

  it("reads null when flags are missing or invalid", () => {
    expect(readPointOfInterest(undefined)).toBeNull();
    expect(readPointOfInterest({})).toBeNull();
    expect(readPointOfInterest({ [POI_FLAG]: { title: "" } })).toBeNull();
  });

  it("reads valid point of interest", () => {
    const poi = {
      title: "Taverna do Dragão Bêbado",
      category: "Taverna & Hospedaria",
      icon: "icons/svg/tavern.svg",
      color: "#eab308",
      description: "Cerveja gelada e quartos limpos.",
      gmNotes: "O estalajadeiro é um informante.",
      image: "https://example.com/tavern.png",
      hidden: false,
    };
    const read = readPointOfInterest({ [POI_FLAG]: poi });
    expect(read).toEqual(poi);
  });

  it("creates source matching Note document schema", () => {
    const poi = {
      title: "Forja de Ferro",
      category: "Ferreiro & Forja",
      icon: "icons/svg/blacksmith.svg",
      color: "#ef4444",
      description: "Forja antiga com armas bem feitas.",
      gmNotes: "",
      image: "",
      hidden: true,
    };
    const source = createPointOfInterestSource(poi, 48);
    expect(source.text).toBe("Forja de Ferro");
    expect(source.iconSize).toBe(48);
    expect(source.global).toBe(true);
    expect(source.texture).toEqual({ src: "icons/svg/blacksmith.svg", tint: "#ef4444" });
    expect(source.flags).toEqual({
      world: {
        [POI_FLAG]: poi,
        hidden: true,
      },
    });
  });
});
