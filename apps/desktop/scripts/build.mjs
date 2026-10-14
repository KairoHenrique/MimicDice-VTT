import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = path.resolve(desktopRoot, "..", "server", "src", "main.ts");
const outputRoot = path.join(desktopRoot, "dist");

/** Native or optional packages that must be loaded from node_modules at runtime. */
export const SERVER_RUNTIME_EXTERNALS = ["classic-level", "@node-rs/argon2", "bufferutil", "utf-8-validate"];

const sharedOptions = { bundle: true, target: "node22", sourcemap: false, legalComments: "none", logLevel: "warning" };

async function buildElectronProcesses() {
  await build({ ...sharedOptions, entryPoints: [path.join(desktopRoot, "src", "main.ts")], outfile: path.join(outputRoot, "main.cjs"), platform: "node", format: "cjs", external: ["electron"] });
  await build({ ...sharedOptions, entryPoints: [path.join(desktopRoot, "src", "preload.ts")], outfile: path.join(outputRoot, "preload.cjs"), platform: "node", format: "cjs", external: ["electron"] });
}

async function buildLauncher() {
  const launcherSource = path.join(desktopRoot, "src", "launcher");
  const launcherOutput = path.join(outputRoot, "launcher");
  await build({ ...sharedOptions, target: "chrome130", entryPoints: [path.join(launcherSource, "launcher.ts")], outfile: path.join(launcherOutput, "launcher.js"), platform: "browser", format: "iife" });
  await Promise.all(["index.html", "launcher.css"].map((file) => copyFile(path.join(launcherSource, file), path.join(launcherOutput, file))));
}

async function buildServer() {
  await build({
    ...sharedOptions,
    entryPoints: [serverEntry],
    outfile: path.join(outputRoot, "server", "main.mjs"),
    platform: "node",
    format: "esm",
    external: SERVER_RUNTIME_EXTERNALS,
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  });
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(path.join(outputRoot, "launcher"), { recursive: true });
  await Promise.all([buildElectronProcesses(), buildLauncher(), buildServer()]);
  console.log("Desktop build pronto em", outputRoot);
}
