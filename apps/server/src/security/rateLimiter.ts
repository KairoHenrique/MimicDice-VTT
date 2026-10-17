import type { Request } from "express";
import { ipKeyGenerator, rateLimit, type Options } from "express-rate-limit";
import { clientAddressOf } from "./clientAddress";

/** Counts each visitor separately, including those behind the Cloudflare tunnel who all arrive from loopback. */
export function createRateLimiter(options: Partial<Options>) {
  return rateLimit({
    standardHeaders: "draft-7",
    legacyHeaders: false,
    ...options,
    keyGenerator: (request: Request) => ipKeyGenerator(clientAddressOf(request) ?? "unknown"),
    validate: { xForwardedForHeader: false },
  });
}
