import { describe, expect, it } from "vitest";
import { SlidingWindowLimiter } from "./SlidingWindowLimiter";

describe("SlidingWindowLimiter", () => {
  it("allows three events per five seconds and frees a slot once the oldest leaves the window", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(3, 5_000, () => now);
    const results = [0, 1_000, 2_000].map((time) => {
      now = time;
      return limiter.tryConsume("ana");
    });
    expect(results).toEqual([true, true, true]);
    now = 4_999;
    expect(limiter.tryConsume("ana")).toBe(false);
    now = 5_000;
    expect(limiter.tryConsume("ana")).toBe(true);
    expect(limiter.tryConsume("ana")).toBe(false);
  });

  it("counts each user separately", () => {
    const limiter = new SlidingWindowLimiter(1, 5_000, () => 0);
    expect(limiter.tryConsume("ana")).toBe(true);
    expect(limiter.tryConsume("bruno")).toBe(true);
    expect(limiter.tryConsume("ana")).toBe(false);
  });
});
