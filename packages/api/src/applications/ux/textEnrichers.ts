import { fromUuidSync } from "../../documents/abstract/ClientDatabaseBackend";
import { currentConfig, currentGame, globalScope } from "../../runtime";

export interface EnrichmentOptions {
  secrets?: boolean;
  documents?: boolean;
  links?: boolean;
  rolls?: boolean;
  embeds?: boolean;
  custom?: boolean;
  rollData?: object | (() => object);
  relativeTo?: unknown;
  [extra: string]: unknown;
}

export interface TextEnricherConfig {
  id?: string;
  pattern: RegExp;
  enricher: (match: RegExpMatchArray, options: EnrichmentOptions) => HTMLElement | null | Promise<HTMLElement | null>;
  replaceParent?: boolean;
}

const DOCUMENT_ICONS: Readonly<Record<string, string>> = {
  Actor: "fa-solid fa-user",
  Item: "fa-solid fa-suitcase",
  JournalEntry: "fa-solid fa-book-open",
  JournalEntryPage: "fa-solid fa-file-lines",
  Scene: "fa-solid fa-map",
  RollTable: "fa-solid fa-table-list",
  Macro: "fa-solid fa-code",
};
const COLLECTION_DOCUMENT_TYPES = ["Actor", "Item", "JournalEntry", "Scene", "RollTable", "Macro"];
const ROLL_COMMAND_MODES: Readonly<Record<string, string>> = {
  r: "roll", roll: "roll",
  gmr: "gmroll", gmroll: "gmroll",
  br: "blindroll", broll: "blindroll", blindroll: "blindroll",
  sr: "selfroll", selfroll: "selfroll",
  pr: "publicroll", publicroll: "publicroll",
};

function anchor(classNames: string, icon: string, label: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = classNames;
  const iconElement = document.createElement("i");
  iconElement.className = icon;
  link.append(iconElement, document.createTextNode(label));
  return link;
}

function resolveLinkedDocument(type: string, target: string): any {
  if (type === "UUID") return fromUuidSync(target);
  const collection = currentGame()?.collections?.get?.(type);
  return collection?.get?.(target) ?? collection?.getName?.(target) ?? fromUuidSync(`${type}.${target}`);
}

function buildContentLink(match: RegExpMatchArray): HTMLElement {
  const [, type = "UUID", target = "", explicitLabel] = match;
  const linked = resolveLinkedDocument(type, target);
  if (!linked) {
    const broken = anchor("content-link broken", "fa-solid fa-link-slash", explicitLabel ?? target);
    broken.dataset.tooltip = "Documento não encontrado";
    return broken;
  }
  const documentName = String(linked.documentName ?? type);
  const icon = currentConfig()?.[documentName]?.sidebarIcon ?? DOCUMENT_ICONS[documentName] ?? "fa-solid fa-file";
  const link = anchor("content-link", icon, explicitLabel ?? String(linked.name ?? target));
  link.draggable = true;
  link.dataset.link = "";
  link.dataset.uuid = String(linked.uuid ?? target);
  link.dataset.id = String(linked.id ?? "");
  link.dataset.type = documentName;
  return link;
}

function resolveRollData(options: EnrichmentOptions): object {
  const rollData = typeof options.rollData === "function" ? options.rollData() : options.rollData;
  return (rollData as object | undefined) ?? (options.relativeTo as { getRollData?: () => object } | undefined)?.getRollData?.() ?? {};
}

async function buildInlineRoll(match: RegExpMatchArray, options: EnrichmentOptions): Promise<HTMLElement | null> {
  const [, command, formulaText = "", label] = match;
  const formula = formulaText.trim();
  if (!formula) return null;
  const RollClass = currentConfig()?.Dice?.rolls?.[0] ?? globalScope.Roll;
  if (command) {
    const mode = ROLL_COMMAND_MODES[command.trim().slice(1).toLowerCase()] ?? "roll";
    const deferred = anchor("inline-roll roll", "fa-solid fa-dice-d20", label ?? formula);
    deferred.dataset.mode = mode;
    deferred.dataset.formula = formula;
    deferred.dataset.tooltip = formula;
    return deferred;
  }
  try {
    const roll = await new RollClass(formula, resolveRollData(options)).evaluate({ allowInteractive: false });
    const result = anchor("inline-roll inline-result", "fa-solid fa-dice-d20", label ? `${label}: ${roll.total}` : String(roll.total));
    result.dataset.roll = encodeURIComponent(JSON.stringify(roll.toJSON()));
    result.dataset.tooltip = `${roll.formula} = ${roll.result ?? roll.total}`;
    return result;
  } catch {
    return null;
  }
}

function buildHyperlink(match: RegExpMatchArray): HTMLElement {
  const link = document.createElement("a");
  link.className = "hyperlink";
  link.href = match[0];
  link.target = "_blank";
  link.rel = "nofollow noopener noreferrer";
  link.textContent = match[0];
  return link;
}

const documentLinkTypes = ["UUID", ...COLLECTION_DOCUMENT_TYPES, "JournalEntryPage"].join("|");

export const CORE_ENRICHERS: Readonly<Record<"documents" | "rolls" | "links", TextEnricherConfig>> = {
  documents: { id: "documents", pattern: new RegExp(`@(${documentLinkTypes})\\[([^\\]]+)\\](?:\\{([^}]+)\\})?`, "g"), enricher: buildContentLink },
  rolls: { id: "rolls", pattern: /\[\[(\/[a-zA-Z]+\s+)?([^[\]]+?)\]\](?:\{([^}]+)\})?/g, enricher: buildInlineRoll },
  links: { id: "links", pattern: /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g, enricher: buildHyperlink },
};

const SKIPPED_ANCESTORS = "a, code, pre, script, style, textarea";

function collectTextNodes(root: DocumentFragment): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest(SKIPPED_ANCESTORS)) nodes.push(node as Text);
  }
  return nodes;
}

async function enrichTextNode(node: Text, enricher: TextEnricherConfig, options: EnrichmentOptions): Promise<void> {
  const text = node.textContent ?? "";
  const pattern = new RegExp(enricher.pattern.source, enricher.pattern.flags.includes("g") ? enricher.pattern.flags : `${enricher.pattern.flags}g`);
  const matches = Array.from(text.matchAll(pattern));
  if (matches.length === 0) return;
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  let replacedAny = false;
  for (const match of matches) {
    const replacement = await enricher.enricher(match, options);
    if (!replacement) continue;
    const start = match.index ?? 0;
    fragment.append(document.createTextNode(text.slice(cursor, start)), replacement);
    cursor = start + match[0].length;
    replacedAny = true;
  }
  if (!replacedAny) return;
  fragment.append(document.createTextNode(text.slice(cursor)));
  const parent = node.parentElement;
  if (enricher.replaceParent && parent && parent.childNodes.length === 1) parent.replaceWith(fragment);
  else node.replaceWith(fragment);
}

export async function applyEnricher(root: DocumentFragment, enricher: TextEnricherConfig, options: EnrichmentOptions): Promise<void> {
  for (const node of collectTextNodes(root)) {
    try {
      await enrichTextNode(node, enricher, options);
    } catch (error) {
      console.error(`TextEditor | Falha no enriquecedor ${enricher.id ?? enricher.pattern}`, error);
    }
  }
}
