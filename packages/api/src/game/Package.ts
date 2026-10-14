import type { PackageRecord, PackageType } from "@tabbletop/protocol";

/** Exposes manifest fields directly on the instance, as add-ons read e.g. game.modules.get(id).flags. */
export class BasePackage {
  readonly id: string;
  readonly type: PackageType;
  readonly title: string;
  readonly version: string;
  readonly description: string;
  readonly esmodules: Set<string>;
  readonly scripts: Set<string>;
  readonly styles: Set<string>;
  readonly languages: Set<PackageRecord["languages"][number]>;
  active: boolean;
  api?: unknown;
  [manifestField: string]: unknown;

  constructor(record: PackageRecord) {
    for (const [field, value] of Object.entries(record.manifestData)) {
      if (!(field in BasePackage.prototype)) this[field] = value;
    }
    this.id = record.id;
    this.type = record.type;
    this.title = record.title;
    this.version = record.version;
    this.description = record.description;
    this.esmodules = new Set(record.esmodules);
    this.scripts = new Set(record.scripts);
    this.styles = new Set(record.styles);
    this.languages = new Set(record.languages);
    this.active = record.active;
  }

  get name(): string {
    return this.id;
  }

  get data(): this {
    return this;
  }
}

export class Module extends BasePackage {}

export class System extends BasePackage {}

export class World {
  constructor(
    readonly id: string,
    readonly title: string,
    readonly description: string,
    readonly system: string | null,
    readonly coreVersion: string,
  ) {}

  get type(): "world" {
    return "world";
  }
}
