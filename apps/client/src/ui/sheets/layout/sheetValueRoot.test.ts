import { describe, expect, it } from "vitest";
import { sourceAtRoot, valueRootForSchema } from "./sheetValueRoot";

describe("valueRootForSchema", () => {
  it("keeps values in system when the system has no data model", () => {
    expect(valueRootForSchema(null)).toBe("system");
  });

  it("uses the open props object of strict models such as Custom System Builder", () => {
    expect(valueRootForSchema(["body", "header", "props"])).toBe("system.props");
  });

  it("falls back to actor flags when the model has no open object", () => {
    expect(valueRootForSchema(["hp", "level"])).toBe("flags.world.sheetValues");
  });
});

describe("sourceAtRoot", () => {
  it("nests values along the root path", () => {
    expect(sourceAtRoot("system.props", { vida: 3 })).toEqual({ system: { props: { vida: 3 } } });
    expect(sourceAtRoot("flags.world.sheetValues", { vida: 3 })).toEqual({ flags: { world: { sheetValues: { vida: 3 } } } });
  });
});
