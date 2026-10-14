import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DEFAULT_SERVER_PORT } from "@tabbletop/protocol";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(serverRoot, "../..");

const environmentSchema = z.object({
  TABBLETOP_PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_SERVER_PORT),
  TABBLETOP_HOST: z.string().min(1).default("0.0.0.0"),
  TABBLETOP_DATA_PATH: z.string().min(1).default(path.join(repositoryRoot, "data")),
  TABBLETOP_CLIENT_DIST: z.string().min(1).default(path.join(repositoryRoot, "apps", "client", "dist")),
  TABBLETOP_SESSION_HOURS: z.coerce.number().min(1).max(168).default(12),
});

export interface ServerConfig {
  port: number;
  host: string;
  dataPath: string;
  clientDistPath: string;
  worldsPath: string;
  modulesPath: string;
  systemsPath: string;
  configPath: string;
  rpgsPath: string;
  temporaryPath: string;
  sessionLifetimeMs: number;
}

export function loadServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = environmentSchema.parse(environment);
  const dataPath = path.resolve(parsed.TABBLETOP_DATA_PATH);
  return {
    port: parsed.TABBLETOP_PORT,
    host: parsed.TABBLETOP_HOST,
    dataPath,
    clientDistPath: path.resolve(parsed.TABBLETOP_CLIENT_DIST),
    worldsPath: path.join(dataPath, "worlds"),
    modulesPath: path.join(dataPath, "modules"),
    systemsPath: path.join(dataPath, "systems"),
    configPath: path.join(dataPath, "config"),
    rpgsPath: path.join(dataPath, "rpgs"),
    temporaryPath: path.join(dataPath, ".tmp"),
    sessionLifetimeMs: parsed.TABBLETOP_SESSION_HOURS * 60 * 60 * 1000,
  };
}
