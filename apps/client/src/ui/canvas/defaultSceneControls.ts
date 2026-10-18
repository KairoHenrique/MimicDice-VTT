import { ERASE_TOOL, isGmDrawingsHidden, setGmDrawingsHidden } from "@tabbletop/api";
import { createChest, createTrap, secretsListDialog } from "../../game/concealment/secretsTools";
import { isGmEditMode, isMapLocked } from "../../game/tableControls";
import { toggleLayersPanel } from "../layers/LayersPanel";
import { toggleImageLibrary } from "../mapBuilder/imageLibrary";
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

function tool(name: string, order: number, title: string, icon: string, extra: Partial<SceneControlTool> = {}): SceneControlTool {
  return { name, order, title, icon, visible: true, ...extra };
}

/** GM-only eraser: while it is the active tool, each click deletes only the object clicked (Ctrl+Z brings it back). */
function eraseTool(label: string): SceneControlTool {
  return tool(ERASE_TOOL, 99, `Apagar ${label}: clique em cada um que quer apagar (Ctrl+Z desfaz)`, "fa-solid fa-eraser", { visible: game.user.isGM });
}

/** GM-only: hides/reveals selected drawings, or toggles whether new drawings start hidden from players. */
function hideDrawingsTool(): SceneControlTool {
  const hiddenMode = isGmDrawingsHidden();
  return tool("hideDrawings", 97, hiddenMode ? "Desenhos novos: OCULTOS dos jogadores (clique para mudar)" : "Ocultar/revelar desenho dos jogadores", hiddenMode ? "fa-solid fa-eye-slash" : "fa-solid fa-eye", {
    button: true,
    visible: game.user.isGM,
    active: hiddenMode,
    onChange: async () => {
      const controlled: any[] = canvas.drawings?.controlled ?? [];
      const drawings: any[] = controlled.map((drawing: any) => drawing.document);
      if (drawings.length > 0) {
        const anyVisible = drawings.some((drawing: any) => drawing.hidden !== true);
        await canvas.scene.updateEmbeddedDocuments("Drawing", drawings.map((drawing: any) => ({ _id: drawing.id, hidden: anyVisible })));
        ui.notifications.info(anyVisible ? `${drawings.length} desenho(s) ocultado(s) dos jogadores.` : `${drawings.length} desenho(s) revelado(s) para os jogadores.`);
      } else {
        const next = !isGmDrawingsHidden();
        setGmDrawingsHidden(next);
        ui.notifications.info(next ? "Desenhos novos do mestre agora começam ocultos dos jogadores." : "Desenhos novos do mestre agora começam visíveis para os jogadores.");
        void ui.controls?.render();
      }
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
        erase: eraseTool("áreas"),
      },
    },
    tiles: {
      name: "tiles", order: 3, title: "Tiles", icon: "fa-solid fa-cubes", layer: "tiles", activeTool: "select", visible: editing,
      tools: {
        select: selectTool(),
        tile: tool("tile", 2, "Colocar tile (imagem)", "fa-solid fa-image"),
        images: tool("images", 3, "Imagens do mapa: arraste das suas pastas para montar o mapa", "fa-solid fa-folder-open", { button: true, visible: isGM, onChange: () => toggleImageLibrary() }),
        layers: tool("layers", 4, "Camadas (mapa, props, personagens, notas)", "fa-solid fa-layer-group", { button: true, visible: isGM, onChange: () => toggleLayersPanel() }),
        erase: eraseTool("tiles, baús e armadilhas"),
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
        hideDrawings: hideDrawingsTool(),
        lockAll: lockSelectedDrawingsTool(),
        erase: eraseTool("desenhos"),
      },
    },
    walls: {
      name: "walls", order: 5, title: "Paredes e segredos", icon: "fa-solid fa-dungeon", layer: "walls", activeTool: "walls", visible: editing,
      tools: {
        select: selectTool(),
        walls: tool("walls", 2, "Parede", "fa-solid fa-bars"),
        door: tool("door", 3, "Porta", "fa-solid fa-door-open"),
        chest: tool("chest", 5, "Criar baú (guarda itens; cada item pode ter DT de percepção)", "fa-solid fa-box-archive", { button: true, visible: isGM, onChange: () => createChest() }),
        trap: tool("trap", 6, "Criar armadilha (invisível até alguém pisar)", "fa-solid fa-burst", { button: true, visible: isGM, onChange: () => createTrap() }),
        secrets: tool("secrets", 7, "Segredos desta cena: baús, armadilhas e objetos escondidos", "fa-solid fa-user-secret", { button: true, visible: isGM, onChange: () => secretsListDialog() }),
        erase: eraseTool("paredes e portas"),
      },
    },
    lighting: {
      name: "lighting", order: 6, title: "Luzes", icon: "fa-regular fa-lightbulb", layer: "lighting", activeTool: "light", visible: editing,
      tools: { select: selectTool(), light: tool("light", 2, "Colocar luz", "fa-solid fa-lightbulb"), erase: eraseTool("luzes") },
    },
    notes: {
      name: "notes", order: 7, title: "Pontos de interesse e notas", icon: "fa-solid fa-map-location-dot", layer: "notes", activeTool: "select", visible: can("NOTE_CREATE"),
      tools: { select: selectTool(), journal: tool("journal", 2, "Criar ponto de interesse ou nota", "fa-solid fa-location-dot", { visible: can("NOTE_CREATE") }), erase: eraseTool("pontos e notas") },
    },
  };
}
