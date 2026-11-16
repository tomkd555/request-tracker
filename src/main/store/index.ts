import { promises as fsp } from "node:fs";
import { join } from "node:path";
import type { SaveFilter, StoreApi } from "../../shared/api";
import { assertLocalSettings, DEFAULT_LOCAL_SETTINGS, type Issue, type LocalConfig, type LocalSettings } from "../../shared/types";
import { addAttachments, assertName, attachmentDir, isRefusedExtension, listAttachments, removeAttachment } from "./attachments";
import { mkdirp } from "./collection";
import { addComment, commentsCollection, listAllComments } from "./comments";
import { loadConfig, saveConfig } from "./config";
import { createIssue, issuesCollection, putIssue, removeIssue } from "./issues";
import { assertShareReachable, layoutOf, type Layout } from "./paths";
import { initProject, putCategories, putFields, putLabels, putMilestones, putStatuses, readProject, requireProject } from "./project";
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
const withIssueDefaults = (issue: Issue): Issue => ({
  ...issue,
  category: issue.category ?? "",
  fields: issue.fields ?? {},
  labels: issue.labels ?? [],
  relations: issue.relations ?? [],
  milestone: issue.milestone ?? null,
  estimatedHours: issue.estimatedHours ?? null,
  actualHours: issue.actualHours ?? null,
});

/** Excel reads a UTF-8 CSV as UTF-8 only when the file starts with this mark. */
const UTF8_BOM = "\uFEFF";

