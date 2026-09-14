import { promises as fsp } from "node:fs";
import { join } from "node:path";
import type { StoreApi } from "../../shared/api";
import { assertLocalSettings, DEFAULT_LOCAL_SETTINGS, type Issue, type LocalSettings } from "../../shared/types";
import { addAttachments, assertName, attachmentDir, isRefusedExtension, listAttachments, removeAttachment } from "./attachments";
import { mkdirp } from "./collection";
import { addComment, commentsCollection } from "./comments";
import { loadConfig, saveConfig } from "./config";
import { createIssue, issuesCollection, removeIssue } from "./issues";
import { layout, type Layout } from "./paths";
import { initProject, putCategories, readProject } from "./project";
import { registerUser, usersCollection } from "./users";
import { createPage, putPage, removePage, wikiCollection, withWikiDefaults } from "./wiki";

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
export function createStore(deps: StoreDeps): StoreApi & { current(): Layout | null; settings(): LocalSettings } {
  let l: Layout | null = null;
  // The poller reads these from the first tick, before the renderer's config.get; defaults until then.
  let settings: LocalSettings = DEFAULT_LOCAL_SETTINGS;

  const need = (): Layout => {
    if (l === null) throw new Error("shared folder is not configured");
    return l;
  };

  return {
    current: () => l,
    settings: () => settings,
    config: {
      async get() {
        const c = await loadConfig(deps.userDataDir);
        if (c !== null) {
          const { rootDir, ...rest } = c;
          l = layout(rootDir);
          settings = rest;
        }
        return c;
      },
      async chooseRoot() {
        const dir = await deps.chooseDirectory();
        if (dir === null) return null;
        const { rootDir: _previous, ...saved } = (await loadConfig(deps.userDataDir)) ?? { rootDir: dir, ...settings };
        await saveConfig(deps.userDataDir, { ...saved, rootDir: dir });
        settings = saved;
        l = layout(dir);
        return dir;
      },
      async put(next) {
        const current = await loadConfig(deps.userDataDir);
        if (current === null) throw new Error("shared folder is not configured");
        assertLocalSettings(next);
        const config = { ...next, rootDir: current.rootDir };
        await saveConfig(deps.userDataDir, config);
        settings = next;
        return config;
      },
    },
    project: {
      get: async () => readProject(need()),
      init: async (month) => initProject(need(), month),
      put: async (categories, categoryColors, categoryTemplates) => putCategories(need(), categories, categoryColors, categoryTemplates),
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
      list: async (owner) => listAttachments(need(), owner),
      async add(owner, paths) {
        const chosen = paths ?? (await deps.chooseFiles());
        if (chosen === null || chosen.length === 0) return { added: [], refused: [] };
        return addAttachments(need(), owner, chosen);
      },
      choose: () => deps.chooseFiles(),
      async open(owner, name) {
        assertName(name);
        if (isRefusedExtension(name)) throw new Error("refused-extension"); // a file placed in the folder by hand
        const err = await deps.openPath(join(attachmentDir(need(), owner), name));
        if (err !== "") throw new Error(`open-failed: ${err}`);
      },
      async openFolder(owner) {
        const dir = attachmentDir(need(), owner);
        await mkdirp(dir);
        const err = await deps.openPath(dir);
        if (err !== "") throw new Error(`open-failed: ${err}`);
      },
      remove: async (owner, name) => removeAttachment(need(), owner, name),
    },
    wiki: {
      list: async () => (await wikiCollection(need()).list()).map(withWikiDefaults),
      get: async (id) => {
        const p = await wikiCollection(need()).get(id);
        return p === null ? null : withWikiDefaults(p);
      },
      create: async (p) => createPage(need(), p),
      put: async (p) => putPage(need(), p),
      remove: async (id) => removePage(need(), id),
      history: async (id) => (await wikiCollection(need()).history(id)).map(withWikiDefaults),
    },
  };
}
