import { describe, expect, it } from "vitest";
import type { SheetComponent } from "@tabbletop/protocol";
import { clampRect, findFreeSpot } from "./boardMutations";
import { computeDerivedValues, formatDerived } from "./computedValues";
import { componentKeyAction } from "./editor/editorKeys";
import { cellAt } from "./editor/gridGeometry";
import { readListRows } from "./listRows";

describe("grid placement", () => {
  it("keeps rectangles inside the 12 columns", () => {
    expect(clampRect({ x: 10, y: -3, w: 5, h: 0 })).toEqual({ x: 7, y: 0, w: 5, h: 1 });
  });

  it("finds the first gap that fits", () => {
    expect(findFreeSpot([{ x: 0, y: 0, w: 6, h: 2 }], 6, 2)).toEqual({ x: 6, y: 0, w: 6, h: 2 });
    expect(findFreeSpot([{ x: 0, y: 0, w: 12, h: 2 }], 4, 1)).toEqual({ x: 0, y: 2, w: 4, h: 1 });
  });

  it("maps pointer coordinates to cells, clamping outside points", () => {
    const metrics = { left: 100, top: 50, width: 1188, columns: 12, rowHeight: 32, columnGap: 8, rowGap: 8 };
    expect(cellAt(metrics, 100, 50)).toEqual({ col: 0, row: 0 });
    expect(cellAt(metrics, 100 + 2 * 100 + 5, 50 + 3 * 40 + 1)).toEqual({ col: 2, row: 3 });
    expect(cellAt(metrics, 5000, 0)).toEqual({ col: 11, row: 0 });
  });
});

describe("computed values", () => {
  const component = (key: string, formula: string): SheetComponent => ({ id: key, kind: "computed", key, formula, x: 0, y: 0, w: 1, h: 1 });
  const evaluate = (formula: string, data: Record<string, unknown>) => {
    const expression = formula.replace(/@([a-z_]+)/g, (_, key: string) => String(data[key] ?? 0));
    return /^[\d\s+\-*/().]+$/.test(expression) ? Number(Function(`return (${expression})`)()) : null;
  };

  it("lets calculations depend on each other regardless of order", () => {
    const derived = computeDerivedValues([component("ataque", "@mod + 2"), component("mod", "(@forca - 10) / 2")], { forca: 16 }, evaluate);
    expect(derived).toEqual({ mod: 3, ataque: 5 });
  });

  it("formats results compactly", () => {
    expect(formatDerived(3)).toBe("3");
    expect(formatDerived(2.5)).toBe("2.5");
    expect(formatDerived(undefined)).toBe("—");
  });
});

describe("list rows", () => {
  it("keeps only plain cells of declared columns", () => {
    const columns = [{ key: "nome", label: "Nome", type: "text" as const }, { key: "qtd", label: "Qtd", type: "number" as const }];
    expect(readListRows([{ nome: "Corda", qtd: 2, extra: "x" }, { nome: { evil: true } }, "lixo"], columns)).toEqual([{ nome: "Corda", qtd: 2 }, {}, {}]);
    expect(readListRows("nada", columns)).toEqual([]);
    expect(readListRows({ 1: { nome: "B" }, 0: { nome: "A" }, x: { nome: "C" } }, columns)).toEqual([{ nome: "A" }, { nome: "B" }]);
  });
});

describe("editor shortcuts", () => {
  const key = (value: string, modifiers: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) => ({ key: value, shiftKey: false, ctrlKey: false, metaKey: false, ...modifiers });

  it("moves with arrows, resizes with Shift and handles commands", () => {
    expect(componentKeyAction(key("ArrowRight"))).toEqual({ type: "nudge", dx: 1, dy: 0 });
    expect(componentKeyAction(key("ArrowDown", { shiftKey: true }))).toEqual({ type: "resize", dw: 0, dh: 1 });
    expect(componentKeyAction(key("d", { ctrlKey: true }))).toEqual({ type: "duplicate" });
    expect(componentKeyAction(key("z", { ctrlKey: true, shiftKey: true }))).toEqual({ type: "redo" });
    expect(componentKeyAction(key("Delete"))).toEqual({ type: "remove" });
    expect(componentKeyAction(key("a"))).toBeNull();
  });
});
