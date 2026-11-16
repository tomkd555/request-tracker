import { app, clipboard, ClipboardItem, dialog, ipcMain, shell } from "electron";
import { API_METHODS, type StoreApi } from "../shared/api";
import { createStore } from "./store";
import { currentUsername } from "./store/users";

/** Registers one ipcMain.handle per group.method of the store. The only path from renderer to the file system. */
export function registerIpc(): ReturnType<typeof createStore> {
  const store = createStore({
    userDataDir: app.getPath("userData"),
    username: currentUsername(),
    async chooseDirectory() {
      const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
    },
    async chooseFiles() {
      const result = await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"] });
      return result.canceled ? null : result.filePaths;
    },
    openPath: (path) => shell.openPath(path),
    async chooseSavePath(defaultName, filter) {
      const result = await dialog.showSaveDialog({ defaultPath: defaultName, filters: [filter] });
      return result.canceled || !result.filePath ? null : result.filePath;
    },
    async chooseOpenPath(filter) {
      const result = await dialog.showOpenDialog({ properties: ["openFile"], filters: [filter] });
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
    },
    writeClipboard: (html, text) => clipboard.write([new ClipboardItem({ "text/html": html, "text/plain": text })]),
  });

  for (const group of Object.keys(API_METHODS) as (keyof StoreApi)[]) {
    for (const method of API_METHODS[group] as readonly string[]) {
      const handler = (store[group] as Record<string, (...args: unknown[]) => unknown>)[method];
      ipcMain.handle(`${group}:${method}`, (_event, ...args: unknown[]) => handler(...args));
    }
  }

  return store;
}
