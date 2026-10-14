import type { SheetComponent, StatusResource } from "@tabbletop/protocol";
import { describe, expect, it } from "vitest";
import { collectSheetFields, matchResourceComponents, parseAliases } from "./statusResourceMatching";

const bar = (key: string, label: string): SheetComponent => ({ id: key, kind: "resource", key, label, x: 0, y: 0, w: 6, h: 2 }) as SheetComponent;
const resources: StatusResource[] = [
  { id: "vida", label: "Vida", aliases: ["hp", "pv"], color: "#c0392b", enabled: true, playersSee: true },
  { id: "pe", label: "PE", aliases: ["pontos_de_esforco"], color: "#2f80d1", enabled: true, playersSee: true },
  { id: "sanidade", label: "Sanidade", aliases: ["san"], color: "#7d5fff", enabled: false, playersSee: true },
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

  it("prefers a bar and falls back to a number field with the same name", () => {
    const numberField = { ...bar("hp", "HP"), kind: "number" } as SheetComponent;
    expect(matchResourceComponents([numberField, bar("pv", "PV")], resources).get("vida")?.kind).toBe("resource");
    expect(matchResourceComponents([numberField], resources).get("vida")?.kind).toBe("number");
  });

  it("never reads text or other kinds of fields", () => {
    const textField = { ...bar("hp", "HP"), kind: "text" } as SheetComponent;
    expect(matchResourceComponents([textField], resources).size).toBe(0);
  });
});

describe("collectSheetFields", () => {
  it("lists each bar or number field once, bars first", () => {
    const numberField = { ...bar("defesa", "Defesa"), kind: "number" } as SheetComponent;
    const fields = collectSheetFields([[bar("pv", "Pontos de Vida"), numberField], [bar("pv", "PV")]]);
    expect(fields).toEqual([
      { key: "pv", label: "Pontos de Vida", kind: "resource" },
      { key: "defesa", label: "Defesa", kind: "number" },
    ]);
  });
});

describe("parseAliases", () => {
  it("accepts commas, semicolons and line breaks", () => {
    expect(parseAliases("Vida, HP; pv\nPontos de Vida, hp")).toEqual(["vida", "hp", "pv", "pontos_de_vida"]);
  });
});
