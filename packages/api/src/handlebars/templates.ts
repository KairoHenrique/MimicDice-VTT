import Handlebars from "handlebars";
import { CORE_TEMPLATES } from "./coreTemplates";

const RENDER_OPTIONS: RuntimeOptions = { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true };

type RuntimeOptions = Handlebars.RuntimeOptions;

const compiledTemplates = new Map<string, Promise<Handlebars.TemplateDelegate>>();

function normalizeTemplatePath(path: string): string {
  return path.replace(/^\/+/, "");
}

async function fetchAndCompile(path: string): Promise<Handlebars.TemplateDelegate> {
  const coreTemplate = CORE_TEMPLATES[path];
  if (coreTemplate !== undefined) return Handlebars.compile(coreTemplate);
  const response = await fetch(`/${path}`, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Failed to load template ${path}: HTTP ${response.status}`);
  return Handlebars.compile(await response.text());
}

export async function getTemplate(path: string, id?: string): Promise<Handlebars.TemplateDelegate> {
  const normalizedPath = normalizeTemplatePath(path);
  let pending = compiledTemplates.get(normalizedPath);
  if (!pending) {
    pending = fetchAndCompile(normalizedPath);
    compiledTemplates.set(normalizedPath, pending);
    pending.catch(() => compiledTemplates.delete(normalizedPath));
  }
  const template = await pending;
  Handlebars.registerPartial(normalizedPath, template);
  Handlebars.registerPartial(`/${normalizedPath}`, template);
  if (id) Handlebars.registerPartial(id, template);
  return template;
}

export async function loadTemplates(paths: string[] | Record<string, string>): Promise<Handlebars.TemplateDelegate[]> {
  const entries: Array<[string | undefined, string]> = Array.isArray(paths)
    ? paths.map((path) => [undefined, path])
    : Object.entries(paths).map(([id, path]) => [id, path]);
  return Promise.all(entries.map(([id, path]) => getTemplate(path, id)));
}

export async function renderTemplate(path: string, data: object = {}): Promise<string> {
  const template = await getTemplate(path);
  return template(data, RENDER_OPTIONS);
}
