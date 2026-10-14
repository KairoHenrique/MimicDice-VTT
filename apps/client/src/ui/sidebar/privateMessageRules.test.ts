import { describe, expect, it } from "vitest";
import { isIncomingPrivateMessage, shortenPreview } from "./privateMessageRules";

const me = "PlayerId00000001";

describe("isIncomingPrivateMessage", () => {
  it("alerts only for private text sent to this user by someone else", () => {
    expect(isIncomingPrivateMessage({ whisper: [me], isAuthor: false, isRoll: false }, me)).toBe(true);
    expect(isIncomingPrivateMessage({ whisper: [me], isAuthor: true, isRoll: false }, me)).toBe(false);
    expect(isIncomingPrivateMessage({ whisper: ["OtherUser0000001"], isAuthor: false, isRoll: false }, me)).toBe(false);
    expect(isIncomingPrivateMessage({ whisper: [], isAuthor: false, isRoll: false }, me)).toBe(false);
    expect(isIncomingPrivateMessage({ whisper: [me], isAuthor: false, isRoll: true }, me)).toBe(false);
  });
});

describe("shortenPreview", () => {
  it("collapses spaces and shortens long messages", () => {
    expect(shortenPreview("  Olá \n  Ana  ")).toBe("Olá Ana");
    const preview = shortenPreview("a".repeat(500));
    expect(preview.length).toBe(140);
    expect(preview.endsWith("…")).toBe(true);
  });
});
