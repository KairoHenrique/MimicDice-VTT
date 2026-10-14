import { describe, expect, it } from "vitest";
import { embeddedDocumentType } from "./documentTypes";
import { DOCUMENT_OWNERSHIP_LEVELS as LEVELS } from "./permissions";
import { redactSecretsForOwnership, stripSecretSections } from "./secretSections";

const pageDefinition = embeddedDocumentType("JournalEntryPage");

describe("secret sections", () => {
  it("removes secret blocks, including nested sections, and keeps the rest", () => {
    const html = `<p>Público</p><section class="secret" id="s1"><p>Oculto</p><section><p>Interno</p></section></section><p>Fim</p>`;
    expect(stripSecretSections(html)).toBe("<p>Público</p><p>Fim</p>");
  });

  it("keeps ordinary sections and drops an unterminated secret", () => {
    expect(stripSecretSections(`<section class="lore"><p>Ok</p></section>`)).toBe(`<section class="lore"><p>Ok</p></section>`);
    expect(stripSecretSections(`<p>A</p><section class='x secret'><p>B`)).toBe("<p>A</p>");
  });

  it("redacts nested and flat HTML fields for non-owners only", () => {
    if (!pageDefinition) throw new Error("JournalEntryPage definition missing");
    const secret = `<p>Dica</p><section class="secret"><p>Armadilha</p></section>`;
    expect(redactSecretsForOwnership(pageDefinition, { text: { content: secret } }, LEVELS.OBSERVER)).toEqual({ text: { content: "<p>Dica</p>" } });
    expect(redactSecretsForOwnership(pageDefinition, { "text.content": secret }, LEVELS.OBSERVER)).toEqual({ "text.content": "<p>Dica</p>" });
    expect(redactSecretsForOwnership(pageDefinition, { text: { content: secret } }, LEVELS.OWNER)).toEqual({ text: { content: secret } });
  });
});
