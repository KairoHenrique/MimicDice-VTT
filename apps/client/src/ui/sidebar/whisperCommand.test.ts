import { describe, expect, it } from "vitest";
import { isWhisperCommand, parseWhisperCommand, type WhisperUser } from "./whisperCommand";

const USERS: WhisperUser[] = [
  { id: "gm1", name: "Mestre Kairo", isGM: true },
  { id: "p1", name: "Bruno", isGM: false },
  { id: "p2", name: "Ana Clara", isGM: false },
  { id: "p3", name: "Ana", isGM: false },
];

describe("parseWhisperCommand", () => {
  it("detects the command prefix", () => {
    expect(isWhisperCommand("/w Bruno oi")).toBe(true);
    expect(isWhisperCommand("/whisper Bruno oi")).toBe(true);
    expect(isWhisperCommand("/wave")).toBe(false);
    expect(isWhisperCommand("1d20")).toBe(false);
  });

  it("whispers to a single user by name, case insensitive", () => {
    expect(parseWhisperCommand("/w bruno vai pela esquerda", USERS, "p2")).toEqual({ recipientIds: ["p1"], text: "vai pela esquerda" });
  });

  it("prefers the longest matching name so names with spaces work without quotes", () => {
    expect(parseWhisperCommand("/w Ana Clara cuidado", USERS, "p1")).toEqual({ recipientIds: ["p2"], text: "cuidado" });
    expect(parseWhisperCommand("/w Ana cuidado", USERS, "p1")).toEqual({ recipientIds: ["p3"], text: "cuidado" });
  });

  it("accepts quoted names, bracket lists and group aliases", () => {
    expect(parseWhisperCommand('/w "Ana Clara" oi', USERS, "p1")).toEqual({ recipientIds: ["p2"], text: "oi" });
    expect(parseWhisperCommand("/w [Bruno, Ana] oi", USERS, "gm1")).toEqual({ recipientIds: ["p1", "p3"], text: "oi" });
    expect(parseWhisperCommand("/w mestre posso abrir o baú?", USERS, "p1")).toEqual({ recipientIds: ["gm1"], text: "posso abrir o baú?" });
    expect(parseWhisperCommand("/w jogadores silêncio", USERS, "gm1")).toEqual({ recipientIds: ["p1", "p2", "p3"], text: "silêncio" });
  });

  it("never includes the sender and reports unknown names or empty messages", () => {
    expect(parseWhisperCommand("/w jogadores oi", USERS, "p1")).toEqual({ recipientIds: ["p2", "p3"], text: "oi" });
    expect(parseWhisperCommand("/w Zé oi", USERS, "p1")).toHaveProperty("error");
    expect(parseWhisperCommand("/w Bruno", USERS, "p2")).toHaveProperty("error");
    expect(parseWhisperCommand("/w", USERS, "p2")).toHaveProperty("error");
    expect(parseWhisperCommand("/w Bruno oi", USERS, "p1")).toHaveProperty("error");
  });
});
