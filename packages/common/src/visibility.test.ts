import { describe, expect, it } from "vitest";
import { WORLD_DOCUMENT_TYPES } from "./documentTypes";
import { DOCUMENT_OWNERSHIP_LEVELS as LEVELS } from "./permissions";
import { redactChangesForLimitedViewer, redactDocumentForViewer, viewLevelFor, VIEW_LEVELS } from "./visibility";

const player = { userId: "playerAAAAAAAAAA", isGameMaster: false };
const gameMaster = { userId: "gmAAAAAAAAAAAAAA", isGameMaster: true };

function actorWithOwnership(ownership: Record<string, number>) {
  return {
    _id: "actorAAAAAAAAAAA",
    name: "Vilão secreto",
    img: "icons/svg/mystery-man.svg",
    type: "base",
    system: { hp: 30, segredo: "é o rei" },
    items: [{ _id: "itemAAAAAAAAAAAA", name: "Adaga", system: {} }],
    effects: [],
    ownership,
    flags: { notes: "privado" },
  };
}

describe("document visibility", () => {
  it("hides documents with NONE ownership from players but never from the GM", () => {
    const actor = actorWithOwnership({ default: LEVELS.NONE });
    expect(redactDocumentForViewer(WORLD_DOCUMENT_TYPES.Actor, actor, player)).toBeNull();
    expect(redactDocumentForViewer(WORLD_DOCUMENT_TYPES.Actor, actor, gameMaster)).toEqual(actor);
  });

  it("sends only name and image for LIMITED ownership", () => {
    const actor = actorWithOwnership({ default: LEVELS.LIMITED });
    const redacted = redactDocumentForViewer(WORLD_DOCUMENT_TYPES.Actor, actor, player);
    expect(redacted).toEqual({ _id: actor._id, name: actor.name, img: actor.img, type: "base", ownership: actor.ownership });
  });

  it("lets per-player ownership override the default", () => {
    const actor = actorWithOwnership({ default: LEVELS.NONE, [player.userId]: LEVELS.OBSERVER });
    expect(viewLevelFor(WORLD_DOCUMENT_TYPES.Actor, actor, player)).toBe(VIEW_LEVELS.FULL);
    expect(redactDocumentForViewer(WORLD_DOCUMENT_TYPES.Actor, actor, player)?.items).toHaveLength(1);
  });

  it("filters journal pages using their own ownership, inheriting from the entry", () => {
    const journal = {
      _id: "journalAAAAAAAAA",
      name: "Pistas",
      ownership: { default: LEVELS.OBSERVER },
      pages: [
        { _id: "pageAAAAAAAAAAAA", name: "Pública", ownership: { default: LEVELS.INHERIT } },
        { _id: "pageBBBBBBBBBBBB", name: "Secreta", ownership: { default: LEVELS.NONE } },
      ],
    };
    const redacted = redactDocumentForViewer(WORLD_DOCUMENT_TYPES.JournalEntry, journal, player);
    expect(redacted?.pages.map((page: { name: string }) => page.name)).toEqual(["Pública"]);
  });

  it("strips non-limited fields from update diffs", () => {
    const changes = { name: "Novo", system: { hp: 1 }, "flags.x": 1 };
    expect(redactChangesForLimitedViewer(WORLD_DOCUMENT_TYPES.Actor, changes)).toEqual({ name: "Novo" });
  });
});

describe("chat message visibility", () => {
  const otherPlayer = { userId: "playerBBBBBBBBBB", isGameMaster: false };
  const message = (overrides: Record<string, unknown>) => ({
    _id: "messageAAAAAAAAA",
    author: player.userId,
    content: "17",
    rolls: ['{"formula":"1d20"}'],
    whisper: [],
    blind: false,
    ...overrides,
  });

  it("shows public rolls to everyone", () => {
    expect(redactDocumentForViewer(WORLD_DOCUMENT_TYPES.ChatMessage, message({}), otherPlayer)?.rolls).toHaveLength(1);
  });

  it("shows GM rolls only to the author, recipients and GMs", () => {
    const gmRoll = message({ whisper: [gameMaster.userId] });
    expect(redactDocumentForViewer(WORLD_DOCUMENT_TYPES.ChatMessage, gmRoll, otherPlayer)).toBeNull();
    expect(viewLevelFor(WORLD_DOCUMENT_TYPES.ChatMessage, gmRoll, player)).toBe(VIEW_LEVELS.FULL);
    expect(viewLevelFor(WORLD_DOCUMENT_TYPES.ChatMessage, gmRoll, gameMaster)).toBe(VIEW_LEVELS.FULL);
  });

  it("hides blind roll results from their own author", () => {
    const blindRoll = message({ whisper: [gameMaster.userId], blind: true });
    const authorCopy = redactDocumentForViewer(WORLD_DOCUMENT_TYPES.ChatMessage, blindRoll, player);
    expect(authorCopy).not.toBeNull();
    expect(authorCopy?.rolls).toBeUndefined();
    expect(authorCopy?.content).toBeUndefined();
    expect(redactDocumentForViewer(WORLD_DOCUMENT_TYPES.ChatMessage, blindRoll, gameMaster)?.rolls).toHaveLength(1);
    expect(redactDocumentForViewer(WORLD_DOCUMENT_TYPES.ChatMessage, blindRoll, otherPlayer)).toBeNull();
  });
});
