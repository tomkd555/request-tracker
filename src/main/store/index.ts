import { promises as fsp } from "node:fs";
import { join } from "node:path";
import type { StoreApi } from "../../shared/api";
import type { Issue } from "../../shared/types";
import { addAttachments, assertName, isRefusedExtension, listAttachments, removeAttachment } from "./attachments";
import { addComment, commentsCollection } from "./comments";
import { loadConfig, saveConfig } from "./config";
import { createIssue, issuesCollection, removeIssue } from "./issues";
import { layout, type Layout } from "./paths";
import { initProject, putCategories, readProject } from "./project";
import { registerUser, usersCollection } from "./users";
import { createPage, wikiCollection } from "./wiki";

export interface StoreDeps {
  userDataDir: string;
  username: string;
  /** Opens the folder picker; null when cancelled. */
  chooseDirectory(): Promise<string | null>;
  /** Opens the multi-select file picker; null when cancelled. */
  chooseFiles(): Promise<string[] | null>;
  /** Opens a file or folder with the OS; resolves to an error message, or "" on success (shell.openPath). */
  openPath(path: string): Promise<string>;
  /** Save dialog; the chosen path, or null when cancelled. */
  chooseSavePath(defaultName: string): Promise<string | null>;
}

/** Records written before `category` existed come back with "" so the renderer always sees a string. */
const withDefaults = (i: Issue): Issue => ({ ...i, category: i.category ?? "" });

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
      put: async (categories) => putCategories(need(), categories),
    },
    users: {
      me: async () => usersCollection(need()).get(deps.username),
      register: async (displayName) => registerUser(need(), deps.username, displayName),
      list: async () => usersCollection(need()).list(),
    },
    issues: {
      list: async () => (await issuesCollection(need()).list()).map(withDefaults),
      get: async (key) => {
        const i = await issuesCollection(need()).get(key);
        return i === null ? null : withDefaults(i);
      },
      async create(draft) {
        const project = await readProject(need());
        if (project === null) throw new Error("project.json is missing");
        return createIssue(need(), project, draft);
      },
      put: async (issue) => issuesCollection(need()).put(issue.key, issue),
      remove: async (key) => removeIssue(need(), key),
      history: async (key) => (await issuesCollection(need()).history(key)).map(withDefaults),
    },
    summary: {
      async exportCsv(csv, defaultName) {
        const path = await deps.chooseSavePath(defaultName);
        if (path === null) return false;
        await fsp.writeFile(path, "﻿" + csv, "utf8");
        return true;
      },
    },
    comments: {
      list: async (key) => commentsCollection(need(), key).list(),
      add: async (c) => addComment(need(), c),
    },
    attachments: {
      list: async (key) => listAttachments(need(), key),
      async add(key, paths) {
        const chosen = paths ?? (await deps.chooseFiles());
        if (chosen === null || chosen.length === 0) return { added: [], refused: [] };
        return addAttachments(need(), key, chosen);
      },
      async open(key, name) {
        assertName(name);
        if (isRefusedExtension(name)) throw new Error("refused-extension"); // a file placed in the folder by hand
        const err = await deps.openPath(join(need().attachments(key), name));
        if (err !== "") throw new Error(`open-failed: ${err}`);
      },
      async openIssueFolder(key) {
        const dir = need().attachments(key);
        await fsp.mkdir(dir, { recursive: true });
        const err = await deps.openPath(dir);
        if (err !== "") throw new Error(`open-failed: ${err}`);
      },
      remove: async (key, name) => removeAttachment(need(), key, name),
    },
    wiki: {
      list: async () => wikiCollection(need()).list(),
      get: async (id) => wikiCollection(need()).get(id),
      create: async (p) => createPage(need(), p),
      put: async (p) => wikiCollection(need()).put(p.id, p),
      remove: async (id) => wikiCollection(need()).remove(id),
      history: async (id) => wikiCollection(need()).history(id),
    },
  };
}
