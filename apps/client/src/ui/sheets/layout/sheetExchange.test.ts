import { describe, expect, it } from "vitest";
import { MAX_SAVED_SHEET_TEMPLATES, SHEET_EXCHANGE_FORMAT, sheetExchangeFileSchema } from "@tabbletop/protocol";
import { SHEET_PRESETS } from "./sheetPresets";

const exportedSystem = {
  format: SHEET_EXCHANGE_FORMAT,
  version: 1,
  title: "Meu sistema",
  templates: SHEET_PRESETS.map(({ name, description, role, layout }) => ({ name, description, role, layout })),
};

describe("sheet exchange file", () => {
  it("accepts every built-in model as an exported system", () => {
    expect(sheetExchangeFileSchema.safeParse(JSON.parse(JSON.stringify(exportedSystem))).success).toBe(true);
  });

  it("rejects files from other programs, unknown roles and oversized systems", () => {
    expect(sheetExchangeFileSchema.safeParse({ ...exportedSystem, format: "outro" }).success).toBe(false);
    expect(sheetExchangeFileSchema.safeParse({ ...exportedSystem, templates: [{ ...exportedSystem.templates[0], role: "admin" }] }).success).toBe(false);
    const tooMany = Array.from({ length: MAX_SAVED_SHEET_TEMPLATES + 1 }, () => exportedSystem.templates[0]);
    expect(sheetExchangeFileSchema.safeParse({ ...exportedSystem, templates: tooMany }).success).toBe(false);
  });
});
