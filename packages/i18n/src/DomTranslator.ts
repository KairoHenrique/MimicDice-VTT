import type { Translator } from "./Translator";

const TRANSLATED_ATTRIBUTES = ["title", "aria-label", "placeholder", "alt", "aria-description", "data-tooltip"] as const;
/** Code, typed text and anything marked `translate="no"` (names, chat typed by people) keep their text. */
const SKIPPED_SELECTOR = 'script, style, textarea, code, pre, [translate="no"], [contenteditable=""], [contenteditable="true"]';
const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);

function isSkippedElement(element: Element): boolean {
  if (SKIPPED_TAGS.has(element.tagName)) return true;
  return element.getAttribute("translate") === "no" || element.getAttribute("contenteditable") === "" || element.getAttribute("contenteditable") === "true";
}

/** Keeps the text node's surrounding spaces, which separate it from neighbouring elements. */
function withOriginalSpacing(original: string, translated: string): string {
  const leading = /^\s*/.exec(original)?.[0] ?? "";
  const trailing = /\s*$/.exec(original)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

/**
 * Translates the page as it is rendered: text nodes and a few text attributes, now and whenever they change.
 * Each node remembers what we wrote, so our own writes never trigger another pass.
 */
export class DomTranslator {
  readonly #translator: Translator;
  readonly #root: Node;
  readonly #writtenText = new WeakMap<Text, string>();
  readonly #writtenAttributes = new WeakMap<Element, Map<string, string>>();
  #observer: MutationObserver | null = null;

  constructor(translator: Translator, root: Node) {
    this.#translator = translator;
    this.#root = root;
  }

  start(): void {
    if (this.#observer) return;
    this.translateTree(this.#root);
    this.#observer = new MutationObserver((records) => this.#onMutations(records));
    this.#observer.observe(this.#root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...TRANSLATED_ATTRIBUTES] });
  }

  stop(): void {
    this.#observer?.disconnect();
    this.#observer = null;
  }

  translateTree(root: Node): void {
    if (root.nodeType === Node.TEXT_NODE) {
      this.#translateTextNode(root as Text);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE && this.#isInsideSkipped(root as Element)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (node.nodeType === Node.ELEMENT_NODE && isSkippedElement(node as Element) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let node: Node | null = walker.currentNode; node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) this.#translateTextNode(node as Text);
      else if (node.nodeType === Node.ELEMENT_NODE) this.#translateAttributes(node as Element);
    }
  }

  #isInsideSkipped(element: Element): boolean {
    return element.closest(SKIPPED_SELECTOR) !== null;
  }

  #onMutations(records: MutationRecord[]): void {
    for (const record of records) {
      if (record.type === "childList") {
        for (const node of record.addedNodes) this.translateTree(node);
      } else if (record.type === "characterData") {
        const text = record.target as Text;
        if (text.parentElement && !this.#isInsideSkipped(text.parentElement)) this.#translateTextNode(text);
      } else if (record.type === "attributes" && record.attributeName) {
        const element = record.target as Element;
        if (!this.#isInsideSkipped(element)) this.#translateAttribute(element, record.attributeName);
      }
    }
  }

  #translateTextNode(node: Text): void {
    const current = node.data;
    if (this.#writtenText.get(node) === current || current.length < 2) return;
    const translated = this.#translator.translate(current);
    if (translated === null) return;
    const output = withOriginalSpacing(current, translated);
    this.#writtenText.set(node, output);
    node.data = output;
  }

  #translateAttributes(element: Element): void {
    for (const name of TRANSLATED_ATTRIBUTES) if (element.hasAttribute(name)) this.#translateAttribute(element, name);
  }

  #translateAttribute(element: Element, name: string): void {
    const current = element.getAttribute(name);
    if (!current) return;
    const written = this.#writtenAttributes.get(element);
    if (written?.get(name) === current) return;
    const translated = this.#translator.translate(current);
    if (translated === null) return;
    const map = written ?? new Map<string, string>();
    map.set(name, translated);
    this.#writtenAttributes.set(element, map);
    element.setAttribute(name, translated);
  }
}
