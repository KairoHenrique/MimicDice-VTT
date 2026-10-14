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
