import type { StoreApi } from "../../shared/api";
import { loadConfig, saveConfig } from "./config";
import { layout, type Layout } from "./paths";
import { initProject, readProject } from "./project";
import { registerUser, usersCollection } from "./users";

export type StoreDeps = {
  userDataDir: string;
  username: string;
  /** Opens the folder picker; null when cancelled. */
  chooseDirectory(): Promise<string | null>;
};

const notImplemented = (name: string) => (): never => {
  throw new Error(`${name}: not implemented yet`);
};

/** The store behind the IPC surface. Every file-system access of the app goes through here. */
export function createStore(deps: StoreDeps): StoreApi & { current(): Layout | null } {
  let l: Layout | null = null;

  const need = (): Layout => {
    if (l === null) throw new Error("shared folder is not configured");
    return l;
  };

  return {
    current: () => l,
    config: {
      async get() {
        const c = await loadConfig(deps.userDataDir);
        if (c !== null) l = layout(c.rootDir);
        return c;
      },
      async chooseRoot() {
        const dir = await deps.chooseDirectory();
        if (dir === null) return null;
        await saveConfig(deps.userDataDir, { rootDir: dir });
        l = layout(dir);
        return dir;
      },
    },
    project: {
      get: async () => readProject(need()),
      init: async (month) => initProject(need(), month),
    },
    users: {
      me: async () => usersCollection(need()).get(deps.username),
      register: async (displayName) => registerUser(need(), deps.username, displayName),
      list: async () => usersCollection(need()).list(),
    },
    issues: {
      list: notImplemented("issues.list"),
      get: notImplemented("issues.get"),
      create: notImplemented("issues.create"),
      put: notImplemented("issues.put"),
      remove: notImplemented("issues.remove"),
      history: notImplemented("issues.history"),
    },
    summary: { exportCsv: notImplemented("summary.exportCsv") },
    comments: { list: notImplemented("comments.list"), add: notImplemented("comments.add") },
    attachments: {
      list: notImplemented("attachments.list"),
      add: notImplemented("attachments.add"),
      open: notImplemented("attachments.open"),
      openIssueFolder: notImplemented("attachments.openIssueFolder"),
      remove: notImplemented("attachments.remove"),
    },
    wiki: {
      list: notImplemented("wiki.list"),
      get: notImplemented("wiki.get"),
      create: notImplemented("wiki.create"),
      put: notImplemented("wiki.put"),
      remove: notImplemented("wiki.remove"),
      history: notImplemented("wiki.history"),
    },
  };
}
