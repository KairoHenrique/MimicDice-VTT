import type { SheetPage } from "@tabbletop/protocol";

/** Default player sheet (Player): layout from the table spreadsheet. */
export const PLAYER_SHEET_PAGES: readonly SheetPage[] = [
  {
    "id": "eh7ti6g9s",
    "title": "Ficha",
    "components": [
      {
        "id": "vhbc6dej6",
        "kind": "portrait",
        "x": 0,
        "y": 0,
        "w": 3,
        "h": 4
      },
      {
        "id": "cm6hyt8fx",
        "kind": "text",
        "x": 3,
        "y": 0,
        "w": 3,
        "h": 2,
        "key": "origem",
        "label": "Origem"
      },
      {
        "id": "fsazhul1k",
        "kind": "text",
        "x": 6,
        "y": 0,
        "w": 3,
        "h": 2,
        "key": "altura",
        "label": "Altura"
      },
      {
        "id": "zvattd3hf",
        "kind": "text",
        "x": 9,
        "y": 0,
        "w": 3,
        "h": 2,
        "key": "idade",
        "label": "Idade"
      },
      {
        "id": "yyzpjkhou",
        "kind": "select",
        "x": 6,
        "y": 2,
        "w": 3,
        "h": 2,
        "key": "classe",
        "label": "Classe",
        "options": [
          "Brutamonte",
          "Sagaz",
          "Erudito"
        ],
        "initial": "Brutamonte"
      },
      {
        "id": "6rxo9bpx5",
        "kind": "number",
        "x": 3,
        "y": 2,
        "w": 3,
        "h": 2,
        "key": "nivel",
        "label": "Nível",
        "min": 0,
        "initial": 1,
        "rollable": false
      },
      {
        "id": "042n6molu",
        "kind": "number",
        "x": 9,
        "y": 2,
        "w": 3,
        "h": 2,
        "key": "movimento",
        "label": "Movimento",
        "min": 0,
        "initial": 9,
        "rollable": false
      },
      {
        "id": "6yj5zp918",
        "kind": "computed",
        "x": 10,
        "y": 5,
        "w": 2,
        "h": 2,
        "key": "pontos_de_atributo",
        "label": "Pontos atributo",
        "formula": "floor(@nivel ** 1.2 + 8 - (@agilidade + @forca + @intelecto + @presenca + @vigor))",
        "style": {
          "size": "sm"
        }
      },
      {
        "id": "9pinq5mjl",
        "kind": "computed",
        "x": 9,
        "y": 15,
        "w": 3,
        "h": 2,
        "key": "pontos_de_pericia",
        "label": "Pontos de perícia livres",
        "formula": "if(eq(@classe_n, 1), 6, choose(@classe_n, 6, 6, 9) + @intelecto) * 5 - @pericias_total"
      },
      {
        "id": "idasamc9w",
        "kind": "computed",
        "x": 9,
        "y": 17,
        "w": 3,
        "h": 2,
        "key": "maximo_por_pericia",
        "label": "Máximo por perícia",
        "formula": "if(eq(@nivel, 5), 15, if(gt(@nivel, 2), 10, if(gt(@nivel, 0), 5, 0)))"
      },
      {
        "id": "rk2fxew02",
        "kind": "title",
        "x": 0,
        "y": 4,
        "w": 12,
        "h": 1,
        "content": "Atributos"
      },
      {
        "id": "wf3vmcjg5",
        "kind": "number",
        "x": 0,
        "y": 5,
        "w": 2,
        "h": 2,
        "key": "agilidade",
        "label": "Agilidade",
        "formula": "if(eq(@agilidade, 0), 2d20kl, (@agilidade)d20kh)",
        "min": 0,
        "initial": 1,
        "hint": "Com 0: 2d20 e fica com o menor. Com 1+: um d20 por ponto e fica com o maior."
      },
      {
        "id": "ubtj8xy8a",
        "kind": "number",
        "x": 2,
        "y": 5,
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
        "id": "s0x7z7b26",
        "kind": "number",
        "x": 4,
        "y": 5,
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
        "id": "y30j39pa3",
        "kind": "number",
        "x": 6,
        "y": 5,
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
        "id": "tsp4dmdm9",
        "kind": "number",
        "x": 8,
        "y": 5,
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
        "id": "id8rd633j",
        "kind": "resource",
        "x": 0,
        "y": 8,
        "w": 6,
        "h": 2,
        "key": "pv",
        "label": "PV",
        "formula": "floor(((choose(@classe_n, 15, 11, 8)) + @vigor) * @nivel)",
        "min": 0,
        "initial": 16,
        "style": {
          "accent": "#c0392b"
        }
      },
      {
        "id": "fv5a04c2d",
        "kind": "resource",
        "x": 6,
        "y": 8,
        "w": 6,
        "h": 2,
        "key": "pe",
        "label": "PE",
        "formula": "floor(choose(@classe_n, 5, 8, 8) + ((@presenca * choose(@classe_n, 2, 4, 6)) * @nivel / 2))",
        "min": 0,
        "initial": 6,
        "style": {
          "accent": "#2f80d1"
        }
      },
      {
        "id": "njfneg8cu",
        "kind": "computed",
        "x": 0,
        "y": 12,
        "w": 3,
        "h": 2,
        "key": "defesa",
        "label": "Defesa",
        "formula": "10 + @intelecto + if(@leve, 3, if(@media, 5, if(@pesada, 7, 0))) + if(eq(@classe_n, 2), 2, 0)"
      },
      {
        "id": "cbpc1civd",
        "kind": "computed",
        "x": 3,
        "y": 12,
        "w": 3,
        "h": 2,
        "key": "bloqueio",
        "label": "Bloqueio",
        "formula": "@pericias.fortitude",
        "hint": "0 = sem bloqueio"
      },
      {
        "id": "lc2sf1ced",
        "kind": "computed",
        "x": 6,
        "y": 12,
        "w": 3,
        "h": 2,
        "key": "esquiva",
        "label": "Esquiva",
        "formula": "if(gt(@pericias.reflexos, 0), @defesa + if(@leve, 3, if(@media, 5, if(@pesada, 7, 0))), 0)",
        "hint": "0 = sem esquiva"
      },
      {
        "id": "kay2v1fzk",
        "kind": "computed",
        "x": 9,
        "y": 12,
        "w": 3,
        "h": 2,
        "key": "inventario_maximo",
        "label": "Inventário máximo",
        "formula": "10 + @forca * 2 + @vigor * 2 + (@nivel + 5) - if(@leve, 3, if(@media, 5, if(@pesada, 8, 0))) + @inventario_bonus"
      },
      {
        "id": "920osip8f",
        "kind": "title",
        "x": 0,
        "y": 14,
        "w": 12,
        "h": 1,
        "content": "Perícias"
      },
      {
        "id": "x30ooi1u8",
        "kind": "skills",
        "x": 0,
        "y": 15,
        "w": 9,
        "h": 12,
        "key": "pericias",
        "label": "Perícias",
        "formula": "1d20 + @valor",
        "min": 0,
        "initial": 0,
        "skills": [
          {
            "key": "acrobacia",
            "label": "Acrobacia"
          },
          {
            "key": "adestramento",
            "label": "Adestramento"
          },
          {
            "key": "artes",
            "label": "Artes"
          },
          {
            "key": "atletismo",
            "label": "Atletismo"
          },
          {
            "key": "atualidades",
            "label": "Atualidades"
          },
          {
            "key": "ciencias",
            "label": "Ciências"
          },
          {
            "key": "crime",
            "label": "Crime"
          },
          {
            "key": "diplomacia",
            "label": "Diplomacia"
          },
          {
            "key": "enganacao",
            "label": "Enganação"
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
            "key": "intimidacao",
            "label": "Intimidação"
          },
          {
            "key": "intuicao",
            "label": "Intuição"
          },
          {
            "key": "investigacao",
            "label": "Investigação"
          },
          {
            "key": "luta",
            "label": "Luta"
          },
          {
            "key": "medicina",
            "label": "Medicina"
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
            "key": "pilotagem",
            "label": "Pilotagem"
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
            "key": "sobrevivencia",
            "label": "Sobrevivência"
          },
          {
            "key": "tatica",
            "label": "Tática"
          },
          {
            "key": "tecnologia",
            "label": "Tecnologia"
          },
          {
            "key": "vontade",
            "label": "Vontade"
          }
        ],
        "skillColumns": 2,
        "skillStyle": "number"
      },
      {
        "id": "ahyltldzv",
        "kind": "title",
        "x": 0,
        "y": 7,
        "w": 12,
        "h": 1,
        "content": "Status"
      },
      {
        "id": "729wkk6bc",
        "kind": "resource",
        "x": 0,
        "y": 10,
        "w": 12,
        "h": 2,
        "key": "sanidade",
        "label": "sanidade",
        "min": 0,
        "initial": 100,
        "style": {
          "accent": "#650a8f"
        }
      }
    ]
  },
  {
    "id": "rcwy2axmk",
    "title": "Combate e itens",
    "components": [
      {
        "id": "yk69f01d6",
        "kind": "title",
        "x": 0,
        "y": 0,
        "w": 12,
        "h": 1,
        "content": "Armadura"
      },
      {
        "id": "hhhbcsoki",
        "kind": "checkbox",
        "x": 0,
        "y": 1,
        "w": 4,
        "h": 1,
        "key": "leve",
        "label": "Leve"
      },
      {
        "id": "v5i9stqe8",
        "kind": "checkbox",
        "x": 4,
        "y": 1,
        "w": 4,
        "h": 1,
        "key": "media",
        "label": "Média"
      },
      {
        "id": "j8f2e5nlx",
        "kind": "checkbox",
        "x": 8,
        "y": 1,
        "w": 4,
        "h": 1,
        "key": "pesada",
        "label": "Pesada"
      },
      {
        "id": "3v6pdyro5",
        "kind": "checkbox",
        "x": 0,
        "y": 2,
        "w": 4,
        "h": 1,
        "key": "encantada",
        "label": "Encantada"
      },
      {
        "id": "yg2hykwrj",
        "kind": "checkbox",
        "x": 4,
        "y": 2,
        "w": 4,
        "h": 1,
        "key": "reforcada",
        "label": "Reforçada"
      },
      {
        "id": "chouwbiz9",
        "kind": "checkbox",
        "x": 8,
        "y": 2,
        "w": 4,
        "h": 1,
        "key": "espinhos",
        "label": "Espinhos 2"
      },
      {
        "id": "ontk104mo",
        "kind": "computed",
        "x": 0,
        "y": 3,
        "w": 4,
        "h": 2,
        "key": "def_da_armadura",
        "label": "DEF da armadura",
        "formula": "if(@leve, 3, if(@media, 5, if(@pesada, 7, 0)))"
      },
      {
        "id": "5s2hvjlir",
        "kind": "computed",
        "x": 4,
        "y": 3,
        "w": 4,
        "h": 2,
        "key": "rdm",
        "label": "RDF",
        "formula": "if(@reforcada, 3, 0) + if(@pesada, 2, 0) + @rdm_bonus"
      },
      {
        "id": "50m8duvzr",
        "kind": "computed",
        "x": 8,
        "y": 3,
        "w": 4,
        "h": 2,
        "key": "rdf",
        "label": "RDM",
        "formula": "if(@encantada, 3, 0) + if(@leve, 1, 0) + @rdf_bonus"
      },
      {
        "id": "y0d8n3z4c",
        "kind": "title",
        "x": 0,
        "y": 5,
        "w": 12,
        "h": 1,
        "content": "Habilidades: dano e DT"
      },
      {
        "id": "p9spv6sbr",
        "kind": "computed",
        "x": 0,
        "y": 6,
        "w": 2,
        "h": 2,
        "key": "milagres_dano",
        "label": "Milagres: dano",
        "formula": "floor(@presenca * 1.5)"
      },
      {
        "id": "rfkbkk3ww",
        "kind": "computed",
        "x": 2,
        "y": 6,
        "w": 2,
        "h": 2,
        "key": "milagres_dt",
        "label": "Milagres: DT",
        "formula": "@presenca * 5 + 5"
      },
      {
        "id": "ga755gi5g",
        "kind": "computed",
        "x": 4,
        "y": 6,
        "w": 2,
        "h": 2,
        "key": "arcanismo_dano",
        "label": "Arcan: dano",
        "formula": "@intelecto * 2"
      },
      {
        "id": "2fxbmg42h",
        "kind": "computed",
        "x": 6,
        "y": 6,
        "w": 2,
        "h": 2,
        "key": "arcanismo_dt",
        "label": "Arcanismo: DT",
        "formula": "@presenca * 5 + 10"
      },
      {
        "id": "f9k118g3u",
        "kind": "computed",
        "x": 8,
        "y": 6,
        "w": 2,
        "h": 2,
        "key": "magias_ocultas_dano",
        "label": "dark: dano",
        "formula": "floor(@intelecto * 3.5)"
      },
      {
        "id": "toneektwa",
        "kind": "computed",
        "x": 10,
        "y": 6,
        "w": 2,
        "h": 2,
        "key": "magias_ocultas_dt",
        "label": "dark: DT",
        "formula": "floor(@presenca * 3 + 10)"
      },
      {
        "id": "ae3nnwt4i",
        "kind": "title",
        "x": 0,
        "y": 8,
        "w": 12,
        "h": 1,
        "content": "Arma equipada"
      },
      {
        "id": "5f31w86ou",
        "kind": "checkbox",
        "x": 0,
        "y": 9,
        "w": 3,
        "h": 1,
        "key": "arma_luta",
        "label": "Luta",
        "hint": "Perícia somada ao teste de acerto"
      },
      {
        "id": "0zx0g4gyl",
        "kind": "checkbox",
        "x": 3,
        "y": 9,
        "w": 3,
        "h": 1,
        "key": "arma_pontaria",
        "label": "Pontaria",
        "hint": "Perícia somada ao teste de acerto"
      },
      {
        "id": "kz4b07kwg",
        "kind": "checkbox",
        "x": 6,
        "y": 9,
        "w": 3,
        "h": 1,
        "key": "arma_ocultismo",
        "label": "Ocultismo",
        "hint": "Perícia somada ao teste de acerto"
      },
      {
        "id": "ecq7wjfh5",
        "kind": "checkbox",
        "x": 9,
        "y": 9,
        "w": 3,
        "h": 1,
        "key": "arma_religiao",
        "label": "Religião",
        "hint": "Perícia somada ao teste de acerto"
      },
      {
        "id": "potn1vnbq",
        "kind": "checkbox",
        "x": 0,
        "y": 11,
        "w": 4,
        "h": 1,
        "key": "encantado",
        "label": "Encantado"
      },
      {
        "id": "xgd8ptl5b",
        "kind": "checkbox",
        "x": 4,
        "y": 11,
        "w": 4,
        "h": 1,
        "key": "afiado",
        "label": "Afiado"
      },
      {
        "id": "6b0dv4wpz",
        "kind": "checkbox",
        "x": 8,
        "y": 11,
        "w": 4,
        "h": 1,
        "key": "pesado",
        "label": "Pesado"
      },
      {
        "id": "39r4274gb",
        "kind": "select",
        "x": 0,
        "y": 12,
        "w": 3,
        "h": 2,
        "key": "atributo_da_arma",
        "label": "Atributo do teste",
        "options": [
          "Força",
          "Agilidade",
          "Intelecto"
        ],
        "initial": "Força"
      },
      {
        "id": "qtd2m0m5w",
        "kind": "select",
        "x": 3,
        "y": 12,
        "w": 3,
        "h": 2,
        "key": "alcance",
        "label": "Alcance",
        "options": [
          "1 m",
          "6 m",
          "9 m",
          "12 m"
        ],
        "initial": "1 m"
      },
      {
        "id": "ask16pfcf",
        "kind": "text",
        "x": 6,
        "y": 12,
        "w": 3,
        "h": 2,
        "key": "dano_da_arma",
        "label": "Dano da arma",
        "initial": "1d6",
        "hint": "Ex.: 1d8"
      },
      {
        "id": "kwseeoymg",
        "kind": "number",
        "x": 9,
        "y": 12,
        "w": 3,
        "h": 2,
        "key": "dano_fixo",
        "label": "Dano fixo",
        "initial": 0,
        "rollable": false
      },
      {
        "id": "vqvkg5wbs",
        "kind": "computed",
        "x": 0,
        "y": 14,
        "w": 3,
        "h": 2,
        "key": "dados_do_teste",
        "label": "Dados do teste",
        "formula": "choose(@atributo_da_arma_n, @forca, @agilidade, @intelecto) + @dados_extras_de_teste"
      },
      {
        "id": "sjdk901k7",
        "kind": "computed",
        "x": 3,
        "y": 14,
        "w": 3,
        "h": 2,
        "key": "bonus_de_acerto",
        "label": "Bônus de acerto",
        "formula": "if(@arma_luta, @pericias.luta, 0) + if(@arma_pontaria, @pericias.pontaria, 0) + if(@arma_ocultismo, @pericias.ocultismo, 0) + if(@arma_religiao, @pericias.religiao, 0)"
      },
      {
        "id": "vl3ungcoq",
        "kind": "roll",
        "x": 6,
        "y": 14,
        "w": 3,
        "h": 2,
        "label": "Teste de acerto",
        "formula": "if(eq(@dados_do_teste, 0), 2d20kl, (@dados_do_teste)d20kh) + @bonus_de_acerto"
      },
      {
        "id": "qcqxe26x1",
        "kind": "roll",
        "x": 9,
        "y": 14,
        "w": 3,
        "h": 2,
        "label": "Dano",
        "formula": "@dano_da_arma + @dano_fixo + @dano_extra"
      },
      {
        "id": "lheewcdd1",
        "kind": "title",
        "x": 0,
        "y": 16,
        "w": 12,
        "h": 1,
        "content": "Bônus"
      },
      {
        "id": "2h7c5fqw8",
        "kind": "number",
        "x": 0,
        "y": 17,
        "w": 4,
        "h": 2,
        "key": "dados_extras_de_dano",
        "label": "Dados extras de dano",
        "initial": 0,
        "rollable": false
      },
      {
        "id": "b12197ll1",
        "kind": "number",
        "x": 4,
        "y": 17,
        "w": 4,
        "h": 2,
        "key": "dados_extras_de_teste",
        "label": "Dados extras de teste",
        "initial": 0,
        "rollable": false
      },
      {
        "id": "vfvd04t6v",
        "kind": "number",
        "x": 8,
        "y": 17,
        "w": 4,
        "h": 2,
        "key": "dano_extra",
        "label": "Dano extra",
        "initial": 0,
        "rollable": false
      },
      {
        "id": "xpn70j0t5",
        "kind": "number",
        "x": 0,
        "y": 19,
        "w": 4,
        "h": 2,
        "key": "rdf_bonus",
        "label": "RDF bônus",
        "initial": 0,
        "rollable": false
      },
      {
        "id": "0cfppaan2",
        "kind": "number",
        "x": 4,
        "y": 19,
        "w": 4,
        "h": 2,
        "key": "rdm_bonus",
        "label": "RDM bônus",
        "initial": 0,
        "rollable": false
      },
      {
        "id": "n6bpzrl8x",
        "kind": "number",
        "x": 8,
        "y": 19,
        "w": 4,
        "h": 2,
        "key": "inventario_bonus",
        "label": "Inventário bônus",
        "initial": 0,
        "rollable": false
      },
      {
        "id": "172lhuhkj",
        "kind": "title",
        "x": 0,
        "y": 21,
        "w": 12,
        "h": 1,
        "content": "Inventário"
      },
      {
        "id": "v3sbxoaai",
        "kind": "list",
        "x": 0,
        "y": 22,
        "w": 8,
        "h": 7,
        "key": "inventario",
        "label": "Inventário",
        "columns": [
          {
            "key": "item",
            "label": "Item",
            "type": "text"
          },
          {
            "key": "espaco",
            "label": "Espaço",
            "type": "number"
          }
        ]
      },
      {
        "id": "sr1dpstqv",
        "kind": "list",
        "x": 8,
        "y": 22,
        "w": 4,
        "h": 7,
        "key": "itens_especiais",
        "label": "Itens especiais",
        "columns": [
          {
            "key": "nome",
            "label": "Nome do item",
            "type": "text"
          },
          {
            "key": "valor",
            "label": "Valor",
            "type": "number"
          }
        ]
      },
      {
        "id": "wf74anp34",
        "kind": "longtext",
        "x": 0,
        "y": 29,
        "w": 12,
        "h": 5,
        "key": "notas",
        "label": "Notas"
      },
      {
        "id": "rhw15n28h",
        "kind": "title",
        "x": 0,
        "y": 10,
        "w": 12,
        "h": 1,
        "content": "melhorias"
      }
    ]
  }
] as SheetPage[];
