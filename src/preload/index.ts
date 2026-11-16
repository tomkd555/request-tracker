import { contextBridge, ipcRenderer, webUtils } from "electron";
import { API_METHODS, type Api } from "../shared/api";

const api: Record<string, unknown> = {};
for (const [group, methods] of Object.entries(API_METHODS)) {
  const groupApi: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  for (const method of methods) {
    groupApi[method] = (...args: unknown[]) => ipcRenderer.invoke(`${group}:${method}`, ...args);
  }
  api[group] = groupApi;
}

api.pathForFile = (file: File): string => webUtils.getPathForFile(file);

contextBridge.exposeInMainWorld("api", api as Api);
