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

const D20_MODIFIER = (key: string) => `1d20 + floor((@${key} - 10) / 2)`;
const ABILITIES = [
  ["Força", "forca"],
  ["Destreza", "destreza"],
  ["Constituição", "constituicao"],
  ["Inteligência", "inteligencia"],
  ["Sabedoria", "sabedoria"],
  ["Carisma", "carisma"],
] as const;

function template(id: string, name: string, role: ActorRole, description: string, sections: SheetSection[]): SheetTemplate {
  return { id, name, role, description, layout: migrateLegacyLayout({ version: 1, sections }) };
}

function adventurerD20(): SheetTemplate {
  const b = new PresetBuilder("ad");
  return template("preset-d20", "Aventureiro d20", "player", "Atributos clássicos com modificador, vida, mana e condições.", [
    b.section("Identidade", 2, [b.field("Classe", "text"), b.field("Raça", "text"), b.field("Nível", "number", { initial: 1 }), b.field("Antecedente", "text")]),
    b.section("Recursos", 2, [
      b.field("Vida", "resource", { initial: 10, color: "#c0392b" }),
      b.field("Mana", "resource", { initial: 5, color: "#2f80d1" }),
      b.field("Defesa", "number", { initial: 10 }),
      b.field("Deslocamento", "text", { initial: "9 m" }),
    ]),
    b.section("Atributos", 3, ABILITIES.map(([label, key]) => b.field(label, "number", { initial: 10, formula: D20_MODIFIER(key), hint: "Rola 1d20 + modificador" }))),
    b.section("Combate", 3, [
      b.field("Iniciativa", "roll", { formula: D20_MODIFIER("destreza") }),
      b.field("Ataque", "roll", { formula: D20_MODIFIER("forca") }),
      b.field("Dano", "roll", { formula: "1d8 + floor((@forca - 10) / 2)" }),
    ]),
    b.section("Condições", 3, [
      b.field("Testes contra a morte", "pips", { max: 3 }),
      b.field("Envenenado", "checkbox"),
      b.field("Inspirado", "checkbox"),
    ]),
    b.section("História", 1, [b.field("Aparência e passado", "longtext"), b.field("Anotações", "longtext")]),
  ]);
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

function investigationD100(): SheetTemplate {
  const b = new PresetBuilder("iv");
  const skills = ["Percepção", "Furtividade", "Lábia", "Ocultismo", "Primeiros socorros", "Luta"];
  return template("preset-d100", "Investigação (d100)", "player", "Perícias em porcentagem, vida e sanidade.", [
    b.section("Recursos", 3, [
      b.field("Vida", "resource", { initial: 10, color: "#c0392b" }),
      b.field("Sanidade", "resource", { initial: 50, color: "#7d5fff" }),
      b.field("Sorte", "number", { initial: 50, formula: "1d100", hint: "Passa se tirar menor ou igual" }),
    ]),
    b.section("Perícias", 3, skills.map((label) => b.field(label, "number", { initial: 30, formula: "1d100", hint: "Passa se tirar menor ou igual" }))),
    b.section("Investigador", 1, [b.field("Ocupação", "text"), b.field("Pistas e contatos", "longtext")]),
  ]);
}

function narrative2d6(): SheetTemplate {
  const b = new PresetBuilder("nr");
  const stats = [
    ["Vigor", "vigor"],
    ["Agilidade", "agilidade"],
    ["Mente", "mente"],
    ["Presença", "presenca"],
  ] as const;
  return template("preset-2d6", "Narrativo 2d6", "player", "Quatro atributos, estresse e ferimentos marcados em bolinhas.", [
    b.section("Atributos", 2, stats.map(([label, key]) => b.field(label, "number", { initial: 0, formula: `2d6 + @${key}` }))),
    b.section("Estado", 3, [b.field("Estresse", "pips", { max: 6 }), b.field("Ferimentos", "pips", { max: 3 }), b.field("Condições", "text")]),
    b.section("Personagem", 1, [b.field("Movimentos", "longtext"), b.field("Equipamento", "longtext")]),
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

function blank(): SheetTemplate {
  return template("preset-blank", "Em branco", "npc", "Comece do zero e monte do seu jeito.", []);
}

export const SHEET_PRESETS: readonly SheetTemplate[] = Object.freeze([spreadsheetPreset(), adventurerD20(), quickEnemy(), bossEnemy(), standardNpc(), investigationD100(), narrative2d6(), blank()]);

/** Built-in fallback when the GM has not chosen a default model for the role. */
export const BUILT_IN_DEFAULT_TEMPLATE_IDS: Readonly<Record<ActorRole, string>> = Object.freeze({ player: SPREADSHEET_PRESET_ID, npc: "preset-npc", enemy: "preset-enemy" });

export function isPresetId(templateId: string): boolean {
  return templateId.startsWith("preset-");
}
