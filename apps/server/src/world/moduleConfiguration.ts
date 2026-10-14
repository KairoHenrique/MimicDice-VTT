import type { ActiveWorld } from "./ActiveWorld";

export const MODULE_CONFIGURATION_SETTING_KEY = "core.moduleConfiguration";

export function readActiveModuleIds(world: ActiveWorld): Set<string> {
  const configuration = world.settings.readWorldValue<Record<string, unknown>>(MODULE_CONFIGURATION_SETTING_KEY);
  if (!configuration || typeof configuration !== "object") return new Set();
  return new Set(Object.entries(configuration).filter(([, isActive]) => isActive === true).map(([moduleId]) => moduleId));
}
