import { describe, expect, it, vi } from "vitest";
import { TableSessionIdleCloser } from "./TableSessionIdleCloser";

const HOUR_MS = 60 * 60 * 1000;

function createCloser(open: boolean) {
  let now = 0;
  const closeSession = vi.fn(async () => undefined);
  const closer = new TableSessionIdleCloser({ idleLimitMs: HOUR_MS, isSessionOpen: () => open, closeSession, onError: () => undefined, now: () => now });
  return { closer, closeSession, advance: (milliseconds: number) => (now += milliseconds) };
}

describe("TableSessionIdleCloser", () => {
  it("keeps an active session open", async () => {
    const { closer, closeSession, advance } = createCloser(true);
    advance(HOUR_MS - 1);
    closer.recordActivity();
    advance(HOUR_MS - 1);
    expect(await closer.checkIdle()).toBe(false);
    expect(closeSession).not.toHaveBeenCalled();
  });

  it("closes the session after an hour without input", async () => {
    const { closer, closeSession, advance } = createCloser(true);
    advance(HOUR_MS);
    expect(await closer.checkIdle()).toBe(true);
    expect(closeSession).toHaveBeenCalledOnce();
  });

  it("does nothing while the session is already closed", async () => {
    const { closer, closeSession, advance } = createCloser(false);
    advance(HOUR_MS * 3);
    expect(await closer.checkIdle()).toBe(false);
    expect(closeSession).not.toHaveBeenCalled();
  });
});
