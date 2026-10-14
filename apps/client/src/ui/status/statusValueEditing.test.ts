import { describe, expect, it } from "vitest";
import type { ResourceReading } from "./statusReadings";
import { editedMax, editedValue, resourceUpdate, steppedValue } from "./statusValueEditing";

const resource = { id: "vida", label: "Vida", aliases: [], color: "#c0392b", enabled: true, playersSee: true };

function bar(value: number, max: number, min = 0): ResourceReading {
  return { resource, label: "Vida", kind: "bar", value, max, min, path: "system.vida" };
}

describe("status value editing", () => {
  it("keeps typed values between the minimum and the maximum", () => {
    expect(editedValue(bar(5, 10), 14)).toEqual({ value: 10, max: 10 });
    expect(editedValue(bar(5, 10), -3)).toEqual({ value: 0, max: 10 });
    expect(editedValue(bar(5, 10, -5), -3)).toEqual({ value: -3, max: 10 });
  });

  it("lets a bar with no maximum yet go up", () => {
    expect(steppedValue(bar(0, 0), 1)).toEqual({ value: 1, max: 0 });
    expect(editedValue(bar(0, 0), 12)).toEqual({ value: 12, max: 0 });
  });

  it("brings the value down when the maximum goes below it", () => {
    expect(editedMax(bar(8, 10), 6)).toEqual({ value: 6, max: 6 });
    expect(editedMax(bar(8, 10), 20)).toEqual({ value: 8, max: 20 });
    expect(editedMax(bar(8, 10), -4)).toEqual({ value: 8, max: 0 });
  });

  it("writes plain numbers for number fields and value/max pairs for bars", () => {
    const number: ResourceReading = { ...bar(3, 0), kind: "number", path: "system.defesa" };
    expect(resourceUpdate(number, { value: 4, max: 0 })).toEqual({ "system.defesa": 4 });
    expect(resourceUpdate(bar(3, 5), { value: 4, max: 5 })).toEqual({ "system.vida": { value: 4, max: 5 } });
  });
});
