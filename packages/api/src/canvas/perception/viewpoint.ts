import { currentCanvas, currentGame } from "../../runtime";
import type { Token } from "../placeables/Token";

/** The token whose eyes the GM is borrowing ("Controlar boneco"), if any. */
export function puppetToken(): Token | null {
  return (currentCanvas()?.tokens?.puppet as Token | null | undefined) ?? null;
}

/** The GM sees hidden things, every token and every wall, unless they are looking through a puppet's eyes. */
export function seesEverything(): boolean {
  return currentGame()?.user?.isGM === true && puppetToken() === null;
}
