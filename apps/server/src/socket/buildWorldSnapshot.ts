import { CORE_RELEASE, type WorldSnapshot } from "@tabbletop/protocol";
import { visibleWorldDocuments } from "../documents/visibleDocuments";
import { toPackageRecord, type PackageRegistry } from "../packages/PackageRegistry";
import type { ActiveWorld } from "../world/ActiveWorld";
import { readActiveModuleIds } from "../world/moduleConfiguration";
import type { PresenceTracker } from "./PresenceTracker";

export function buildWorldSnapshot(world: ActiveWorld, registry: PackageRegistry, presence: PresenceTracker, userId: string): WorldSnapshot {
  const activeModuleIds = readActiveModuleIds(world);
  const system = world.manifest.system ? registry.find("system", world.manifest.system) : undefined;
  const orderedActiveModules = registry.resolveModuleLoadOrder(activeModuleIds);
  const orderedActiveIds = new Set(orderedActiveModules.map((installed) => installed.id));
  const inactiveModules = registry.listModules().filter((installed) => !orderedActiveIds.has(installed.id));
  const viewer = { userId, isGameMaster: world.users.isGameMaster(userId) };

  return {
    userId,
    world: {
      id: world.manifest.id,
      title: world.manifest.title,
      description: world.manifest.description,
      system: world.manifest.system,
      coreVersion: world.manifest.coreVersion,
    },
    system: system ? toPackageRecord(system, true) : null,
    modules: [
      ...orderedActiveModules.map((installed) => toPackageRecord(installed, true)),
      ...inactiveModules.map((installed) => toPackageRecord(installed, false)),
    ],
    users: world.users.listPublicUsers().map((user) => ({ ...user, active: presence.isActive(user._id) })),
    settings: world.settings.listVisibleTo(userId),
    release: { ...CORE_RELEASE },
    documents: visibleWorldDocuments(world.documents, viewer),
    model: world.systemModel.templates,
  };
}
