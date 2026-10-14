import { sendJson } from "../../net/apiClient";
import { formErrorSlot, h, revealablePassword } from "../../views/dom";

/** GM-only: changes this room's Game Master password; an empty new password removes it. */
export function buildPasswordTab(): HTMLElement {
  const errorSlot = formErrorSlot();
  const currentPassword = h("input", { type: "password", name: "currentPassword", maxlength: 128, autocomplete: "current-password" });
  const newPassword = h("input", { type: "password", name: "newPassword", maxlength: 128, autocomplete: "new-password" });
  const confirmation = h("input", { type: "password", name: "confirmation", maxlength: 128, autocomplete: "new-password" });
  const submitButton = h("button", { type: "submit" }, h("i", { class: "fas fa-key" }), " Salvar senha");

  const form = h(
    "form",
    { class: "password-form" },
    h("p", { class: "hint" }, "Esta senha vale só para esta sala. Deixe a nova senha em branco para entrar como mestre sem senha."),
    h("label", {}, "Senha atual (em branco se não tiver)", revealablePassword(currentPassword)),
    h("label", {}, "Nova senha", revealablePassword(newPassword)),
    h("label", {}, "Repita a nova senha", revealablePassword(confirmation)),
    errorSlot.element,
    submitButton,
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorSlot.clear();
    if (newPassword.value !== confirmation.value) {
      errorSlot.show("As senhas novas não conferem.");
      return;
    }
    if (newPassword.value === "") {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Ficar sem senha?" },
        content: "<p>Sem senha, qualquer pessoa que abrir o link da mesa pode entrar como mestre. Continuar?</p>",
        yes: { label: "Ficar sem senha" },
        no: { label: "Cancelar" },
      });
      if (!confirmed) return;
    }
    const removesPassword = newPassword.value === "";
    submitButton.disabled = true;
    try {
      await sendJson("POST", "/api/users/me/password", { currentPassword: currentPassword.value, newPassword: newPassword.value });
      for (const input of [currentPassword, newPassword, confirmation]) input.value = "";
      ui.notifications.info(removesPassword ? "Pronto: esta sala agora não tem senha de mestre." : "Senha do mestre alterada.");
    } catch (error) {
      errorSlot.show(error instanceof Error ? error.message : "Não foi possível mudar a senha.");
    } finally {
      submitButton.disabled = false;
    }
  });
  return form;
}
