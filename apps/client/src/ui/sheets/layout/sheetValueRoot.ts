export type SheetValueRoot = "system" | "system.props" | "flags.world.sheetValues";

const FREE_FORM_PROPS_FIELD = "props";

/**
 * Systems with a strict data model drop unknown `system` keys, so layout values must live where they survive:
 * free-form `system` (no model), the model's open `props` object (Custom System Builder style), or actor flags.
 */
export function valueRootForSchema(schemaFieldNames: readonly string[] | null): SheetValueRoot {
  if (schemaFieldNames === null) return "system";
  return schemaFieldNames.includes(FREE_FORM_PROPS_FIELD) ? "system.props" : "flags.world.sheetValues";
}

/** Nests `values` under the root path, e.g. "system.props" gives `{ system: { props: values } }` for a document source. */
export function nestUnderRoot(root: SheetValueRoot, values: Record<string, unknown>): Record<string, unknown> {
  return root.split(".").reduceRight<Record<string, unknown>>((inner, part) => ({ [part]: inner }), values);
}

function schemaFieldNamesFor(actorType: string): string[] | null {
  const fields = CONFIG.Actor.dataModels?.[actorType]?.schema?.fields;
  return fields && typeof fields === "object" ? Object.keys(fields) : null;
}

export function valueRootForActorType(actorType: string): SheetValueRoot {
  return valueRootForSchema(schemaFieldNamesFor(actorType));
}

/** Nests values under the root for a new document's source, e.g. "system.props" gives `{ system: { props: values } }`. */
export function sourceAtRoot(root: SheetValueRoot, values: Record<string, unknown>): Record<string, unknown> {
  return root.split(".").reduceRight<Record<string, unknown>>((inner, part) => ({ [part]: inner }), values);
}

function readPath(source: unknown, path: string): unknown {
  let current = source;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Where one actor's layout values are read from and written to. */
export class SheetValueStore {
  readonly root: SheetValueRoot;

  constructor(private readonly actor: any) {
    this.root = valueRootForActorType(actor.type);
  }

  pathOf(key: string): string {
    return `${this.root}.${key}`;
  }

  values(): Record<string, unknown> {
    const stored = readPath(this.actor._source, this.root);
    return stored !== null && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  }

  read(key: string): unknown {
    return this.values()[key];
  }

  /** Values in flags are invisible to the system's own roll data, so sheet rolls add them for `@key` references. */
  extraRollData(): Record<string, unknown> {
    return this.root.startsWith("flags.") ? { ...this.values() } : {};
  }
}
