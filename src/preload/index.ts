import { contextBridge, ipcRenderer, webUtils } from "electron";
import { API_METHODS, type Api, type ChangeEvent } from "../shared/api";

const api: Record<string, unknown> = {};
for (const [group, methods] of Object.entries(API_METHODS)) {
  const g: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  for (const method of methods) {
    g[method] = (...args: unknown[]) => ipcRenderer.invoke(`${group}:${method}`, ...args);
  }
  api[group] = g;
}

api.onChanged = (cb: (e: ChangeEvent) => void): (() => void) => {
  const listener = (_event: unknown, e: ChangeEvent): void => cb(e);
  ipcRenderer.on("store:changed", listener);
  return () => ipcRenderer.removeListener("store:changed", listener);
};

api.pathForFile = (file: File): string => webUtils.getPathForFile(file);

contextBridge.exposeInMainWorld("api", api as Api);
