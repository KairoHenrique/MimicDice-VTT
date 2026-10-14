import "@fortawesome/fontawesome-free/css/all.min.css";
import "./styles/base.css";
import "./styles/applications.css";
import "./styles/dice.css";
import "./styles/combat.css";
import "./styles/canvas.css";
import "./styles/tableTools.css";
import "./styles/layers.css";
import "./styles/imageLibrary.css";
import "./styles/editors.css";
import "./styles/sheets.css";
import "./styles/sheetBoard.css";
import { translatePage } from "@tabbletop/i18n";
import { bootGame } from "./game/bootGame";
import { readPreferredLanguage } from "./game/languagePreference";
import { serverApi } from "./net/apiClient";
import { h } from "./views/dom";
import { renderJoinView } from "./views/joinView";
import { languagePicker } from "./views/languagePicker";
import { renderSetupView } from "./views/setupView";

async function start(): Promise<void> {
  const root = document.getElementById("app") as HTMLElement;
  try {
    const status = await serverApi.status();
    if (!status.configured) {
      renderSetupView(root, status, () => void start());
      root.append(languagePicker());
      return;
    }
    const session = await serverApi.session();
    if (!session) {
      await renderJoinView(root, status, () => void start());
      root.append(languagePicker());
      return;
    }
    await bootGame(root);
  } catch (error) {
    console.error("MimicDice | Falha ao iniciar", error);
    root.replaceChildren(h("main", { class: "entry-screen" }, h("section", { class: "entry-card" }, h("h1", {}, "Não foi possível conectar"), h("p", {}, "Verifique se o servidor do mestre está ligado e recarregue a página."))));
  }
}

async function translateThenStart(): Promise<void> {
  try {
    await translatePage(readPreferredLanguage());
  } catch (error) {
    console.error("MimicDice | Tradução indisponível", error);
  }
  await start();
}

void translateThenStart();
