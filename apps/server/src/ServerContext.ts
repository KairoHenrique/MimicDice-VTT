import type { ServerConfig } from "./config";
import type { Logger } from "./logging/logger";
import type { PackageInstaller } from "./packages/PackageInstaller";
import type { PackageRegistry } from "./packages/PackageRegistry";
import type { SessionStore } from "./security/SessionStore";
import type { ActiveWorldHolder } from "./world/ActiveWorld";
import type { WorldRepository } from "./world/WorldRepository";

export interface ServerContext {
  config: ServerConfig;
  logger: Logger;
  sessions: SessionStore;
  worlds: WorldRepository;
  activeWorld: ActiveWorldHolder;
  packageRegistry: PackageRegistry;
  packageInstaller: PackageInstaller;
}
