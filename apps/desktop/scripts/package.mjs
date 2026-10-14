import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as buildInstaller } from "electron-builder";
import { SERVER_RUNTIME_EXTERNALS } from "./build.mjs";

const require = createRequire(import.meta.url);
const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientDist = path.resolve(desktopRoot, "..", "client", "dist");
const stageRoot = path.join(os.tmpdir(), "tabbletop-desktop-stage");
const releaseRoot = path.join(desktopRoot, process.env.MIMICDICE_RELEASE_DIR?.match(/^[\w-]{1,40}$/)?.[0] ?? "release");
const RUNTIME_DEPENDENCIES = SERVER_RUNTIME_EXTERNALS.filter((name) => name === "classic-level" || name === "@node-rs/argon2");

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function assertClientBuilt() {
  try {
    await stat(path.join(clientDist, "index.html"));
  } catch {
    throw new Error("Cliente não compilado. Rode `npm run build` na raiz antes de empacotar.");
  }
}

/** Standalone app folder with only the runtime files and the native dependencies the bundled server loads. */
async function stageApplication(desktopManifest) {
  await rm(stageRoot, { recursive: true, force: true });
  await mkdir(stageRoot, { recursive: true });
  await cp(path.join(desktopRoot, "dist"), path.join(stageRoot, "dist"), { recursive: true });
  const dependencies = {};
  for (const name of RUNTIME_DEPENDENCIES) dependencies[name] = (await readJson(require.resolve(`${name}/package.json`))).version;
  const stagedManifest = {
    name: "mimicdice-vtt",
    productName: desktopManifest.productName,
    version: desktopManifest.version,
    description: desktopManifest.description,
    author: "MimicDice VTT",
    main: desktopManifest.main,
    dependencies,
  };
  await writeFile(path.join(stageRoot, "package.json"), `${JSON.stringify(stagedManifest, null, 2)}\n`);
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("Rode pelo npm: `npm run package -w @tabbletop/desktop`.");
  execFileSync(process.execPath, [npmCli, "install", "--omit=dev", "--no-audit", "--no-fund", "--ignore-scripts"], { cwd: stageRoot, stdio: "inherit" });
}

async function packageApplication(desktopManifest) {
  const electronVersion = (await readJson(require.resolve("electron/package.json"))).version;
  await buildInstaller({
    projectDir: stageRoot,
    publish: "never",
    config: {
      appId: "local.mimicdice.vtt",
      productName: desktopManifest.productName,
      electronVersion,
      asar: false,
      npmRebuild: false,
      publish: null,
      directories: { output: releaseRoot },
      files: ["dist/**/*", "node_modules/**/*", "package.json"],
      extraResources: [{ from: clientDist, to: "client" }],
      win: {
        icon: path.join(desktopRoot, "build", "icon.ico"),
        target: [{ target: "nsis", arch: ["x64"] }],
      },
      nsis: {
        artifactName: "MimicDice-VTT-${version}-instalador.exe",
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        installerLanguages: ["pt_BR", "en_US"],
        multiLanguageInstaller: true,
        displayLanguageSelector: true,
        include: path.join(desktopRoot, "build", "installer.nsh"),
        installerSidebar: path.join(desktopRoot, "build", "installerSidebar.bmp"),
        uninstallerSidebar: path.join(desktopRoot, "build", "uninstallerSidebar.bmp"),
        installerHeader: path.join(desktopRoot, "build", "installerHeader.bmp"),
        runAfterFinish: true,
        createDesktopShortcut: false,
        createStartMenuShortcut: true,
        shortcutName: desktopManifest.productName,
        installerIcon: path.join(desktopRoot, "build", "icon.ico"),
        uninstallerIcon: path.join(desktopRoot, "build", "icon.ico"),
        deleteAppDataOnUninstall: false,
      },
    },
  });
}

const desktopManifest = await readJson(path.join(desktopRoot, "package.json"));
await assertClientBuilt();
await stageApplication(desktopManifest);
await packageApplication(desktopManifest);
await rm(stageRoot, { recursive: true, force: true });
console.log("Executável gerado em", releaseRoot);
