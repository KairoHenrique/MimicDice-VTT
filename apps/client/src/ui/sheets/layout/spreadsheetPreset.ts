import type { SheetComponent, SheetPage, SheetTemplate } from "@tabbletop/protocol";
import { DEFAULT_SKILL_LABELS, skillsFromLabels } from "./skillList";

export const SPREADSHEET_PRESET_ID = "preset-planilha";

type Placement = Pick<SheetComponent, "x" | "y" | "w" | "h">;
type Extras = Omit<SheetComponent, "id" | "kind" | "x" | "y" | "w" | "h">;

const CLASSES = ["Brutamonte", "Sagaz", "Erudito"];
const WEAPON_ATTRIBUTES = ["Força", "Agilidade", "Intelecto"];
const RANGES = ["1 m", "6 m", "9 m", "12 m"];

const ARMOR_DEFENSE = "if(@leve, 3, if(@media, 5, if(@pesada, 7, 0)))";
const ARMOR_INVENTORY_PENALTY = "if(@leve, 3, if(@media, 5, if(@pesada, 8, 0)))";
const WEAPON_DICE = "max(choose(@atributo_da_arma_n, @forca, @agilidade, @intelecto) + @dados_extras_de_teste, 1)";
const WEAPON_SKILL_BONUS = "if(@arma_luta, @pericias.luta, 0) + if(@arma_pontaria, @pericias.pontaria, 0) + if(@arma_ocultismo, @pericias.ocultismo, 0) + if(@arma_religiao, @pericias.religiao, 0)";

/** Lays components out with stable ids, so applying the model twice keeps the same structure. */
class PageBuilder {
  readonly components: SheetComponent[] = [];
  #counter = 0;

  constructor(private readonly prefix: string) {}

  add(kind: SheetComponent["kind"], placement: Placement, extras: Extras = {}): void {
    this.#counter += 1;
    this.components.push({ id: `${this.prefix}${this.#counter}`, kind, ...placement, ...extras });
  }

  title(y: number, label: string): void {
    this.add("title", { x: 0, y, w: 12, h: 1 }, { content: label });
  }
}

function attributeRoll(key: string): string {
  return `(max(@${key}, 1))d20`;
}

