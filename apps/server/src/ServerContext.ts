import type { ServerConfig } from "./config";
import type { Logger } from "./logging/logger";
import type { PackageInstaller } from "./packages/PackageInstaller";
import type { PackageRegistry } from "./packages/PackageRegistry";
import type { DeviceFingerprinter } from "./security/DeviceFingerprinter";
import type { RememberedDeviceStore } from "./security/RememberedDeviceStore";
import type { SessionStore } from "./security/SessionStore";
import type { ActiveWorldHolder } from "./world/ActiveWorld";
import type { WorldRepository } from "./world/WorldRepository";

export interface ServerContext {
  config: ServerConfig;
  logger: Logger;
  sessions: SessionStore;
  rememberedDevices: RememberedDeviceStore;
  deviceFingerprints: DeviceFingerprinter;
  worlds: WorldRepository;
  activeWorld: ActiveWorldHolder;
  packageRegistry: PackageRegistry;
  packageInstaller: PackageInstaller;
}
