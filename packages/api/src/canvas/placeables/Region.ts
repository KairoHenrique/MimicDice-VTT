import * as PIXI from "pixi.js";
import { PlaceableObject } from "./PlaceableObject";

/** Mesh that fills a region's area. Regions are not editable in Tabbletop yet; the class exists for type checks. */
export class RegionMesh extends PIXI.Container {
  readonly region: Region;

  constructor(region: Region) {
    super();
    this.region = region;
  }
}

/** Placeholder for v13 scene regions: packages may reference the class and its embedded name. */
export class Region extends PlaceableObject {
  static override embeddedName = "Region";

  protected override async _draw(): Promise<void> {}

  protected override _refresh(): void {}
}
