import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type DesktopBridge } from "./ipcChannels";

const bridge: DesktopBridge = {
  getLauncherState: () => ipcRenderer.invoke(IPC_CHANNELS.getLauncherState),
  openTable: () => ipcRenderer.invoke(IPC_CHANNELS.openTable),
  copyText: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.copyText, text),
  allowFirewall: () => ipcRenderer.invoke(IPC_CHANNELS.allowFirewall),
  openDataFolder: () => ipcRenderer.invoke(IPC_CHANNELS.openDataFolder),
  onStateChanged: (listener: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.stateChanged, () => listener());
  },
};

contextBridge.exposeInMainWorld("tabbletopDesktop", bridge);
