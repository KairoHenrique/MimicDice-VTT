type Child = Node | string | null | undefined | false;

type Attributes = Record<string, string | number | boolean | undefined | EventListener>;

/** Builds DOM nodes without innerHTML, so user-provided text is never parsed as markup. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Attributes = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue;
    if (typeof value === "function") element.addEventListener(name.replace(/^on/, "").toLowerCase(), value);
    else if (value === true) element.setAttribute(name, "");
    else element.setAttribute(name, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child);
  }
  return element;
}

export function brandMark(): HTMLElement {
  return h("span", { class: "brand-mark" }, h("i", { class: "fa-solid fa-dice-d20" }), "MimicDice VTT");
}

/** Wraps a password input with an eye button that shows or hides what was typed. */
export function revealablePassword(input: HTMLInputElement): HTMLElement {
  const icon = h("i", { class: "fa-solid fa-eye" });
  const toggle = h("button", { type: "button", class: "password-reveal", title: "Mostrar senha", "aria-label": "Mostrar senha" }, icon);
  toggle.addEventListener("click", () => {
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    icon.className = reveal ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
    const label = reveal ? "Esconder senha" : "Mostrar senha";
    toggle.title = label;
    toggle.setAttribute("aria-label", label);
    input.focus();
  });
  return h("span", { class: "password-field" }, input, toggle);
}

export function formErrorSlot(): { element: HTMLParagraphElement; show(message: string): void; clear(): void } {
  const element = h("p", { class: "form-error", role: "alert" });
  return {
    element,
    show: (message) => {
      element.textContent = message;
    },
    clear: () => {
      element.textContent = "";
    },
  };
}
