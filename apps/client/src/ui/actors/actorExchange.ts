import { DialogV2 } from "@tabbletop/api";
import {
  ACTOR_EXCHANGE_FORMAT,
  MAX_ACTOR_EXCHANGE_FILE_BYTES,
  SHEET_EXCHANGE_FORMAT,
  type ActorExchangeFile,
  type ActorRole,
  type ExportedActorData,
} from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { actorRole, LAYOUT_FLAG_KEY, MIMICDICE_FLAG_SCOPE, ROLE_FLAG_KEY, ROLE_PRESENTATION } from "./actorRoles";

function fileNameFor(title: string, suffix = "ficha"): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "personagem"}.${suffix}.mimicdice.json`;
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = h("a", { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function stripDocumentIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDocumentIds);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === "_id") continue;
      out[key] = stripDocumentIds(nested);
    }
    return out;
  }
  return value;
}

/** Prepares actor data for export, stripping internal database IDs so they can be imported cleanly anywhere. */
export function serializeActorData(actor: any): ExportedActorData {
  const raw = typeof actor.toObject === "function" ? actor.toObject() : actor;
  const stripped = stripDocumentIds(foundry.utils.deepClone(raw)) as Record<string, unknown>;

  const name = String(stripped.name ?? actor.name ?? "Personagem").trim() || "Personagem";
  const type = String(stripped.type ?? actor.type ?? "character");
  const img = typeof stripped.img === "string" ? stripped.img : typeof actor.img === "string" ? actor.img : undefined;
  const system = (stripped.system && typeof stripped.system === "object" ? stripped.system : {}) as Record<string, unknown>;
  const items = Array.isArray(stripped.items) ? (stripped.items as Record<string, unknown>[]) : [];
  const effects = Array.isArray(stripped.effects) ? (stripped.effects as Record<string, unknown>[]) : [];
  const flags = (stripped.flags && typeof stripped.flags === "object" ? stripped.flags : {}) as Record<string, unknown>;
  const prototypeToken = (stripped.prototypeToken && typeof stripped.prototypeToken === "object" ? stripped.prototypeToken : undefined) as Record<string, unknown> | undefined;

  // Ensure role and layout flags are included
  const explicitRole =
    (stripped.flags as Record<string, any>)?.[MIMICDICE_FLAG_SCOPE]?.[ROLE_FLAG_KEY] ??
    actor.flags?.[MIMICDICE_FLAG_SCOPE]?.[ROLE_FLAG_KEY] ??
    (typeof actor.getFlag === "function" ? actor.getFlag(MIMICDICE_FLAG_SCOPE, ROLE_FLAG_KEY) : undefined);
  const role: ActorRole =
    typeof explicitRole === "string" && ["player", "ally", "enemy", "neutral"].includes(explicitRole)
      ? (explicitRole as ActorRole)
      : typeof (globalThis as any).game?.users?.contents !== "undefined"
      ? actorRole(actor)
      : "player";

  const mimicdiceFlags = ((flags[MIMICDICE_FLAG_SCOPE] as Record<string, unknown>) ?? {});
  if (!mimicdiceFlags[ROLE_FLAG_KEY]) mimicdiceFlags[ROLE_FLAG_KEY] = role;
  if (!mimicdiceFlags[LAYOUT_FLAG_KEY] && actor.flags?.[MIMICDICE_FLAG_SCOPE]?.[LAYOUT_FLAG_KEY]) {
    mimicdiceFlags[LAYOUT_FLAG_KEY] = actor.flags[MIMICDICE_FLAG_SCOPE][LAYOUT_FLAG_KEY];
  }
  flags[MIMICDICE_FLAG_SCOPE] = mimicdiceFlags;

  return {
    name,
    type,
    ...(img ? { img } : {}),
    system,
    items,
    effects,
    flags,
    ...(prototypeToken ? { prototypeToken } : {}),
  };
}

/** Saves a ready character sheet with all attributes, values, items, token and layout to share across tables. */
export function exportReadyActor(actor: any): void {
  const actorData = serializeActorData(actor);
  const exchange: ActorExchangeFile = {
    format: ACTOR_EXCHANGE_FORMAT,
    version: 1,
    title: actorData.name,
    exportedAt: Date.now(),
    actor: actorData,
  };
  const filename = fileNameFor(actorData.name, "ficha");
  downloadJson(exchange, filename);
  ui.notifications.info(`Ficha pronta de "${actorData.name}" exportada. Envie o arquivo para usar em outras mesas.`);
}

/** Exports several ready characters into one bundle file. */
export function exportMultipleReadyActors(actors: any[], groupName = "Personagens"): void {
  const actorList = actors.map(serializeActorData);
  if (actorList.length === 0) {
    ui.notifications.warn("Nenhum personagem selecionado para exportar.");
    return;
  }
  const exchange: ActorExchangeFile = {
    format: ACTOR_EXCHANGE_FORMAT,
    version: 1,
    title: groupName,
    exportedAt: Date.now(),
    actors: actorList,
  };
  const filename = fileNameFor(groupName, "fichas");
  downloadJson(exchange, filename);
  ui.notifications.info(`${actorList.length} ficha(s) pronta(s) exportada(s) em "${filename}".`);
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept: ".json,application/json" });
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

export function parseExportedActorPayload(parsedJson: any): ExportedActorData[] {
  if (!parsedJson || typeof parsedJson !== "object") throw new Error("Esse arquivo não é um JSON válido.");

  // Case 1: mimicdice-actor bundle with multiple actors
  if (parsedJson.format === ACTOR_EXCHANGE_FORMAT && Array.isArray(parsedJson.actors) && parsedJson.actors.length > 0) {
    return parsedJson.actors.map((entry: any) => serializeActorData(entry));
  }

  // Case 2: mimicdice-actor single actor
  if (parsedJson.format === ACTOR_EXCHANGE_FORMAT && parsedJson.actor && typeof parsedJson.actor === "object") {
    return [serializeActorData(parsedJson.actor)];
  }

  // Case 3: Raw Actor export (e.g. from Foundry export or direct actor JSON)
  if (typeof parsedJson.name === "string" && (parsedJson.system || parsedJson.type || parsedJson.prototypeToken)) {
    return [serializeActorData(parsedJson)];
  }

  // Case 4: Array of raw actors
  if (Array.isArray(parsedJson) && parsedJson.length > 0 && typeof parsedJson[0]?.name === "string") {
    return parsedJson.map((entry: any) => serializeActorData(entry));
  }

  if (parsedJson.format === SHEET_EXCHANGE_FORMAT) {
    throw new Error("Esse arquivo contém modelos de layout (templates), não uma ficha pronta com dados. Use o botão 'Importar fichas'.");
  }

  throw new Error("Esse arquivo não foi reconhecido como uma ficha pronta de personagem do MimicDice.");
}

async function confirmImportDialog(actors: ExportedActorData[], targetActor?: any): Promise<{ action: "create" | "overwrite"; role?: ActorRole } | null> {
  const isGM = game.user.isGM;
  const isSingle = actors.length === 1;
  const first = actors[0];
  const role = ((first?.flags?.[MIMICDICE_FLAG_SCOPE] as Record<string, unknown>)?.[ROLE_FLAG_KEY] as ActorRole) ?? "player";

  const roleSelect = h(
    "select",
    { name: "role", "aria-label": "Tipo de ator" },
    ...(["player", "ally", "enemy", "neutral"] as ActorRole[]).map((r) =>
      h("option", { value: r, selected: r === role }, ROLE_PRESENTATION[r].label)
    )
  );

  const actorPreview = actors.map((act) => {
    const actRole = ((act.flags?.[MIMICDICE_FLAG_SCOPE] as Record<string, unknown>)?.[ROLE_FLAG_KEY] as ActorRole) ?? "player";
    return h(
      "li",
      { class: "md-import-preview-item" },
      act.img ? h("img", { src: act.img, class: "thumbnail", alt: "" }) : h("i", { class: "fa-solid fa-user thumbnail" }),
      h("div", { class: "info" },
        h("strong", {}, act.name),
        h("span", { class: "hint" }, `${ROLE_PRESENTATION[actRole].label} · ${act.items.length} item(ns)`)
      )
    );
  });

  const content = h(
    "div",
    { class: "md-import-ready-dialog" },
    h("p", {}, isSingle ? "Importar este personagem para a mesa:" : `Importar ${actors.length} personagens para a mesa:`),
    h("ul", { class: "md-import-list" }, ...actorPreview),
    isGM && isSingle && !targetActor ? h("label", { class: "form-group md-dialog-group" }, h("span", {}, "Categoria / Papel"), roleSelect) : null,
    targetActor
      ? h("p", { class: "hint" }, `Você pode substituir os dados da ficha aberta ("${targetActor.name}") ou criar um novo personagem independente.`)
      : h("p", { class: "hint" }, isGM ? "O personagem virá pronto com atributos, perícias, itens e visual." : "O personagem será adicionado à sua lista pronto para jogar.")
  );

  const buttons: any[] = [];
  if (targetActor && isSingle) {
    buttons.push(
      { action: "overwrite", label: "Substituir dados desta ficha", icon: "fa-solid fa-pen-to-square", callback: () => "overwrite" },
      { action: "create", label: "Criar novo personagem", icon: "fa-solid fa-plus", default: true, callback: () => "create" },
      { action: "cancel", label: "Cancelar", icon: "fa-solid fa-xmark", callback: () => null }
    );
  } else {
    buttons.push(
      { action: "create", label: "Importar", icon: "fa-solid fa-file-import", default: true, callback: () => "create" },
      { action: "cancel", label: "Cancelar", icon: "fa-solid fa-xmark", callback: () => null }
    );
  }

  const result = await DialogV2.wait({
    window: { title: isSingle ? "Importar Ficha Pronta" : "Importar Fichas Prontas" },
    content,
    buttons,
  });

  if (!result || result === "cancel") return null;
  return { action: result as "create" | "overwrite", role: roleSelect.value as ActorRole };
}

/** Prompts for a .mimicdice.json character file, validates it, and creates or updates the character in the world. */
export async function importReadyActorDialog(targetActor?: any): Promise<any[]> {
  const file = await pickFile();
  if (!file) return [];
  if (file.size > MAX_ACTOR_EXCHANGE_FILE_BYTES) {
    ui.notifications.error("Arquivo grande demais (máx. 10 MB).");
    return [];
  }

  let actors: ExportedActorData[];
  try {
    const raw = JSON.parse(await file.text());
    actors = parseExportedActorPayload(raw);
  } catch (error) {
    ui.notifications.error(error instanceof Error ? error.message : "Não foi possível ler o arquivo.");
    return [];
  }

  const choice = await confirmImportDialog(actors, targetActor);
  if (!choice) return [];

  const ActorClass = CONFIG.Actor.documentClass;

  // Overwrite existing sheet
  if (choice.action === "overwrite" && targetActor && actors[0]) {
    const data = actors[0];
    const updatePayload: Record<string, unknown> = {
      name: data.name,
      system: data.system,
      flags: data.flags,
    };
    if (data.img) updatePayload.img = data.img;
    if (data.prototypeToken) updatePayload.prototypeToken = data.prototypeToken;

    // Delete existing items and recreate
    if (targetActor.items?.size) {
      await targetActor.deleteEmbeddedDocuments("Item", Array.from(targetActor.items.keys()));
    }
    await targetActor.update(updatePayload);
    if (data.items.length > 0) {
      await targetActor.createEmbeddedDocuments("Item", data.items);
    }
    ui.notifications.info(`Ficha de "${targetActor.name}" atualizada com os dados importados.`);
    targetActor.sheet?.render(true);
    return [targetActor];
  }

  // Create new actor(s)
  const isGM = game.user.isGM;
  const currentUserId = game.user.id;
  const createdActors: any[] = [];

  for (const data of actors) {
    const actorSource = foundry.utils.deepClone(data) as Record<string, unknown>;

    // Permission and ownership assignment
    if (!isGM) {
      actorSource.ownership = { default: 0, [currentUserId]: 3 };
      const flags = (actorSource.flags as Record<string, unknown>) ?? {};
      const mimicdice = (flags[MIMICDICE_FLAG_SCOPE] as Record<string, unknown>) ?? {};
      mimicdice[ROLE_FLAG_KEY] = "player";
      flags[MIMICDICE_FLAG_SCOPE] = mimicdice;
      actorSource.flags = flags;
    } else if (choice.role && actors.length === 1) {
      const flags = (actorSource.flags as Record<string, unknown>) ?? {};
      const mimicdice = (flags[MIMICDICE_FLAG_SCOPE] as Record<string, unknown>) ?? {};
      mimicdice[ROLE_FLAG_KEY] = choice.role;
      flags[MIMICDICE_FLAG_SCOPE] = mimicdice;
      actorSource.flags = flags;
    }

    const created = await ActorClass.createDocuments([actorSource]);
    if (created?.[0]) {
      createdActors.push(created[0]);
      // If player has no assigned character, link it
      if (!isGM && !game.user.character) {
        await game.user.update({ character: created[0].id });
      }
    }
  }

  if (createdActors.length === 1) {
    ui.notifications.info(`Personagem "${createdActors[0].name}" importado com sucesso!`);
    createdActors[0].sheet?.render(true);
  } else if (createdActors.length > 1) {
    ui.notifications.info(`${createdActors.length} personagens importados com sucesso!`);
  }

  return createdActors;
}
