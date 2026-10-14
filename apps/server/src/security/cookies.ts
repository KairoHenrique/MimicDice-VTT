import type { Response } from "express";
import { SESSION_COOKIE_NAME } from "@tabbletop/protocol";

export function readCookie(cookieHeader: string | undefined, cookieName: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(";")) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) continue;
    if (pair.slice(0, separatorIndex).trim() !== cookieName) continue;
    try {
      return decodeURIComponent(pair.slice(separatorIndex + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function readSessionToken(cookieHeader: string | undefined): string | undefined {
  return readCookie(cookieHeader, SESSION_COOKIE_NAME);
}

export function writeSessionCookie(response: Response, token: string, lifetimeMs: number): void {
  response.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
    maxAge: lifetimeMs,
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE_NAME, { httpOnly: true, sameSite: "strict", path: "/" });
}
