import { promises as fsp } from "node:fs";
import { join } from "node:path";
import type { StoreApi } from "../../shared/api";
import { assertLocalSettings, DEFAULT_LOCAL_SETTINGS, type Issue, type LocalConfig, type LocalSettings } from "../../shared/types";
import { addAttachments, assertName, attachmentDir, isRefusedExtension, listAttachments, removeAttachment } from "./attachments";
import { mkdirp } from "./collection";
import { addComment, commentsCollection, listAllComments } from "./comments";
import { loadConfig, saveConfig } from "./config";
import { createIssue, issuesCollection, putIssue, removeIssue } from "./issues";
import { layout, type Layout } from "./paths";
import { initProject, putCategories, putFields, putLabels, putStatuses, readProject } from "./project";
import { addUser, claimUser, findUser, putDisplayName, removeUser, usersCollection } from "./users";
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

/** Records written before `category`, `fields`, `labels` or `relations` existed come back with "", {} and [] so the renderer always sees them. */
const withDefaults = (i: Issue): Issue => ({ ...i, category: i.category ?? "", fields: i.fields ?? {}, labels: i.labels ?? [], relations: i.relations ?? [] });

/** The store behind the IPC surface. Every file-system access of the app goes through here. */
export function createStore(deps: StoreDeps): StoreApi & { current(): Layout | null; settings(): LocalSettings; warm(): Promise<void> } {
  let l: Layout | null = null;
  let settings: LocalSettings = DEFAULT_LOCAL_SETTINGS;

  const need = (): Layout => {
    if (l === null) throw new Error("shared folder is not configured");
    return l;
  };

  /** The one place that turns config.json into the layout. */
  const loadLayout = async (): Promise<LocalConfig | null> => {
    const c = await loadConfig(deps.userDataDir);
    if (c !== null) {
      const { rootDir, ...rest } = c;
      l = layout(rootDir);
      settings = rest;
    }
    return c;
  };

  return {
    current: () => l,
    settings: () => settings,
    /** One read of the share at launch, so the first screen finds the listings in memory or joins the read under way. No timer, no repeat; errors are the renderer's to report. */
    async warm() {
      const swallow = (): undefined => undefined;
      if ((await loadLayout().catch(swallow)) == null) return;
      await Promise.all([usersCollection(need()).list().catch(swallow), issuesCollection(need()).list().catch(swallow), wikiCollection(need()).list().catch(swallow)]);
    },
    config: {
      get: loadLayout,
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
      putFields: async (fields) => putFields(need(), fields),
      putLabels: async (labels) => putLabels(need(), labels),
      putStatuses: async (statuses) => putStatuses(need(), statuses),
    },
    users: {
      me: async () => findUser(need(), deps.username),
      register: async (displayName) => putDisplayName(need(), deps.username, displayName),
      list: async () => usersCollection(need()).list(),
      add: async (displayName) => addUser(need(), displayName),
      rename: async (username, displayName) => putDisplayName(need(), username, displayName),
      claim: async (username) => claimUser(need(), username, deps.username),
      remove: async (username) => removeUser(need(), username),
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
      put: async (issue, expectedUpdatedAt) => putIssue(need(), issue, expectedUpdatedAt),
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
      listAll: async () => listAllComments(need()),
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
      put: async (p, expectedUpdatedAt) => putPage(need(), p, expectedUpdatedAt),
      remove: async (id) => removePage(need(), id),
      history: async (id) => (await wikiCollection(need()).history(id)).map(withWikiDefaults),
    },
  };
}
