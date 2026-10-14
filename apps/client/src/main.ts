import "@fortawesome/fontawesome-free/css/all.min.css";
import "./styles/base.css";
import "./styles/applications.css";
import "./styles/dice.css";
import "./styles/canvas.css";
import "./styles/editors.css";
import "./styles/sheets.css";
import "./styles/sheetBoard.css";
import { bootGame } from "./game/bootGame";
import { serverApi } from "./net/apiClient";
import { h } from "./views/dom";
import { renderJoinView } from "./views/joinView";
import { renderSetupView } from "./views/setupView";

async function start(): Promise<void> {
  const root = document.getElementById("app") as HTMLElement;
  try {
    const status = await serverApi.status();
    if (!status.configured) {
      renderSetupView(root, status.isLocalRequest, () => void start());
      return;
    }
    const session = await serverApi.session();
    if (!session) {
      await renderJoinView(root, status, () => void start());
      return;
    }
    await bootGame(root);
  } catch (error) {
    console.error("MimicDice | Falha ao iniciar", error);
    root.replaceChildren(h("main", { class: "entry-screen" }, h("section", { class: "entry-card" }, h("h1", {}, "Não foi possível conectar"), h("p", {}, "Verifique se o servidor do mestre está ligado e recarregue a página."))));
  }
}

void start();
