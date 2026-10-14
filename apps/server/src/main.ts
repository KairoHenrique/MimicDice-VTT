import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { loadServerConfig } from "./config";
import { createHttpApp } from "./http/createHttpApp";
import { logger } from "./logging/logger";
import { PackageInstaller } from "./packages/PackageInstaller";
import { PackageRegistry } from "./packages/PackageRegistry";
import { PasswordHasher } from "./security/PasswordHasher";
import { SessionStore } from "./security/SessionStore";
import type { ServerContext } from "./ServerContext";
import { createSocketServer } from "./socket/createSocketServer";
import { ActiveWorldHolder } from "./world/ActiveWorld";
import { WorldRepository } from "./world/WorldRepository";

function listInviteAddresses(port: number): string[] {
  return Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === "IPv4" && !address.internal)
    .map((address) => `http://${address.address}:${port}`);
}

async function startServer(): Promise<void> {
  const config = loadServerConfig();
  const worlds = new WorldRepository(config.worldsPath, config.configPath, config.rpgsPath);
  const packageRegistry = new PackageRegistry(config.modulesPath, config.systemsPath, logger);
  const activeWorld = new ActiveWorldHolder(worlds, new PasswordHasher(), packageRegistry, logger);
  const context: ServerContext = {
    config,
    logger,
    sessions: new SessionStore(config.sessionLifetimeMs),
    worlds,
    activeWorld,
    packageRegistry,
    packageInstaller: new PackageInstaller(config, packageRegistry, logger),
  };

  await packageRegistry.refresh();
  await activeWorld.openConfiguredWorld();

  const httpServer = createServer(createHttpApp(context));
  const io = createSocketServer(context, httpServer);

  httpServer.listen(config.port, config.host, () => {
    logger.info("Servidor iniciado", { url: `http://localhost:${config.port}` });
    for (const inviteAddress of listInviteAddresses(config.port)) logger.info("Endereço de convite", { url: inviteAddress });
  });

  const shutdown = async (signal: string) => {
    logger.info("Encerrando servidor", { signal });
    await io.close();
    await activeWorld.close();
    context.sessions.dispose();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

startServer().catch((error) => {
  logger.error("Falha ao iniciar o servidor", error);
  process.exit(1);
});
