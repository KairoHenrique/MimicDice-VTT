import sanitizeHtml from "sanitize-html";
import { getProperty, setProperty, type PlainObject } from "@tabbletop/common";

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "img", "figure", "figcaption", "section", "span", "div", "h1", "h2", "h3", "h4", "h5", "h6",
    "table", "thead", "tbody", "tr", "th", "td", "hr", "br", "sup", "sub", "u", "s", "del", "ins", "details", "summary",
    "button", "header", "footer", "label", "small", "abbr",
  ],
  allowedAttributes: {
    "*": ["class", "title", "style", "data-*", "id", "aria-*"],
    a: ["href", "name", "target", "rel"],
    button: ["type", "name", "value", "disabled"],
    img: ["src", "alt", "width", "height"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  allowedStyles: {
    "*": {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i],
      "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i],
      "text-align": [/^(left|right|center|justify)$/],
      "font-weight": [/^(bold|normal|\d{3})$/],
      "font-style": [/^(italic|normal)$/],
      "text-decoration": [/^[a-z\s-]+$/i],
    },
  },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
  },
};

export function sanitizeHtmlString(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

/** Sanitizes, in place, every string at the given dotted paths. Works for full sources and for expanded update diffs. */
export function sanitizeHtmlFields(target: PlainObject, fieldPaths: readonly string[]): void {
  for (const fieldPath of fieldPaths) {
    const value = getProperty(target, fieldPath);
    if (typeof value === "string") setProperty(target, fieldPath, sanitizeHtmlString(value));
  }
}
