import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { API_METHODS, type StoreApi } from "../shared/api";
import { createStore } from "./store";
import { startPoller } from "./store/poller";
import { currentUsername } from "./store/users";

/** Registers one ipcMain.handle per group.method of the store. The only path from renderer to the file system. */
export function registerIpc(): ReturnType<typeof createStore> {
  const store = createStore({
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

  startPoller({
    getLayout: () => store.current(),
    intervalMs: () => store.settings().pollIntervalMs,
    onChange(events) {
      for (const w of BrowserWindow.getAllWindows()) for (const e of events) w.webContents.send("store:changed", e);
    },
  });
  return store;
}
