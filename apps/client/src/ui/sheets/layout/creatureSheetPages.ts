import type { SheetPage } from "@tabbletop/protocol";

/** Default NPC/enemy sheet: creature board from the table spreadsheet. */
export const CREATURE_SHEET_PAGES: readonly SheetPage[] = [
  {
    "id": "6o09a0n9u",
    "title": "Criatura",
    "components": [
      {
        "id": "mizrilw85",
        "kind": "portrait",
        "x": 0,
        "y": 0,
        "w": 3,
        "h": 6
      },
      {
        "id": "rlm6nn09e",
        "kind": "text",
        "x": 3,
        "y": 2,
        "w": 5,
        "h": 2,
        "key": "tipo_de_criatura",
        "label": "Tipo de criatura"
      },
      {
        "id": "5owkgd8mn",
        "kind": "number",
        "x": 8,
        "y": 2,
        "w": 2,
        "h": 2,
        "key": "nivel",
        "label": "Nível",
        "min": 0,
        "initial": 1,
        "rollable": false
      },
      {
        "id": "5r9ktez5f",
        "kind": "number",
        "x": 10,
        "y": 2,
        "w": 2,
        "h": 2,
        "key": "movimento",
        "label": "Mov",
        "min": 0,
        "initial": 9,
        "rollable": false
      },
      {
        "id": "2bm4wdra1",
        "kind": "text",
        "x": 3,
        "y": 4,
        "w": 5,
        "h": 2,
        "key": "fraqueza",
        "label": "Fraqueza"
      },
      {
        "id": "1r590qu0k",
        "kind": "text",
        "x": 8,
        "y": 4,
        "w": 2,
        "h": 2,
        "key": "sentidos",
        "label": "Sentidos",
        "initial": "especial"
      },
      {
        "id": "mmj82n6v2",
        "kind": "number",
        "x": 1,
        "y": 6,
        "w": 2,
        "h": 2,
        "key": "agili",
        "label": "Agilidade",
        "formula": "if(eq(@agili, 0), 2d20kl, (@agili)d20kh)",
        "min": 0,
        "initial": 1,
        "hint": "Com 0: 2d20 e fica com o menor. Com 1+: um d20 por ponto e fica com o maior."
      },
      {
        "id": "m2d9lzc40",
        "kind": "number",
        "x": 3,
        "y": 6,
        "w": 2,
        "h": 2,
        "key": "forca",
        "label": "Força",
        "formula": "if(eq(@forca, 0), 2d20kl, (@forca)d20kh)",
        "min": 0,
        "initial": 1,
        "hint": "Com 0: 2d20 e fica com o menor. Com 1+: um d20 por ponto e fica com o maior."
      },
      {
        "id": "m6qyd63iy",
        "kind": "number",
        "x": 5,
        "y": 6,
        "w": 2,
        "h": 2,
        "key": "intelecto",
        "label": "Intelecto",
        "formula": "if(eq(@intelecto, 0), 2d20kl, (@intelecto)d20kh)",
        "min": 0,
        "initial": 1,
        "hint": "Com 0: 2d20 e fica com o menor. Com 1+: um d20 por ponto e fica com o maior."
      },
      {
        "id": "rayuq2116",
        "kind": "number",
        "x": 7,
        "y": 6,
        "w": 2,
        "h": 2,
        "key": "presenca",
        "label": "Presença",
        "formula": "if(eq(@presenca, 0), 2d20kl, (@presenca)d20kh)",
        "min": 0,
        "initial": 1,
        "hint": "Com 0: 2d20 e fica com o menor. Com 1+: um d20 por ponto e fica com o maior."
      },
      {
        "id": "1n5n3kmxf",
        "kind": "number",
        "x": 9,
        "y": 6,
        "w": 2,
        "h": 2,
        "key": "vigor",
        "label": "Vigor",
        "formula": "if(eq(@vigor, 0), 2d20kl, (@vigor)d20kh)",
        "min": 0,
        "initial": 1,
        "hint": "Com 0: 2d20 e fica com o menor. Com 1+: um d20 por ponto e fica com o maior."
      },
      {
        "id": "gerrlvpk5",
        "kind": "resource",
        "x": 0,
        "y": 8,
        "w": 9,
        "h": 2,
        "key": "pv",
        "label": "PV",
        "formula": "floor((7 + @vigor) * @nivel)",
        "min": 0,
        "initial": 8,
        "style": {
          "accent": "#c0392b"
        }
      },
      {
        "id": "g0go5ofwx",
        "kind": "computed",
        "x": 9,
        "y": 8,
        "w": 3,
        "h": 2,
        "key": "machucado",
        "label": "Machucado",
        "formula": "floor(((7 + @vigor) * @nivel) / 2)",
        "hint": "Metade do PV máximo"
      },
      {
        "id": "t2dj895ht",
        "kind": "computed",
        "x": 0,
        "y": 10,
        "w": 3,
        "h": 2,
        "key": "defesa",
        "label": "Defesa",
        "formula": "10 + @intelecto + @defesa_bonus"
      },
      {
        "id": "a0e9l4c0e",
        "kind": "number",
        "x": 3,
        "y": 10,
        "w": 3,
        "h": 2,
        "key": "defesa_bonus",
        "label": "DEF bônus",
        "min": 0,
        "initial": 0,
        "rollable": false
      },
      {
        "id": "dw7r21dks",
        "kind": "computed",
        "x": 6,
        "y": 10,
        "w": 3,
        "h": 2,
        "key": "bloqueio",
        "label": "Bloqueio",
        "formula": "@pericias.fortitude",
        "hint": "0 = sem bloqueio"
      },
      {
        "id": "yndjsfn36",
        "kind": "computed",
        "x": 9,
        "y": 10,
        "w": 3,
        "h": 2,
        "key": "esquiva",
        "label": "Esquiva",
        "formula": "if(gt(@pericias.reflexos, 0), @defesa, 0)",
        "hint": "0 = sem esquiva"
      },
      {
        "id": "e3f1pcjzr",
        "kind": "text",
        "x": 0,
        "y": 12,
        "w": 4,
        "h": 2,
        "key": "resistencia",
        "label": "Resistência"
      },
      {
        "id": "xyq8aladk",
        "kind": "text",
        "x": 4,
        "y": 12,
        "w": 4,
        "h": 2,
        "key": "imunidade",
        "label": "Imunidade"
      },
      {
        "id": "f57lrp10t",
        "kind": "text",
        "x": 8,
        "y": 12,
        "w": 4,
        "h": 2,
        "key": "vulneravel",
        "label": "Vulnerável"
      },
      {
        "id": "angagvhgj",
        "kind": "title",
        "x": 0,
        "y": 14,
        "w": 12,
        "h": 1,
        "content": "Perícias"
      },
      {
        "id": "08d2z99mh",
        "kind": "computed",
        "x": 9,
        "y": 15,
        "w": 3,
        "h": 2,
        "key": "pontos_de_pericia",
        "label": "Pontos livres",
        "formula": "15 - @pericias_total"
      },
      {
        "id": "u604izxnj",
        "kind": "roll",
        "x": 9,
        "y": 19,
        "w": 3,
        "h": 2,
        "label": "Percepção",
        "formula": "if(eq(@presenca, 0), 2d20kl, (@presenca)d20kh) + @pericias.percepcao"
      },
      {
        "id": "u7ygt52sb",
        "kind": "skills",
        "x": 0,
        "y": 15,
        "w": 9,
        "h": 10,
        "key": "pericias",
        "label": "Perícias",
        "formula": "1d20 + @valor",
        "min": 0,
        "initial": 0,
        "skills": [
          {
            "key": "atletismo",
            "label": "Atletismo"
          },
          {
            "key": "fortitude",
            "label": "Fortitude"
          },
          {
            "key": "furtividade",
            "label": "Furtividade"
          },
          {
            "key": "iniciativa",
            "label": "Iniciativa"
          },
          {
            "key": "luta",
            "label": "Luta"
          },
          {
            "key": "ocultismo",
            "label": "Ocultismo"
          },
          {
            "key": "percepcao",
            "label": "Percepção"
          },
          {
            "key": "pontaria",
            "label": "Pontaria"
          },
          {
            "key": "reflexos",
            "label": "Reflexos"
          },
          {
            "key": "religiao",
            "label": "Religião"
          },
          {
            "key": "vontade",
            "label": "Vontade"
          }
        ],
        "skillColumns": 2
      },
      {
        "id": "sh30somou",
        "kind": "text",
        "x": 10,
        "y": 4,
        "w": 2,
        "h": 2,
        "key": "sentidos_2",
        "label": "Sentidos",
        "initial": "especial"
      },
      {
        "id": "4tcybxiqw",
        "kind": "text",
        "x": 3,
        "y": 0,
        "w": 9,
        "h": 2,
        "key": "nome",
        "label": "Nome"
      },
      {
        "id": "h2x30h8xr",
        "kind": "roll",
        "x": 9,
        "y": 17,
        "w": 3,
        "h": 2,
        "label": "Iniciativa",
        "formula": "if(eq(@agili, 0), 2d20kl, (@agili)d20kh) + @pericias.iniciativa"
      }
    ]
  },
  {
    "id": "sa0ntxzsl",
    "title": "Habilidades e loot",
    "components": [
      {
        "id": "8jf5h07to",
        "kind": "longtext",
        "x": 0,
        "y": 0,
        "w": 12,
        "h": 4,
        "key": "descricao_habilidade",
        "label": "Descrição da habilidade"
      },
      {
        "id": "nco0v89i9",
        "kind": "title",
        "x": 0,
        "y": 4,
        "w": 12,
        "h": 1,
        "content": "Loot e notas"
      },
      {
        "id": "owvd3mfo0",
        "kind": "longtext",
        "x": 0,
        "y": 5,
        "w": 6,
        "h": 5,
        "key": "loot",
        "label": "Loot"
      },
      {
        "id": "cvxzfzfp9",
        "kind": "longtext",
        "x": 6,
        "y": 5,
        "w": 6,
        "h": 5,
        "key": "descricao",
        "label": "Descrição"
      }
    ]
  }
] as SheetPage[];
