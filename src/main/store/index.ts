import { promises as fsp } from "node:fs";
import { join } from "node:path";
import type { SaveFilter, StoreApi } from "../../shared/api";
import { assertLocalSettings, DEFAULT_LOCAL_SETTINGS, type Issue, type LocalConfig, type LocalSettings } from "../../shared/types";
import { addAttachments, assertName, attachmentDir, isRefusedExtension, listAttachments, removeAttachment, SHARE_UNREACHABLE } from "./attachments";
import { mkdirp } from "./collection";
import { addComment, commentsCollection, listAllComments } from "./comments";
import { loadConfig, saveConfig } from "./config";
import { createIssue, issuesCollection, putIssue, removeIssue } from "./issues";
import { layout, type Layout } from "./paths";
import { initProject, putCategories, putFields, putLabels, putMilestones, putStatuses, readProject } from "./project";
import { createReport, putReport, removeReport, reportsCollection } from "./reports";
import { addUser, claimUser, findUser, putDisplayName, removeUser, usersCollection } from "./users";
import { readWatch, setWatch } from "./watch";
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
  /** Save dialog offering `filter`; the chosen path, or null when cancelled. */
  chooseSavePath(defaultName: string, filter: SaveFilter): Promise<string | null>;
  /** Open dialog offering `filter`; the chosen path, or null when cancelled. Optional so that a host without file dialogs (the store tests) builds the store; files.openText then resolves to null. */
  chooseOpenPath?(filter: SaveFilter): Promise<string | null>;
  /** Puts HTML and its plain-text form on the clipboard. */
  writeClipboard(html: string, text: string): void | Promise<void>;
}

/** Records written before `category`, `fields`, `labels`, `relations`, `milestone` or the hours existed come back with "", {}, [] and null so the renderer always sees them. */
const withDefaults = (i: Issue): Issue => ({
  ...i,
  category: i.category ?? "",
  fields: i.fields ?? {},
  labels: i.labels ?? [],
  relations: i.relations ?? [],
  milestone: i.milestone ?? null,
  estimatedHours: i.estimatedHours ?? null,
  actualHours: i.actualHours ?? null,
});

