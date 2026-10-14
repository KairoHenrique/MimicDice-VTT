import type { ApplicationConfiguration } from "@tabbletop/api";
import { USER_ROLES, type BanRecord, type PublicUserRecord } from "@tabbletop/protocol";
import { getJson, sendJson } from "../net/apiClient";
import { formErrorSlot, h, revealablePassword } from "../views/dom";
import { assignPlayerOwner } from "./actors/actorAssignment";
import { actorRole } from "./actors/actorRoles";
import { DomApplication } from "./DomApplication";

const ASSIGNABLE_ROLES = [
  { role: USER_ROLES.PLAYER, label: "Jogador" },
  { role: USER_ROLES.GAMEMASTER, label: "Mestre" },
] as const;

function isGameMasterAccount(user: PublicUserRecord): boolean {
  return user.role >= USER_ROLES.ASSISTANT;
}

export class UserManagement extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "user-management",
    classes: ["user-management"],
    window: { title: "Jogadores da mesa", frame: true, positioned: true, icon: false, controls: [], minimizable: true, resizable: false, contentTag: "section", contentClasses: [] },
    position: { width: 500 },
  };

  override async _prepareContext(): Promise<Record<string, unknown>> {
    const [users, bans] = await Promise.all([getJson<PublicUserRecord[]>("/api/users"), getJson<BanRecord[]>("/api/users/bans")]);
    return { users, bans };
  }

  buildContent(context: Record<string, unknown>): Node[] {
    const users = context.users as PublicUserRecord[];
    const bans = context.bans as BanRecord[];
    const hint = h("p", { class: "hint" }, "Jogadores entram só com o nome. Mestres entram com senha e controlam o mapa, as cenas e as fichas de todos.");
    return [hint, h("ul", { class: "user-list" }, ...users.map((user) => this.#buildUserRow(user))), this.#buildBanList(bans), this.#buildCreateForm()];
  }

  #buildBanList(bans: readonly BanRecord[]): HTMLElement {
    const section = h("div", { class: "ban-list" }, h("h3", {}, "Banidos"));
    if (bans.length === 0) {
      section.append(h("p", { class: "hint" }, "Ninguém banido nesta sala."));
      return section;
    }
    const list = h("ul", { class: "user-list" });
    for (const ban of bans) {
      const unbanButton = h("button", { type: "button", title: `Desbanir ${ban.name}` }, h("i", { class: "fas fa-unlock" }), " Desbanir");
      unbanButton.addEventListener("click", () => void this.#unban(ban));
      list.append(h("li", { class: "user-row" }, h("span", { class: "user-name" }, ban.name), h("span", { class: "hint" }, new Date(ban.bannedAt).toLocaleDateString("pt-BR")), unbanButton));
    }
    section.append(list);
    return section;
  }

  async #banUser(user: PublicUserRecord): Promise<void> {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Banir jogador" },
      content: `<p>Banir <strong>${foundry.utils.escapeHTML(user.name)}</strong> desta sala?</p><p>Ele sai na hora e não consegue voltar com esse nome nem pelo mesmo computador. O personagem dele continua na mesa.</p>`,
      yes: { label: "Banir" },
      no: { label: "Cancelar" },
    });
    if (!confirmed) return;
    try {
      await sendJson("POST", `/api/users/${encodeURIComponent(user._id)}/ban`);
      ui.notifications.info(`${user.name} foi banido.`);
    } catch (error) {
      ui.notifications.error(error instanceof Error ? error.message : "Falha ao banir");
    }
    await this.render();
  }

  async #unban(ban: BanRecord): Promise<void> {
    try {
      await sendJson("DELETE", `/api/users/bans/${encodeURIComponent(ban._id)}`);
      ui.notifications.info(`${ban.name} pode entrar de novo.`);
    } catch (error) {
      ui.notifications.error(error instanceof Error ? error.message : "Falha ao desbanir");
    }
    await this.render();
  }

  #buildUserRow(user: PublicUserRecord): HTMLElement {
    const isSelf = user._id === game.userId;
    const roleSelect = h(
      "select",
      { title: "Papel", disabled: isSelf },
      ...ASSIGNABLE_ROLES.map(({ role, label }) => h("option", { value: role, selected: isGameMasterAccount(user) === (role === USER_ROLES.GAMEMASTER) }, label)),
    );
    roleSelect.addEventListener("change", () => void this.#changeRole(user, Number(roleSelect.value)));
    const deleteButton = h("button", { type: "button", class: "icon", title: "Remover", disabled: isSelf }, h("i", { class: "fas fa-trash" }));
    deleteButton.addEventListener("click", () => void this.#deleteUser(user));
    const characterControl = isGameMasterAccount(user) ? h("span", { class: "hint" }, "vê tudo") : this.#characterSelect(user);
    const row = h("li", { class: "user-row" }, h("span", { class: "user-name" }, user.name), characterControl, roleSelect, deleteButton);
    if (!isGameMasterAccount(user)) {
      const banButton = h("button", { type: "button", class: "icon danger", title: `Banir ${user.name}`, "aria-label": `Banir ${user.name}` }, h("i", { class: "fas fa-ban" }));
      banButton.addEventListener("click", () => void this.#banUser(user));
      row.append(banButton);
    }
    return row;
  }

  /** Linking a character makes the player its owner, so its tokens are theirs to move as soon as they join. */
  #characterSelect(user: PublicUserRecord): HTMLSelectElement {
    const select = h("select", { title: "Personagem deste jogador", "aria-label": `Personagem de ${user.name}` }, h("option", { value: "" }, "Sem personagem"));
    const actors = [...game.actors.contents].sort((left: any, right: any) => Number(actorRole(right) === "player") - Number(actorRole(left) === "player"));
    for (const actor of actors) select.append(h("option", { value: actor.id, selected: actor.id === user.character }, actor.name));
    select.addEventListener("change", () => void this.#linkCharacter(user, select.value || null));
    return select;
  }

  async #linkCharacter(user: PublicUserRecord, actorId: string | null): Promise<void> {
    const player = game.users.get(user._id);
    if (!player) return;
    const actor = actorId ? game.actors.get(actorId) : null;
    try {
      if (actor) await assignPlayerOwner(actor, player.id);
      await player.update({ character: actor?.id ?? null });
      ui.notifications.info(actor ? `${user.name} agora controla ${actor.name}.` : `${user.name} ficou sem personagem.`);
    } catch (error) {
      ui.notifications.error(error instanceof Error ? error.message : "Falha ao associar o personagem");
    }
    await this.render();
  }

  #buildCreateForm(): HTMLElement {
    const errorSlot = formErrorSlot();
    const nameInput = h("input", { placeholder: "Nome", required: true, maxlength: 40 });
    const passwordInput = h("input", { type: "password", placeholder: "Senha do mestre", required: true, maxlength: 128, autocomplete: "new-password" });
    const createButton = h("button", { type: "button" }, h("i", { class: "fas fa-user-plus" }), " Criar mestre");
    createButton.addEventListener("click", async () => {
      errorSlot.clear();
      if (!nameInput.reportValidity() || !passwordInput.reportValidity()) return;
      createButton.disabled = true;
      try {
        await sendJson("POST", "/api/users", { name: nameInput.value, password: passwordInput.value, role: USER_ROLES.GAMEMASTER });
        ui.notifications.info(`${nameInput.value} já pode entrar como mestre.`);
        await this.render();
      } catch (error) {
        errorSlot.show(error instanceof Error ? error.message : "Falha ao criar");
        createButton.disabled = false;
      }
    });
    return h(
      "div",
      { class: "create-user" },
      h("h3", {}, "Outro mestre"),
      h("p", { class: "hint" }, "Jogadores não precisam ser cadastrados: eles digitam o nome na tela de entrada."),
      h("div", { class: "form-group" }, nameInput, revealablePassword(passwordInput), createButton),
      errorSlot.element,
    );
  }

  async #changeRole(user: PublicUserRecord, role: number): Promise<void> {
    const body = role === USER_ROLES.GAMEMASTER ? await this.#askGameMasterPassword(user) : { role };
    if (!body) return void this.render();
    try {
      await sendJson("PATCH", `/api/users/${encodeURIComponent(user._id)}/role`, body);
      ui.notifications.info(role === USER_ROLES.GAMEMASTER ? `${user.name} agora é mestre e entra com a senha.` : `${user.name} agora é jogador.`);
    } catch (error) {
      ui.notifications.error(error instanceof Error ? error.message : "Falha ao mudar o papel");
    }
    await this.render();
  }

  async #askGameMasterPassword(user: PublicUserRecord): Promise<{ role: number; password: string } | null> {
    const passwordInput = h("input", { type: "password", name: "password", maxlength: 128, required: true, autocomplete: "new-password" });
    const content = h(
      "div",
      {},
      h("p", {}, h("strong", {}, user.name), " vai ver e editar tudo. Defina a senha que ele vai usar para entrar:"),
      revealablePassword(passwordInput),
    );
    const password = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Tornar mestre" },
      content,
      ok: { label: "Tornar mestre", callback: () => passwordInput.value },
      rejectClose: false,
    });
    if (typeof password !== "string" || password.length === 0) {
      if (typeof password === "string") ui.notifications.warn("Digite uma senha para o novo mestre.");
      return null;
    }
    return { role: USER_ROLES.GAMEMASTER, password };
  }

  async #deleteUser(user: PublicUserRecord): Promise<void> {
    const confirmed = await foundry.applications.api.DialogV2.confirm({ window: { title: "Remover jogador" }, content: `<p>Remover <strong>${foundry.utils.escapeHTML(user.name)}</strong>?</p>` });
    if (!confirmed) return;
    try {
      await sendJson("DELETE", `/api/users/${encodeURIComponent(user._id)}`);
      await this.render();
    } catch (error) {
      ui.notifications.error(error instanceof Error ? error.message : "Falha ao remover");
    }
  }
}
