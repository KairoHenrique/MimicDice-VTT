import { describe, expect, it } from "vitest";
import { describeWhereabouts, indexItemWhereabouts } from "./itemLocations";

const carried = (sourceId: string) => ({ _source: { flags: { core: { sourceId } } } });
const loot = (sourceId: string) => ({ _source: { flags: { core: { loot: { flags: { core: { sourceId } } } } } } });

describe("indexItemWhereabouts", () => {
  it("counts copies carried by characters and lying on maps", () => {
    const index = indexItemWhereabouts(
      [
        { name: "Ana", items: [carried("Item.sword"), carried("Item.sword"), carried("Item.rope")] },
        { name: "Bruno", items: [carried("Item.sword"), { _source: {} }] },
      ],
      [{ name: "Cripta", tiles: [loot("Item.sword"), { _source: {} }] }],
    );
    expect(describeWhereabouts(index.get("Item.sword"))).toBe("Com Ana (2), Bruno · No chão: Cripta");
    expect(describeWhereabouts(index.get("Item.rope"))).toBe("Com Ana");
  });

  it("counts copies stored in chests", () => {
    const stored = (sourceId: string) => ({ id: "a1", perceptionDc: null, item: { name: "Espada", type: "item", flags: { core: { sourceId } } } });
    const chest = { _source: { flags: { core: { chest: { name: "Baú do altar", entries: [stored("Item.sword")] } } } } };
    const index = indexItemWhereabouts([], [{ name: "Cripta", tiles: [chest] }]);
    expect(describeWhereabouts(index.get("Item.sword"))).toBe("No baú: Baú do altar");
  });

  it("says nothing for items that are only in the Items tab", () => {
    expect(describeWhereabouts(indexItemWhereabouts([], []).get("Item.sword"))).toBeNull();
  });
});