function characterPage(): SheetPage {
  const page = new PageBuilder("pp");
  page.add("portrait", { x: 0, y: 0, w: 3, h: 6 });
  page.add("text", { x: 3, y: 0, w: 3, h: 2 }, { key: "origem", label: "Origem" });
  page.add("text", { x: 6, y: 0, w: 3, h: 2 }, { key: "altura", label: "Altura" });
  page.add("text", { x: 9, y: 0, w: 3, h: 2 }, { key: "idade", label: "Idade" });
  page.add("select", { x: 3, y: 2, w: 3, h: 2 }, { key: "classe", label: "Classe", options: CLASSES, initial: CLASSES[0] });
  page.add("number", { x: 6, y: 2, w: 3, h: 2 }, { key: "nivel", label: "Nível", initial: 1, min: 0, rollable: false });
  page.add("number", { x: 9, y: 2, w: 3, h: 2 }, { key: "movimento", label: "Movimento", initial: 9, min: 0, rollable: false });
  page.add("computed", { x: 3, y: 4, w: 3, h: 2 }, { key: "pontos_de_atributo", label: "Pontos de atributo livres", formula: "floor(@nivel ** 1.5 + 10 - (@agilidade + @forca + @intelecto + @presenca + @vigor))" });
  page.add("computed", { x: 6, y: 4, w: 3, h: 2 }, { key: "pontos_de_pericia", label: "Pontos de perícia livres", formula: "if(eq(@classe_n, 1), 6, choose(@classe_n, 6, 6, 9) + @intelecto) * 5 - @pericias_total" });
  page.add("computed", { x: 9, y: 4, w: 3, h: 2 }, { key: "maximo_por_pericia", label: "Máximo por perícia", formula: "if(eq(@nivel, 5), 15, if(gt(@nivel, 2), 10, if(gt(@nivel, 0), 5, 0)))" });

  page.title(6, "Atributos");
  const attributes = [
    ["agilidade", "Agilidade"],
    ["forca", "Força"],
    ["intelecto", "Intelecto"],
    ["presenca", "Presença"],
    ["vigor", "Vigor"],
  ] as const;
  attributes.forEach(([key, label], index) => {
    page.add("number", { x: index * 2, y: 7, w: 2, h: 2 }, { key, label, initial: 1, min: 0, formula: attributeRoll(key), rollMode: "highest", hint: "Rola um d20 por ponto e fica com o maior" });
  });

  page.title(9, "Status");
  page.add("computed", { x: 0, y: 10, w: 3, h: 2 }, { key: "pv_maximo", label: "PV máximo", formula: "floor((choose(@classe_n, 15, 11, 8) + @vigor) * @nivel)" });
  page.add("resource", { x: 3, y: 10, w: 3, h: 2 }, { key: "pv", label: "PV", initial: 16, min: 0, formula: "@pv_maximo", style: { accent: "#c0392b" } });
  page.add("computed", { x: 6, y: 10, w: 3, h: 2 }, { key: "pe_maximo", label: "PE máximo", formula: "choose(@classe_n, 5 + @presenca * 2 * @nivel / 2, 8 + @presenca * 4 * @nivel / 2, 8 + @presenca * 6 * @nivel / 2)" });
  page.add("resource", { x: 9, y: 10, w: 3, h: 2 }, { key: "pe", label: "PE", initial: 6, min: 0, formula: "@pe_maximo", style: { accent: "#2f80d1" } });
  page.add("computed", { x: 0, y: 12, w: 3, h: 2 }, { key: "defesa", label: "Defesa", formula: `10 + @intelecto + ${ARMOR_DEFENSE} + if(eq(@classe_n, 2), 2, 0)` });
  page.add("computed", { x: 3, y: 12, w: 3, h: 2 }, { key: "bloqueio", label: "Bloqueio", formula: "@pericias.fortitude", hint: "0 = sem bloqueio" });
  page.add("computed", { x: 6, y: 12, w: 3, h: 2 }, { key: "esquiva", label: "Esquiva", formula: `if(gt(@pericias.reflexos, 0), @defesa + ${ARMOR_DEFENSE}, 0)`, hint: "0 = sem esquiva" });
  page.add("computed", { x: 9, y: 12, w: 3, h: 2 }, { key: "inventario_maximo", label: "Inventário máximo", formula: `10 + @forca * 2 + @vigor * 2 + (@nivel + 5) - ${ARMOR_INVENTORY_PENALTY} + @inventario_bonus` });

  page.title(14, "Perícias");
  page.add("skills", { x: 0, y: 15, w: 12, h: 11 }, { key: "pericias", label: "Perícias", skills: skillsFromLabels(DEFAULT_SKILL_LABELS), skillColumns: 3, skillStyle: "number", initial: 0, min: 0 });
  return { id: "planilha-ficha", title: "Ficha", components: page.components };
}

