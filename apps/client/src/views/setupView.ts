import { PRODUCT_NAME } from "@tabbletop/protocol";
import { serverApi } from "../net/apiClient";
import { brandMark, formErrorSlot, h, revealablePassword } from "./dom";

export function renderSetupView(root: HTMLElement, isLocalRequest: boolean, onConfigured: () => void): void {
  if (!isLocalRequest) {
    root.replaceChildren(
      h("main", { class: "entry-screen" }, h("section", { class: "entry-card" }, brandMark(), h("h1", {}, PRODUCT_NAME), h("p", {}, "O mestre ainda não configurou a mesa. Aguarde e recarregue a página."))),
    );
    return;
  }

  const errorSlot = formErrorSlot();
  const worldTitle = h("input", { name: "worldTitle", required: true, maxlength: 80, placeholder: "Ex.: Campanha de sexta" });
  const gameMasterName = h("input", { name: "gameMasterName", required: true, maxlength: 40, autocomplete: "username" });
  const password = h("input", { name: "password", type: "password", required: true, maxlength: 128, autocomplete: "new-password" });
  const passwordConfirmation = h("input", { name: "passwordConfirmation", type: "password", required: true, maxlength: 128, autocomplete: "new-password" });
  const submitButton = h("button", { type: "submit" }, "Criar mesa");

  const form = h(
    "form",
    { class: "entry-card" },
    brandMark(),
    h("h1", {}, "Configurar a mesa"),
    h("p", { class: "hint" }, "Isso só aparece no PC que hospeda. Você será o mestre."),
    h("label", {}, "Nome do mundo", worldTitle),
    h("label", {}, "Seu nome (mestre)", gameMasterName),
    h("label", {}, "Senha do mestre (você escolhe)", revealablePassword(password)),
    h("label", {}, "Repita a senha", revealablePassword(passwordConfirmation)),
    errorSlot.element,
    submitButton,
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorSlot.clear();
    if (password.value !== passwordConfirmation.value) {
      errorSlot.show("As senhas não conferem.");
      return;
    }
    submitButton.disabled = true;
    try {
      await serverApi.setup({ worldTitle: worldTitle.value, gameMasterName: gameMasterName.value, gameMasterPassword: password.value });
      onConfigured();
    } catch (error) {
      errorSlot.show(error instanceof Error ? error.message : "Não foi possível configurar.");
      submitButton.disabled = false;
    }
  });

  root.replaceChildren(h("main", { class: "entry-screen" }, form));
}
