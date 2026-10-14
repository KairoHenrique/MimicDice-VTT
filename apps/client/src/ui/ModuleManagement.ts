import { compatibilityMonitor, type ApplicationConfiguration, type CompatibilityStatus } from "@tabbletop/api";
import type { PackageRecord } from "@tabbletop/protocol";
import { getJson, sendJson } from "../net/apiClient";
import { formErrorSlot, h } from "../views/dom";
import { DomApplication } from "./DomApplication";

const MODULE_CONFIGURATION_KEY = "moduleConfiguration";
const COMPATIBILITY_LABELS: Record<CompatibilityStatus, string> = { ok: "Funcionando", warning: "Com erros", failed: "Não carregou" };

/** `renderModuleManagement` listeners read `relationships.requires` from each module entry, as in Foundry's context. */
function withRelationships(module: PackageRecord): PackageRecord & { relationships: { requires: unknown[] } } {
  const requires = game.modules.get(module.id)?.relationships?.requires;
  return { ...module, relationships: { requires: requires ? Array.from(requires as Iterable<unknown>) : [] } };
}

export class ModuleManagement extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "module-management",
    classes: ["module-management"],
    window: { title: "Gerenciar módulos", frame: true, positioned: true, icon: false, controls: [], minimizable: true, resizable: false, contentTag: "section", contentClasses: [] },
    position: { width: 560 },
  };

  #pendingActivation: Record<string, boolean> | null = null;

  override async _prepareContext(): Promise<Record<string, unknown>> {
    const [modules, systems] = await Promise.all([getJson<PackageRecord[]>("/api/packages/modules"), getJson<PackageRecord[]>("/api/packages/systems")]);
    modules.sort((left, right) => left.title.localeCompare(right.title));
    this.#pendingActivation ??= Object.fromEntries(modules.map((module) => [module.id, module.active]));
    return { modules: modules.map(withRelationships), systems };
  }

  buildContent(context: Record<string, unknown>): Node[] {
    const modules = context.modules as PackageRecord[];
    const systems = context.systems as PackageRecord[];
    return [this.#buildInstallForm(), this.#buildSystemPicker(systems), this.#buildModuleList(modules), this.#buildFooter()];
  }

  #buildInstallForm(): HTMLElement {
    const errorSlot = formErrorSlot();
    const manifestInput = h("input", { type: "url", placeholder: "Cole a Manifest URL (https://.../module.json ou system.json)", required: true, maxlength: 2048 });
    const typeSelect = h("select", { "aria-label": "Tipo de pacote" }, h("option", { value: "module" }, "Módulo"), h("option", { value: "system" }, "Sistema"));
    const installButton = h("button", { type: "button" }, h("i", { class: "fas fa-download" }), " Instalar");
    installButton.addEventListener("click", async () => {
      errorSlot.clear();
      if (!manifestInput.reportValidity()) return;
      installButton.disabled = true;
      try {
        const installed = await sendJson<{ title: string; version: string }>("POST", "/api/packages/install", { manifestUrl: manifestInput.value, packageType: typeSelect.value });
        const nextStep = typeSelect.value === "system" ? "Escolha-o em Sistema de jogo." : "Ative e salve para usar.";
        ui.notifications.info(`${installed.title} ${installed.version} instalado. ${nextStep}`);
        await this.render();
      } catch (error) {
        errorSlot.show(error instanceof Error ? error.message : "Falha na instalação");
      } finally {
        installButton.disabled = false;
      }
    });
    return h("div", { class: "install-module" }, h("div", { class: "form-group" }, typeSelect, manifestInput, installButton), errorSlot.element);
  }

  #buildSystemPicker(systems: PackageRecord[]): HTMLElement {
    const select = h("select", { "aria-label": "Sistema de jogo" }, h("option", { value: "" }, "Fichas livres (sem sistema)"));
    for (const system of systems) select.append(h("option", { value: system.id }, `${system.title} (v${system.version.replace(/^v/i, "")})`));
    select.value = systems.find((system) => system.active)?.id ?? "";
    const applyButton = h("button", { type: "button" }, h("i", { class: "fas fa-dice-d20" }), " Usar sistema");
    applyButton.addEventListener("click", async () => {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Trocar sistema de jogo" },
        content: "<p>Todos os jogadores serão recarregados. Fichas criadas em outro sistema podem perder campos específicos. Continuar?</p>",
      });
      if (!confirmed) return;
      applyButton.disabled = true;
      try {
        await sendJson("POST", "/api/packages/world-system", { systemId: select.value || null });
      } catch (error) {
        ui.notifications.error(error instanceof Error ? error.message : "Falha ao trocar o sistema");
        applyButton.disabled = false;
      }
    });
    return h("fieldset", { class: "system-picker" }, h("legend", {}, "Sistema de jogo"), h("div", { class: "form-group" }, select, applyButton));
  }

  #buildModuleList(modules: PackageRecord[]): HTMLElement {
    if (modules.length === 0) return h("p", { class: "hint" }, "Nenhum módulo instalado ainda.");
    const rows = modules.map((module) => {
      const checkbox = h("input", { type: "checkbox", checked: this.#pendingActivation?.[module.id] === true });
      checkbox.addEventListener("change", () => {
        if (this.#pendingActivation) this.#pendingActivation[module.id] = checkbox.checked;
      });
      return h(
        "li",
        { class: "package", "data-module-id": module.id },
        h("label", { class: "package-title" }, checkbox, h("strong", {}, module.title)),
        h("span", { class: "package-meta package-metadata" }, `${module.id} · v${module.version.replace(/^v/i, "")}`),
        module.active ? this.#buildCompatibilityBadge(module.id) : null,
      );
    });
    return h("ul", { class: "package-list" }, ...rows);
  }

  /** Shows whether an active add-on loaded and ran without errors during this session. */
  #buildCompatibilityBadge(packageId: string): HTMLElement {
    const report = compatibilityMonitor.reportFor(packageId);
    const label = COMPATIBILITY_LABELS[report.status];
    const badge = h("span", { class: `compatibility-badge compatibility-${report.status}` }, label);
    if (report.issues.length === 0) return badge;
    const details = h(
      "details",
      { class: "compatibility-details" },
      h("summary", {}, badge, ` ${report.issues.length} problema(s)`),
      h("ul", {}, ...report.issues.map((issue) => h("li", {}, `${issue.location}: ${issue.message}${issue.count > 1 ? ` (x${issue.count})` : ""}`))),
    );
    return details;
  }

  #buildFooter(): HTMLElement {
    const saveButton = h("button", { type: "button", class: "default" }, h("i", { class: "fas fa-save" }), " Salvar e recarregar");
    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      try {
        await game.settings.set("core", MODULE_CONFIGURATION_KEY, this.#pendingActivation ?? {});
        window.location.reload();
      } catch (error) {
        ui.notifications.error(error instanceof Error ? error.message : "Falha ao salvar");
        saveButton.disabled = false;
      }
    });
    return h("footer", { class: "form-footer" }, saveButton);
  }
}