function equipmentPage(): SheetPage {
  const page = new PageBuilder("pe");
  page.title(0, "Armadura");
  const armors = [
    ["leve", "Leve"],
    ["media", "Média"],
    ["pesada", "Pesada"],
    ["encantada", "Encantada"],
    ["reforcada", "Reforçada"],
    ["espinhos", "Espinhos 2"],
  ] as const;
  armors.forEach(([key, label], index) => page.add("checkbox", { x: (index % 3) * 4, y: 1 + Math.floor(index / 3), w: 4, h: 1 }, { key, label }));
  page.add("computed", { x: 0, y: 3, w: 4, h: 2 }, { key: "def_da_armadura", label: "DEF da armadura", formula: ARMOR_DEFENSE });
  page.add("computed", { x: 4, y: 3, w: 4, h: 2 }, { key: "rdm", label: "RDM", formula: "if(@reforcada, 3, 0) + if(@pesada, 2, 0) + @rdm_bonus" });
  page.add("computed", { x: 8, y: 3, w: 4, h: 2 }, { key: "rdf", label: "RDF", formula: "if(@encantada, 3, 0) + if(@leve, 1, 0) + @rdf_bonus" });

  page.title(5, "Habilidades: dano e DT");
  const abilities = [
    ["Milagres", "milagres", "floor(@presenca * 1.5)", "@presenca * 5 + 5"],
    ["Arcanismo", "arcanismo", "@intelecto * 2", "@presenca * 5 + 10"],
    ["Magias ocultas", "magias_ocultas", "floor(@intelecto * 3.5)", "floor(@presenca * 3 + 10)"],
  ] as const;
  abilities.forEach(([label, key, damage, difficulty], index) => {
    page.add("computed", { x: index * 4, y: 6, w: 2, h: 2 }, { key: `${key}_dano`, label: `${label}: dano`, formula: damage });
    page.add("computed", { x: index * 4 + 2, y: 6, w: 2, h: 2 }, { key: `${key}_dt`, label: `${label}: DT`, formula: difficulty });
  });

  page.title(8, "Arma equipada");
  const weaponSkills = [
    ["arma_luta", "Luta"],
    ["arma_pontaria", "Pontaria"],
    ["arma_ocultismo", "Ocultismo"],
    ["arma_religiao", "Religião"],
  ] as const;
  weaponSkills.forEach(([key, label], index) => page.add("checkbox", { x: index * 3, y: 9, w: 3, h: 1 }, { key, label, hint: "Perícia somada ao teste de acerto" }));
  const traits = [
    ["encantado", "Encantado"],
    ["afiado", "Afiado"],
    ["pesado", "Pesado"],
  ] as const;
  traits.forEach(([key, label], index) => page.add("checkbox", { x: index * 3, y: 10, w: 3, h: 1 }, { key, label }));
  page.add("select", { x: 0, y: 11, w: 3, h: 2 }, { key: "atributo_da_arma", label: "Atributo do teste", options: WEAPON_ATTRIBUTES, initial: WEAPON_ATTRIBUTES[0] });
  page.add("select", { x: 3, y: 11, w: 3, h: 2 }, { key: "alcance", label: "Alcance", options: RANGES, initial: RANGES[0] });
  page.add("text", { x: 6, y: 11, w: 3, h: 2 }, { key: "dano_da_arma", label: "Dano da arma", initial: "1d6", hint: "Ex.: 1d8" });
  page.add("number", { x: 9, y: 11, w: 3, h: 2 }, { key: "dano_fixo", label: "Dano fixo", initial: 0, rollable: false });
  page.add("computed", { x: 0, y: 13, w: 3, h: 2 }, { key: "dados_do_teste", label: "Dados do teste", formula: WEAPON_DICE });
  page.add("computed", { x: 3, y: 13, w: 3, h: 2 }, { key: "bonus_de_acerto", label: "Bônus de acerto", formula: WEAPON_SKILL_BONUS });
  page.add("roll", { x: 6, y: 13, w: 3, h: 2 }, { label: "Teste de acerto", formula: "(@dados_do_teste)d20 + @bonus_de_acerto", rollMode: "highest" });
  page.add("roll", { x: 9, y: 13, w: 3, h: 2 }, { label: "Dano", formula: "@dano_da_arma + @dano_fixo + @dano_extra" });

  page.title(15, "Bônus");
  const bonuses = [
    ["dados_extras_de_dano", "Dados extras de dano"],
    ["dados_extras_de_teste", "Dados extras de teste"],
    ["dano_extra", "Dano extra"],
    ["rdf_bonus", "RDF bônus"],
    ["rdm_bonus", "RDM bônus"],
    ["inventario_bonus", "Inventário bônus"],
  ] as const;
  bonuses.forEach(([key, label], index) => page.add("number", { x: (index % 3) * 4, y: 16 + Math.floor(index / 3) * 2, w: 4, h: 2 }, { key, label, initial: 0, rollable: false }));

  page.title(20, "Inventário");
  page.add("list", { x: 0, y: 21, w: 8, h: 7 }, { key: "inventario", label: "Inventário", columns: [{ key: "item", label: "Item", type: "text" }, { key: "espaco", label: "Espaço", type: "number" }] });
  page.add("list", { x: 8, y: 21, w: 4, h: 7 }, { key: "itens_especiais", label: "Itens especiais", columns: [{ key: "nome", label: "Nome do item", type: "text" }, { key: "valor", label: "Valor", type: "number" }] });
  page.add("longtext", { x: 0, y: 28, w: 12, h: 5 }, { key: "notas", label: "Notas" });
  return { id: "planilha-equipamento", title: "Combate e itens", components: page.components };
}

/** The table's own spreadsheet as a sheet: classes, five attributes, level-based PV/PE, armor and weapon rules. */
export function spreadsheetPreset(): SheetTemplate {
  return {
    id: SPREADSHEET_PRESET_ID,
    name: "Agente (planilha)",
    role: "player",
    description: "Classes Brutamonte, Sagaz e Erudito, cinco atributos, PV/PE por nível, armaduras, arma equipada e perícias.",
    layout: { version: 2, pages: [characterPage(), equipmentPage()] },
  };
}