/** The store behind the IPC surface. Every file-system access of the app goes through here. */
export function createStore(deps: StoreDeps): StoreApi & { current(): Layout | null; settings(): LocalSettings; warm(): Promise<void> } {
  let l: Layout | null = null;
  let settings: LocalSettings = DEFAULT_LOCAL_SETTINGS;

  const need = (): Layout => {
    if (l === null) throw new Error("shared folder is not configured");
    return l;
  };

  const assertReachable = async (root: string): Promise<void> => {
    await fsp.access(root).catch(() => {
      throw new Error(SHARE_UNREACHABLE);
    });
  };

  /** The layout for a write: a share root that is gone (drive offline, folder renamed) rejects before mkdirp could recreate it as an empty tree. */
  const needRoot = async (): Promise<Layout> => {
    const current = need();
    await assertReachable(current.root);
    return current;
  };

  /** A read that found nothing rejects when the share root is gone, so a dropped drive never shows as an empty project. */
  const read = async <T>(get: (l: Layout) => Promise<T>): Promise<T> => {
    const current = need();
    const value = await get(current);
    if (value === null || (Array.isArray(value) && value.length === 0)) await assertReachable(current.root);
    return value;
  };

  /** The id the current member's records are stored under: the member who bound this OS login, else the login itself. */
  const memberId = async (at: Layout): Promise<string> => (await findUser(at, deps.username))?.username ?? deps.username;

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
      await Promise.all([usersCollection(need()).list().catch(swallow), issuesCollection(need()).list().catch(swallow), wikiCollection(need()).list().catch(swallow), reportsCollection(need()).list().catch(swallow)]);
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
      init: async (month) => initProject(await needRoot(), month),
      put: async (categories, categoryColors, categoryTemplates) => putCategories(await needRoot(), categories, categoryColors, categoryTemplates),
      putFields: async (fields) => putFields(await needRoot(), fields),
      putLabels: async (labels) => putLabels(await needRoot(), labels),
      putStatuses: async (statuses) => putStatuses(await needRoot(), statuses),
      putMilestones: async (milestones) => putMilestones(await needRoot(), milestones),
    },
    users: {
      me: async () => read((l) => findUser(l, deps.username)),
      register: async (displayName) => putDisplayName(await needRoot(), deps.username, displayName),
      list: async () => read((l) => usersCollection(l).list()),
      add: async (displayName) => addUser(await needRoot(), displayName),
      async rename(username, displayName) {
        const current = await needRoot();
        if ((await usersCollection(current).get(username)) === null) throw new Error(`no such member: ${username}`); // removed on another machine: a rename never brings the member back
        return putDisplayName(current, username, displayName);
      },
      claim: async (username) => claimUser(await needRoot(), username, deps.username),
      remove: async (username) => removeUser(await needRoot(), username),
    },
    issues: {
      list: async () => (await read((l) => issuesCollection(l).list())).map(withDefaults),
      get: async (key) => {
        const i = await read((l) => issuesCollection(l).get(key));
        return i === null ? null : withDefaults(i);
      },
      async create(draft) {
        const project = await readProject(need());
        if (project === null) throw new Error("project.json is missing");
        return createIssue(await needRoot(), project, draft);
      },
      put: async (issue, expectedUpdatedAt) => putIssue(await needRoot(), issue, expectedUpdatedAt),
      remove: async (key) => removeIssue(await needRoot(), key),
      history: async (key) => (await read((l) => issuesCollection(l).history(key))).map(withDefaults),
    },
    summary: {
      async exportCsv(csv, defaultName) {
        const path = await deps.chooseSavePath(defaultName, { name: "CSV", extensions: ["csv"] });
        if (path === null) return false;
        await fsp.writeFile(path, "﻿" + csv, "utf8");
        return true;
      },
    },
    comments: {
      list: async (key) => read((l) => commentsCollection(l, key).list()),
      add: async (c) => addComment(await needRoot(), c),
      listAll: async () => read(listAllComments),
    },
    attachments: {
      list: async (owner) => read((l) => listAttachments(l, owner)),
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
        const dir = attachmentDir(await needRoot(), owner);
        await mkdirp(dir);
        const err = await deps.openPath(dir);
        if (err !== "") throw new Error(`open-failed: ${err}`);
      },
      remove: async (owner, name) => removeAttachment(await needRoot(), owner, name),
    },
    wiki: {
      list: async () => (await read((l) => wikiCollection(l).list())).map(withWikiDefaults),
      get: async (id) => {
        const p = await read((l) => wikiCollection(l).get(id));
        return p === null ? null : withWikiDefaults(p);
      },
      create: async (p) => createPage(await needRoot(), p),
      put: async (p, expectedUpdatedAt) => putPage(await needRoot(), p, expectedUpdatedAt),
      remove: async (id) => removePage(await needRoot(), id),
      history: async (id) => (await read((l) => wikiCollection(l).history(id))).map(withWikiDefaults),
    },
    reports: {
      list: async () => read((l) => reportsCollection(l).list()),
      get: async (id) => read((l) => reportsCollection(l).get(id)),
      create: async (r) => createReport(await needRoot(), r),
      put: async (r, expectedUpdatedAt) => putReport(await needRoot(), r, expectedUpdatedAt),
      remove: async (id) => removeReport(await needRoot(), id),
      async save(text, defaultName, filter) {
        const path = await deps.chooseSavePath(defaultName, filter);
        if (path === null) return false;
        await fsp.writeFile(path, text, "utf8");
        return true;
      },
      copy: async (html, text) => deps.writeClipboard(html, text),
    },
    watch: {
      list: async () => read(async (l) => readWatch(l, await memberId(l))),
      async set(key, on) {
        const current = await needRoot();
        return setWatch(current, await memberId(current), key, on);
      },
    },
    files: {
      async openText(filter) {
        const path = (await deps.chooseOpenPath?.(filter)) ?? null;
        if (path === null) return null;
        const bytes = await fsp.readFile(path);
        try {
          return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          return new TextDecoder("shift_jis").decode(bytes); // Excel in Japan writes CSV in this encoding
        }
      },
    },
  };
}
