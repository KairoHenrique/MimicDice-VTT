import { PRODUCT_NAME, type JoinableUserRecord, type ServerStatusResponse } from "@tabbletop/protocol";
import { serverApi } from "../net/apiClient";
import { brandMark, formErrorSlot, h, revealablePassword } from "./dom";

type JoinMode = "player" | "gm";

interface JoinForm {
  fields: HTMLElement[];
  focus: HTMLElement;
  submit(): Promise<void>;
}

function returningPlayerList(players: readonly JoinableUserRecord[], name: HTMLInputElement): HTMLElement {
  const list = h("div", { class: "join-players", role: "list" });
  for (const player of players) {
    const card = h(
      "button",
      { type: "button", class: "join-player", role: "listitem", title: `Entrar como ${player.name}` },
      h("i", { class: player.characterName ? "fa-solid fa-user-shield" : "fa-solid fa-user" }),
      h("span", { class: "join-player-text" }, h("strong", {}, player.name), h("span", { class: "hint" }, player.characterName ? `Personagem: ${player.characterName}` : "Ainda sem personagem")),
      h("i", { class: "fa-solid fa-arrow-right join-player-go" }),
    );
    card.addEventListener("click", () => {
      name.value = player.name;
      card.closest("form")?.requestSubmit();
    });
    list.append(card);
  }
  return list;
}

function playerForm(players: readonly JoinableUserRecord[]): JoinForm {
  const name = h("input", { name: "name", type: "text", required: true, maxlength: 40, autocomplete: "nickname", placeholder: "Ex.: Lyra" });
  const newPlayerField = h("label", {}, players.length > 0 ? "Primeira vez? Digite seu nome" : "Seu nome", name);
  const hint = h("p", { class: "hint" }, "Não precisa de senha. Depois de entrar você cria o seu personagem.");
  if (players.length === 0) return { fields: [newPlayerField, hint], focus: name, submit: () => serverApi.joinAsPlayer({ name: name.value }).then(() => undefined) };
  return {
    fields: [h("p", { class: "join-section-title" }, "Já jogou aqui? Clique em você:"), returningPlayerList(players, name), h("div", { class: "join-divider" }, h("span", {}, "ou")), newPlayerField, hint],
    focus: name,
    submit: () => serverApi.joinAsPlayer({ name: name.value }).then(() => undefined),
  };
}

function gameMasterForm(gameMasters: readonly JoinableUserRecord[], rememberedState: { userId: string | null }): JoinForm {
  const rememberedUserId = rememberedState.userId;
  const select = h("select", { name: "userId", required: true }, ...gameMasters.map((user) => h("option", { value: user._id, selected: user._id === rememberedUserId }, user.name)));
  const password = h("input", { name: "password", type: "password", required: true, maxlength: 128, autocomplete: "current-password" });
  const rememberBox = h("input", { type: "checkbox", name: "remember", checked: rememberedUserId !== null });
  const nameField = gameMasters.length > 1 ? h("label", {}, "Mestre", select) : h("input", { type: "hidden", name: "userId", value: gameMasters[0]?._id ?? "" });
  const passwordField = h("label", {}, "Senha do mestre", revealablePassword(password));
  const rememberField = h("label", { class: "checkbox-field" }, rememberBox, " Lembrar minha senha neste computador");
  const forgetButton = h("button", { type: "button", class: "link-button" }, "Esquecer");
  const rememberedNotice = h("p", { class: "remembered-notice" }, h("i", { class: "fa-solid fa-key" }), " Senha lembrada neste computador. ", forgetButton);
  const selectedUserId = () => (gameMasters.length > 1 ? select.value : (gameMasters[0]?._id ?? ""));
  let remembered = rememberedUserId;
  const usesRememberedPassword = () => remembered !== null && remembered === selectedUserId();
  const selectedHasPassword = () => gameMasters.find((user) => user._id === selectedUserId())?.hasPassword !== false;
  const refresh = () => {
    const usingRemembered = usesRememberedPassword();
    const needsPassword = selectedHasPassword() && !usingRemembered;
    rememberedNotice.hidden = !usingRemembered;
    passwordField.hidden = !needsPassword;
    rememberField.hidden = !needsPassword;
    password.required = needsPassword;
    if (!needsPassword) password.value = "";
  };
  const forget = () => {
    remembered = null;
    rememberedState.userId = null;
    rememberBox.checked = false;
    refresh();
    password.focus();
  };
  forgetButton.addEventListener("click", () => {
    void serverApi.forgetRemembered().catch(() => undefined);
    forget();
  });
  select.addEventListener("change", refresh);
  refresh();
  return {
    fields: [nameField, rememberedNotice, passwordField, rememberField],
    focus: usesRememberedPassword() ? select : password,
    submit: async () => {
      if (usesRememberedPassword()) {
        try {
          await serverApi.joinRemembered();
          return;
        } catch (error) {
          forget();
          throw error;
        }
      }
      try {
        await serverApi.join({ userId: selectedUserId(), password: password.value, remember: selectedHasPassword() && rememberBox.checked });
      } catch (error) {
        password.value = "";
        throw error;
      }
    },
  };
}

function modeSwitcher(mode: JoinMode, onChange: (mode: JoinMode) => void): HTMLElement {
  const group = h("div", { class: "join-modes", role: "tablist", "aria-label": "Como você vai entrar" });
  for (const [value, icon, label] of [["player", "fa-solid fa-user", "Sou jogador"], ["gm", "fa-solid fa-crown", "Sou o mestre"]] as const) {
    const button = h("button", { type: "button", role: "tab", class: `join-mode${value === mode ? " active" : ""}`, "aria-selected": String(value === mode) }, h("i", { class: icon }), ` ${label}`);
    button.addEventListener("click", () => onChange(value));
    group.append(button);
  }
  return group;
}

export async function renderJoinView(root: HTMLElement, status: ServerStatusResponse, onJoined: () => void): Promise<void> {
  const [users, remembered] = await Promise.all([serverApi.joinableUsers(), serverApi.rememberedGameMaster().catch(() => ({ userId: null }))]);
  const players = users.filter((user) => !user.isGameMaster);
  const gameMasters = users.filter((user) => user.isGameMaster);
  const rememberedState = { userId: gameMasters.some((user) => user._id === remembered.userId) ? remembered.userId : null };
  const rememberedUserId = rememberedState.userId;

  const show = (mode: JoinMode) => {
    const errorSlot = formErrorSlot();
    const join = mode === "player" ? playerForm(players) : gameMasterForm(gameMasters, rememberedState);
    const submitButton = h("button", { type: "submit" }, "Entrar");
    const form = h("form", { class: "entry-card" }, brandMark(), h("h1", {}, status.world?.title ?? PRODUCT_NAME), modeSwitcher(mode, show), ...join.fields, errorSlot.element, submitButton);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorSlot.clear();
      submitButton.disabled = true;
      try {
        await join.submit();
        onJoined();
      } catch (error) {
        errorSlot.show(error instanceof Error ? error.message : "Não foi possível entrar.");
        submitButton.disabled = false;
      }
    });
    root.replaceChildren(h("main", { class: "entry-screen" }, form));
    join.focus.focus();
  };

  show((status.isLocalRequest || rememberedUserId !== null) && gameMasters.length > 0 ? "gm" : "player");
}
