import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { API_METHODS, type StoreApi } from "../shared/api";
import { createStore } from "./store";
import { startPoller } from "./store/poller";
import { currentUsername } from "./store/users";

const POLL_INTERVAL_MS = 5000;

/** Registers one ipcMain.handle per group.method of the store. The only path from renderer to the file system. */
export function registerIpc(): ReturnType<typeof createStore> {
  const store = createStore({
    userDataDir: app.getPath("userData"),
    username: currentUsername(),
    async chooseDirectory() {
      const r = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
      return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
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
    intervalMs: POLL_INTERVAL_MS,
    onChange(events) {
      for (const w of BrowserWindow.getAllWindows()) for (const e of events) w.webContents.send("store:changed", e);
    },
  });
  return store;
}