/** The store behind the IPC surface. Every file-system access of the app goes through here. */
export function createStore(deps: StoreDeps): StoreApi & { settings(): LocalSettings; warm(): Promise<void> } {
  let currentLayout: Layout | null = null;
  let settings: LocalSettings = DEFAULT_LOCAL_SETTINGS;

  const requireLayout = (): Layout => {
    if (currentLayout === null) throw new Error("shared folder is not configured");
    return currentLayout;
  };

  /** The layout for a write: a share root that is gone (drive offline, folder renamed) rejects before mkdirp could recreate it as an empty tree. */
  const requireReachableLayout = async (): Promise<Layout> => {
    const layout = requireLayout();
    await assertShareReachable(layout.root);
    return layout;
  };

  /** A read that found nothing rejects when the share root is gone, so a dropped drive never shows as an empty project. */
  const readFromShare = async <T>(read: (layout: Layout) => Promise<T>): Promise<T> => {
    const layout = requireLayout();
    const value = await read(layout);
    const foundNothing = value === null || (Array.isArray(value) && value.length === 0);
    if (foundNothing) await assertShareReachable(layout.root);
    return value;
  };

  /** The id the current member's records are stored under: the member who bound this OS login, else the login itself. */
  const currentMemberId = async (layout: Layout): Promise<string> => (await findUser(layout, deps.username))?.username ?? deps.username;

  /** The one place that turns config.json into the layout. */
  const loadLayout = async (): Promise<LocalConfig | null> => {
    const config = await loadConfig(deps.userDataDir);
    if (config !== null) {
      const { rootDir, ...localSettings } = config;
      currentLayout = layoutOf(rootDir);
      settings = localSettings;
    }
    return config;
  };

  /** Save dialog, then `text` as UTF-8; false when the dialog was cancelled. */
  const saveTextAs = async (text: string, defaultName: string, filter: SaveFilter): Promise<boolean> => {
    const path = await deps.chooseSavePath(defaultName, filter);
    if (path === null) return false;
    await fsp.writeFile(path, text, "utf8");
    return true;
  };

  const openWithOs = async (path: string): Promise<void> => {
    const errorMessage = await deps.openPath(path);
    if (errorMessage !== "") throw new Error(`open-failed: ${errorMessage}`);
  };

  return {
    settings: () => settings,
    /** One read of the share at launch, so the first screen finds the listings in memory or joins the read under way. No timer, no repeat; errors are the renderer's to report. */
    async warm() {
      const ignoreError = (): undefined => undefined;
      if ((await loadLayout().catch(ignoreError)) == null) return;
      const layout = requireLayout();
      await Promise.all([usersCollection(layout), issuesCollection(layout), wikiCollection(layout), reportsCollection(layout)].map((records) => records.list().catch(ignoreError)));
    },
    config: {
      get: loadLayout,
      async chooseRoot() {
        const rootDir = await deps.chooseDirectory();
        if (rootDir === null) return null;
        const { rootDir: _previousRootDir, ...savedSettings } = (await loadConfig(deps.userDataDir)) ?? { rootDir, ...settings };
        await saveConfig(deps.userDataDir, { ...savedSettings, rootDir });
        settings = savedSettings;
        currentLayout = layoutOf(rootDir);
        return rootDir;
      },
      async put(nextSettings) {
        const current = await loadConfig(deps.userDataDir);
        if (current === null) throw new Error("shared folder is not configured");
        assertLocalSettings(nextSettings);
        const config = { ...nextSettings, rootDir: current.rootDir };
        await saveConfig(deps.userDataDir, config);
        settings = nextSettings;
        return config;
      },
    },
    project: {
      get: async () => readProject(requireLayout()),
      init: async (fiscalYearStartMonth) => initProject(await requireReachableLayout(), fiscalYearStartMonth),
      put: async (categories, categoryColors, categoryTemplates) => putCategories(await requireReachableLayout(), categories, categoryColors, categoryTemplates),
      putFields: async (fields) => putFields(await requireReachableLayout(), fields),
      putLabels: async (labels) => putLabels(await requireReachableLayout(), labels),
      putStatuses: async (statuses) => putStatuses(await requireReachableLayout(), statuses),
      putMilestones: async (milestones) => putMilestones(await requireReachableLayout(), milestones),
    },
    users: {
      me: async () => readFromShare((layout) => findUser(layout, deps.username)),
      register: async (displayName) => putDisplayName(await requireReachableLayout(), deps.username, displayName),
      list: async () => readFromShare((layout) => usersCollection(layout).list()),
      add: async (displayName) => addUser(await requireReachableLayout(), displayName),
      async rename(username, displayName) {
        const layout = await requireReachableLayout();
        if ((await usersCollection(layout).get(username)) === null) throw new Error(`no such member: ${username}`); // removed on another machine: a rename never brings the member back
        return putDisplayName(layout, username, displayName);
      },
      claim: async (username) => claimUser(await requireReachableLayout(), username, deps.username),
      remove: async (username) => removeUser(await requireReachableLayout(), username),
    },
    issues: {
      list: async () => (await readFromShare((layout) => issuesCollection(layout).list())).map(withIssueDefaults),
      get: async (key) => {
        const issue = await readFromShare((layout) => issuesCollection(layout).get(key));
        return issue === null ? null : withIssueDefaults(issue);
      },
      async create(draft) {
        const project = await requireProject(requireLayout());
        return createIssue(await requireReachableLayout(), project, draft);
      },
      put: async (issue, expectedUpdatedAt) => putIssue(await requireReachableLayout(), issue, expectedUpdatedAt),
      remove: async (key) => removeIssue(await requireReachableLayout(), key),
      history: async (key) => (await readFromShare((layout) => issuesCollection(layout).history(key))).map(withIssueDefaults),
    },
    summary: {
      exportCsv: async (csv, defaultName) => saveTextAs(UTF8_BOM + csv, defaultName, { name: "CSV", extensions: ["csv"] }),
    },
    comments: {
      list: async (key) => readFromShare((layout) => commentsCollection(layout, key).list()),
      add: async (comment) => addComment(await requireReachableLayout(), comment),
      listAll: async () => readFromShare(listAllComments),
    },
    attachments: {
      list: async (owner) => readFromShare((layout) => listAttachments(layout, owner)),
      async add(owner, paths) {
        const chosenPaths = paths ?? (await deps.chooseFiles());
        if (chosenPaths === null || chosenPaths.length === 0) return { added: [], refused: [] };
        return addAttachments(requireLayout(), owner, chosenPaths); // addAttachments itself rejects when the share is gone
      },
      choose: () => deps.chooseFiles(),
      async open(owner, name) {
        assertName(name);
        if (isRefusedExtension(name)) throw new Error("refused-extension"); // a file placed in the folder by hand
        await openWithOs(join(attachmentDir(requireLayout(), owner), name));
      },
      async openFolder(owner) {
        const dir = attachmentDir(await requireReachableLayout(), owner);
        await mkdirp(dir);
        await openWithOs(dir);
      },
      remove: async (owner, name) => removeAttachment(await requireReachableLayout(), owner, name),
    },
    wiki: {
      list: async () => (await readFromShare((layout) => wikiCollection(layout).list())).map(withWikiDefaults),
      get: async (id) => {
        const page = await readFromShare((layout) => wikiCollection(layout).get(id));
        return page === null ? null : withWikiDefaults(page);
      },
      create: async (page) => createPage(await requireReachableLayout(), page),
      put: async (page, expectedUpdatedAt) => putPage(await requireReachableLayout(), page, expectedUpdatedAt),
      remove: async (id) => removePage(await requireReachableLayout(), id),
      history: async (id) => (await readFromShare((layout) => wikiCollection(layout).history(id))).map(withWikiDefaults),
    },
    reports: {
      list: async () => readFromShare((layout) => reportsCollection(layout).list()),
      get: async (id) => readFromShare((layout) => reportsCollection(layout).get(id)),
      create: async (report) => createReport(await requireReachableLayout(), report),
      put: async (report, expectedUpdatedAt) => putReport(await requireReachableLayout(), report, expectedUpdatedAt),
      remove: async (id) => removeReport(await requireReachableLayout(), id),
      save: saveTextAs,
      copy: async (html, text) => deps.writeClipboard(html, text),
    },
    watch: {
      list: async () => readFromShare(async (layout) => readWatch(layout, await currentMemberId(layout))),
      async set(key, shouldWatch) {
        const layout = await requireReachableLayout();
        return setWatch(layout, await currentMemberId(layout), key, shouldWatch);
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
