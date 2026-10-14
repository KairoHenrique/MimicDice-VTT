import { isGmEditMode, isMapLocked } from "../../game/tableControls";
import { toggleLayersPanel } from "../layers/LayersPanel";
import { drawingColorTool } from "./drawingColorTool";

export interface SceneControlTool {
  name: string;
  order: number;
  title: string;
  icon: string;
  visible?: boolean;
  toggle?: boolean;
  active?: boolean;
  button?: boolean;
  iconColor?: string;
  onChange?: (event: Event, active: boolean) => unknown;
}

export interface SceneControl {
  name: string;
  order: number;
  title: string;
  icon: string;
  layer?: string;
  visible?: boolean;
  activeTool: string;
  tools: Record<string, SceneControlTool>;
  onChange?: (event: Event, active: boolean) => unknown;
  onToolChange?: (event: Event, tool: SceneControlTool) => unknown;
}

const PLACEABLE_BY_LAYER: Record<string, string> = {
  tokens: "Token",
  templates: "MeasuredTemplate",
  tiles: "Tile",
  drawings: "Drawing",
  walls: "Wall",
  lighting: "AmbientLight",
  notes: "Note",
};

function tool(name: string, order: number, title: string, icon: string, extra: Partial<SceneControlTool> = {}): SceneControlTool {
  return { name, order, title, icon, visible: true, ...extra };
}

/** GM-only button that removes every object of the layer from the viewed scene after confirmation. */
function clearTool(layerName: string, label: string): SceneControlTool {
  return tool("clear", 99, `Apagar todos: ${label}`, "fa-solid fa-trash", {
    button: true,
    visible: game.user.isGM,
    onChange: async () => {
      const scene = canvas.scene;
      const documentName = PLACEABLE_BY_LAYER[layerName];
      if (!scene || !documentName) return;
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Confirmar" },
        content: `<p>Apagar todos os objetos desta camada (${label}) na cena atual?</p>`,
        yes: { label: "Apagar" },
        no: { label: "Cancelar" },
      });
      if (!confirmed) return;
      const ids = scene.getEmbeddedCollection(documentName).map((document: any) => document.id);
      if (ids.length > 0) await scene.deleteEmbeddedDocuments(documentName, ids);
    },
  });
}

/** GM-only: locks the selected drawings so players cannot move, edit or erase them; unlocks them if all are locked. */
function lockSelectedDrawingsTool(): SceneControlTool {
  return tool("lockAll", 98, "Travar/destravar os desenhos selecionados", "fa-solid fa-lock", {
    button: true,
    visible: game.user.isGM,
    onChange: async () => {
      const drawings: any[] = (canvas.drawings?.controlled ?? []).map((drawing: any) => drawing.document);
      if (drawings.length === 0) {
        ui.notifications.info("Selecione os desenhos que quer travar (ferramenta Selecionar ou Shift+clique) e clique de novo.");
        return;
      }
      const lock = drawings.some((drawing: any) => drawing.locked !== true);
      await canvas.scene.updateEmbeddedDocuments("Drawing", drawings.map((drawing: any) => ({ _id: drawing.id, locked: lock })));
      ui.notifications.info(lock ? `${drawings.length} desenho(s) travado(s).` : `${drawings.length} desenho(s) liberado(s) para os jogadores.`);
    },
  });
}

function selectTool(): SceneControlTool {
  return tool("select", 1, "Selecionar", "fa-solid fa-expand");
}

/** Controls in the v13 shape (records keyed by name), before `getSceneControlButtons` lets packages edit them. */
export function buildDefaultSceneControls(): Record<string, SceneControl> {
  const isGM = game.user.isGM;
  const editing = isGmEditMode();
  const can = (permission: string) => isGM || (!isMapLocked() && game.user.can?.(permission) === true);
  return {
    tokens: {
      name: "tokens", order: 1, title: "Tokens", icon: "fa-solid fa-user", layer: "tokens", activeTool: "select", visible: true,
      tools: { select: selectTool(), ruler: tool("ruler", 2, "Medir distância", "fa-solid fa-ruler") },
    },
    templates: {
      name: "templates", order: 2, title: "Áreas de efeito", icon: "fa-solid fa-ruler-combined", layer: "templates", activeTool: "circle", visible: can("TEMPLATE_CREATE"),
      tools: {
        circle: tool("circle", 1, "Círculo", "fa-regular fa-circle"),
        cone: tool("cone", 2, "Cone", "fa-solid fa-angle-left"),
        rect: tool("rect", 3, "Retângulo", "fa-regular fa-square"),
        ray: tool("ray", 4, "Linha", "fa-solid fa-arrows-alt-v"),
        clear: clearTool("templates", "áreas"),
      },
    },
    tiles: {
      name: "tiles", order: 3, title: "Tiles", icon: "fa-solid fa-cubes", layer: "tiles", activeTool: "select", visible: editing,
      tools: {
        select: selectTool(),
        tile: tool("tile", 2, "Colocar tile (imagem)", "fa-solid fa-image"),
        layers: tool("layers", 3, "Camadas (mapa, props, personagens, notas)", "fa-solid fa-layer-group", { button: true, visible: isGM, onChange: () => toggleLayersPanel() }),
        clear: clearTool("tiles", "tiles"),
      },
    },
    drawings: {
      name: "drawings", order: 4, title: "Desenhos", icon: "fa-solid fa-pencil-alt", layer: "drawings", activeTool: "rect", visible: can("DRAWING_CREATE"),
      tools: {
        select: selectTool(),
        rect: tool("rect", 2, "Retângulo", "fa-solid fa-square"),
        ellipse: tool("ellipse", 3, "Elipse", "fa-solid fa-circle"),
        freehand: tool("freehand", 4, "Mão livre", "fa-solid fa-signature"),
        text: tool("text", 5, "Texto", "fa-solid fa-font"),
        color: drawingColorTool(),
        lockAll: lockSelectedDrawingsTool(),
        clear: clearTool("drawings", "desenhos"),
      },
    },
    walls: {
      name: "walls", order: 5, title: "Paredes", icon: "fa-solid fa-dungeon", layer: "walls", activeTool: "walls", visible: editing,
      tools: {
        select: selectTool(),
        walls: tool("walls", 2, "Parede", "fa-solid fa-bars"),
        door: tool("door", 3, "Porta", "fa-solid fa-door-open"),
        clear: clearTool("walls", "paredes"),
      },
    },
    lighting: {
      name: "lighting", order: 6, title: "Luzes", icon: "fa-regular fa-lightbulb", layer: "lighting", activeTool: "light", visible: editing,
      tools: { select: selectTool(), light: tool("light", 2, "Colocar luz", "fa-solid fa-lightbulb"), clear: clearTool("lighting", "luzes") },
    },
    notes: {
      name: "notes", order: 7, title: "Notas", icon: "fa-solid fa-bookmark", layer: "notes", activeTool: "select", visible: can("NOTE_CREATE"),
      tools: { select: selectTool(), journal: tool("journal", 2, "Nova nota", "fa-solid fa-book-medical", { visible: can("NOTE_CREATE") }), clear: clearTool("notes", "notas") },
    },
  };
}
