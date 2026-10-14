import type { SheetComponent, StatusResource } from "@tabbletop/protocol";
import { describe, expect, it } from "vitest";
import { matchResourceComponents, parseAliases } from "./statusResourceMatching";

const bar = (key: string, label: string): SheetComponent => ({ id: key, kind: "resource", key, label, x: 0, y: 0, w: 6, h: 2 }) as SheetComponent;
const resources: StatusResource[] = [
  { id: "vida", label: "Vida", aliases: ["hp", "pv"], color: "#c0392b", enabled: true },
  { id: "pe", label: "PE", aliases: ["pontos_de_esforco"], color: "#2f80d1", enabled: true },
  { id: "sanidade", label: "Sanidade", aliases: ["san"], color: "#7d5fff", enabled: false },
];

describe("matchResourceComponents", () => {
  it("finds bars by key or by label, ignoring accents and case", () => {
    const matches = matchResourceComponents([bar("pv", "Pontos de Vida"), bar("esforco", "Pontos de Esforço")], resources);
    expect(matches.get("vida")?.key).toBe("pv");
    expect(matches.get("pe")?.key).toBe("esforco");
  });

  it("skips resources the GM turned off and sheets without that bar", () => {
    const matches = matchResourceComponents([bar("sanidade", "Sanidade")], resources);
    expect(matches.has("sanidade")).toBe(false);
    expect(matches.has("vida")).toBe(false);
  });

  it("only reads bars, never other fields with the same name", () => {
    const numberField = { ...bar("hp", "HP"), kind: "number" } as SheetComponent;
    expect(matchResourceComponents([numberField], resources).size).toBe(0);
  });
});

describe("parseAliases", () => {
  it("accepts commas, semicolons and line breaks", () => {
    expect(parseAliases("Vida, HP; pv\nPontos de Vida, hp")).toEqual(["vida", "hp", "pv", "pontos_de_vida"]);
  });
});
