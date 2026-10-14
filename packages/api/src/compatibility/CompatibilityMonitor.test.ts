import { describe, expect, it } from "vitest";
import { CompatibilityMonitor } from "./CompatibilityMonitor";

function errorFrom(stack: string, message = "boom"): Error {
  const error = new TypeError(message);
  error.stack = `TypeError: ${message}\n${stack}`;
  return error;
}

describe("CompatibilityMonitor", () => {
  it("attributes a runtime error to the innermost package frame", () => {
    const monitor = new CompatibilityMonitor();
    monitor.recordRuntimeError("Hooks.#call", errorFrom("    at x (http://host/modules/sequencer/module.js:1:1)\n    at y (http://host/systems/csb/main.js:2:2)"));
    expect(monitor.reportFor("sequencer")).toMatchObject({ status: "warning", issues: [{ kind: "runtime", count: 1 }] });
    expect(monitor.reportFor("csb").status).toBe("ok");
  });

  it("ignores errors raised only by core code", () => {
    const monitor = new CompatibilityMonitor();
    monitor.recordRuntimeError("Canvas#draw", errorFrom("    at draw (http://host/assets/index.js:1:1)"));
    expect(monitor.report(["sequencer"])).toEqual([{ packageId: "sequencer", status: "ok", issues: [] }]);
  });

  it("marks load failures as failed and deduplicates repeated errors", () => {
    const monitor = new CompatibilityMonitor();
    monitor.recordLoadFailure("tokenmagic", "tokenmagic.js", new Error("missing export"));
    const repeated = errorFrom("    at z (http://host/modules/tokenmagic/fx.js:3:3)");
    monitor.recordRuntimeError("render", repeated);
    monitor.recordRuntimeError("render", repeated);
    const report = monitor.reportFor("tokenmagic");
    expect(report.status).toBe("failed");
    expect(report.issues).toHaveLength(2);
    expect(report.issues[1].count).toBe(2);
  });
});
