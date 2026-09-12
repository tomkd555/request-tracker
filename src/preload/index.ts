import { contextBridge } from "electron";

// Filled in by Task 3 with the typed surface from src/shared/api.ts.
const api = {};

contextBridge.exposeInMainWorld("api", api);
