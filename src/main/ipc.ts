import { app, BrowserWindow, dialog, ipcMain, powerMonitor, shell } from "electron";
import { API_METHODS, type StoreApi } from "../shared/api";
import { createStore } from "./store";
import { startPoller } from "./store/poller";
import { currentUsername } from "./store/users";

/** Registers one ipcMain.handle per group.method of the store. The only path from renderer to the file system. */
/** Past this many seconds without input the machine counts as unattended and the poller rests. */
const IDLE_SECONDS = 300;

export function registerIpc(): ReturnType<typeof createStore> {
  let wake = (): void => {};
  const store = createStore({
    watchChanged: () => wake(),
    userDataDir: app.getPath("userData"),
    username: currentUsername(),
    async chooseDirectory() {
      const r = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
      return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
    },
    async chooseFiles() {
      const r = await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"] });
      return r.canceled ? null : r.filePaths;
    },
    openPath: (path) => shell.openPath(path),
    async chooseSavePath(defaultName) {
      const r = await dialog.showSaveDialog({ defaultPath: defaultName, filters: [{ name: "CSV", extensions: ["csv"] }] });
      return r.canceled || !r.filePath ? null : r.filePath;
    },
  });

  for (const group of Object.keys(API_METHODS) as (keyof StoreApi)[]) {
    for (const method of API_METHODS[group] as readonly string[]) {
      const fn = (store[group] as Record<string, (...a: unknown[]) => unknown>)[method];
      ipcMain.handle(`${group}:${method}`, (_event, ...args: unknown[]) => fn(...args));
    }
  }

  // The share is scanned only while someone is working here: a window has focus and the machine has seen input lately.
  const poller = startPoller({
    getLayout: () => store.current(),
    intervalMs: () => store.settings().pollIntervalMs,
    active: () => BrowserWindow.getAllWindows().some((w) => w.isFocused()) && powerMonitor.getSystemIdleTime() < IDLE_SECONDS,
    watched: () => store.watched(),
    onChange(events) {
      for (const w of BrowserWindow.getAllWindows()) for (const e of events) w.webContents.send("store:changed", e);
    },
  });
  wake = poller.wake;
  app.on("browser-window-focus", poller.wake);
  powerMonitor.on("resume", poller.wake);
  return store;
}
