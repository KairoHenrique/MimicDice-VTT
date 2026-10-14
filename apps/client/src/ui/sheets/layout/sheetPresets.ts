import type { ActorRole, LegacySheetField as SheetField, LegacySheetFieldType as SheetFieldType, LegacySheetSection as SheetSection, SheetTemplate } from "@tabbletop/protocol";
import { migrateLegacyLayout } from "./legacyLayoutMigration";
import { keyFromLabel } from "./sheetLayoutRules";
import { SPREADSHEET_PRESET_ID, spreadsheetPreset } from "./spreadsheetPreset";

type FieldExtras = Partial<Omit<SheetField, "id" | "key" | "label" | "type">>;

/** Builds preset layouts with stable ids and keys derived from labels (the keys become `@atalhos` in formulas). */
class PresetBuilder {
  readonly #takenKeys = new Set<string>();
  readonly #prefix: string;
  #counter = 0;

  constructor(prefix: string) {
    this.#prefix = prefix;
  }

  field(label: string, type: SheetFieldType, extras: FieldExtras = {}): SheetField {
    const key = keyFromLabel(label, this.#takenKeys);
    this.#takenKeys.add(key);
    return { id: this.#nextId(), key, label, type, ...extras };
  }

  section(title: string, columns: number, fields: SheetField[]): SheetSection {
    return { id: this.#nextId(), title, columns, fields };
  }

  #nextId(): string {
    this.#counter += 1;
    return `${this.#prefix}${this.#counter}`;
  }
}

function template(id: string, name: string, role: ActorRole, description: string, sections: SheetSection[]): SheetTemplate {
  return { id, name, role, description, layout: migrateLegacyLayout({ version: 1, sections }) };
}

function quickEnemy(): SheetTemplate {
  const b = new PresetBuilder("qe");
  return template("preset-enemy", "Inimigo rápido", "enemy", "Só o que o mestre precisa em combate: vida, defesa, ataque e dano.", [
    b.section("Combate", 2, [
      b.field("Vida", "resource", { initial: 12, color: "#c0392b" }),
      b.field("Defesa", "number", { initial: 12 }),
      b.field("Ameaça", "select", { options: ["Lacaio", "Comum", "Elite", "Chefe"], initial: "Comum" }),
      b.field("Deslocamento", "text", { initial: "9 m" }),
    ]),
    b.section("Ações", 3, [
      b.field("Bônus de ataque", "number", { initial: 3, formula: "1d20 + @bonus_de_ataque" }),
      b.field("Dano", "roll", { formula: "1d6 + @bonus_de_ataque" }),
      b.field("Especial", "roll", { formula: "2d6" }),
    ]),
    b.section("Comportamento", 1, [b.field("Táticas", "longtext"), b.field("Saque", "longtext")]),
  ]);
}

function bossEnemy(): SheetTemplate {
  const b = new PresetBuilder("bo");
  return template("preset-boss", "Chefe", "enemy", "Inimigo com fases, ações extras, fraquezas e resistências.", [
    b.section("Resistência", 2, [
      b.field("Vida", "resource", { initial: 80, color: "#8e1b1b" }),
      b.field("Defesa", "number", { initial: 16 }),
      b.field("Fase", "pips", { max: 3, initial: 1 }),
      b.field("Ações extras", "pips", { max: 3, initial: 3 }),
    ]),
    b.section("Ataques", 3, [
      b.field("Bônus de ataque", "number", { initial: 7, formula: "1d20 + @bonus_de_ataque" }),
      b.field("Golpe", "roll", { formula: "2d8 + @bonus_de_ataque" }),
      b.field("Ataque em área", "roll", { formula: "6d6" }),
    ]),
    b.section("Detalhes", 2, [b.field("Fraquezas", "text"), b.field("Resistências", "text"), b.field("Comportamento por fase", "longtext"), b.field("Recompensa", "longtext")]),
  ]);
}

function standardNpc(): SheetTemplate {
  const b = new PresetBuilder("np");
  return template("preset-npc", "NPC padrão", "npc", "Aliados, comerciantes e figurantes: vida, atitude, testes rápidos e anotações do mestre.", [
    b.section("Quem é", 2, [
      b.field("Ocupação", "text"),
      b.field("Atitude", "select", { options: ["Amigável", "Neutro", "Desconfiado", "Hostil"], initial: "Neutro" }),
      b.field("Local", "text"),
      b.field("Facção", "text"),
    ]),
    b.section("Em jogo", 3, [
      b.field("Vida", "resource", { initial: 8, color: "#c0392b" }),
      b.field("Defesa", "number", { initial: 10 }),
      b.field("Teste", "number", { initial: 2, formula: "1d20 + @teste", hint: "Rola 1d20 + bônus" }),
    ]),
    b.section("Para o mestre", 1, [b.field("Personalidade e voz", "longtext"), b.field("O que sabe", "longtext")]),
  ]);
}

/** The table's player sheet plus temporary NPC and enemy models, until each role gets its own sheet. */
export const SHEET_PRESETS: readonly SheetTemplate[] = Object.freeze([spreadsheetPreset(), standardNpc(), quickEnemy(), bossEnemy()]);

/** Built-in fallback when the GM has not chosen a default model for the role (or the chosen one no longer exists). */
export const BUILT_IN_DEFAULT_TEMPLATE_IDS: Readonly<Record<ActorRole, string>> = Object.freeze({ player: SPREADSHEET_PRESET_ID, npc: "preset-npc", enemy: "preset-enemy" });

export function isPresetId(templateId: string): boolean {
  return templateId.startsWith("preset-");
}
