import { CanvasHud } from "@tabbletop/api";
import { PointOfInterestConfigDialog, configurePointOfInterest } from "./PointOfInterestConfigDialog";
import { PointOfInterestViewer } from "./PointOfInterestViewer";

export { PointOfInterestConfigDialog, PointOfInterestViewer, configurePointOfInterest };

/** Backwards-compatible alias for PointOfInterestViewer. */
export const NoteViewer = PointOfInterestViewer;

export function installNoteViewer(): void {
  CanvasHud.noteConfigHandler = (note: any, initial: Record<string, unknown>) => configurePointOfInterest(note, initial);

  Hooks.on("activateNote", (note: any) => {
    void new PointOfInterestViewer(note).render({ force: true });
    return false;
  });
}
