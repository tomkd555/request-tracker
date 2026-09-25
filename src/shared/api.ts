import type { Attachment, CategoryTemplate, Comment, CustomField, Issue, Label, LocalConfig, LocalSettings, Project, Report, StatusDef, User, WikiPage } from "./types";

export type IssueDraft = Omit<Issue, "key">;
export interface AttachmentRefusal { path: string; reason: "size" | "extension" | "link" }
/** What an attachment belongs to: an issue by key, or a wiki page by id. */
export type AttachmentOwner = { kind: "issue"; id: string } | { kind: "wiki"; id: string };
export interface AddAttachmentsResult { added: string[]; refused: AttachmentRefusal[] }
/** File type offered by the save dialog. */
export interface SaveFilter { name: string; extensions: string[] }

// IPC surface between renderer and main. Each group.method maps to the channel "group:method".
export type StoreApi = {
  config: {
    /** Reads the per-machine config and points the store at the shared folder it names; every other method needs it first. */
    get(): Promise<LocalConfig | null>;
    chooseRoot(): Promise<string | null>;
    /** Replaces the per-machine settings; rootDir stays. */
    put(settings: LocalSettings): Promise<LocalConfig>;
  };
  project: {
    get(): Promise<Project | null>;
    init(fiscalYearStartMonth: number): Promise<Project>;
    /** Replaces the 種別 list, its colours and its templates; other fields stay as on disk. */
    put(categories: string[], categoryColors: Record<string, string>, categoryTemplates: Record<string, CategoryTemplate>): Promise<Project>;
    /** Replaces the 汎用列 definitions; other fields stay as on disk. */
    putFields(fields: CustomField[]): Promise<Project>;
    /** Replaces the ラベル definitions; other fields stay as on disk. */
    putLabels(labels: Label[]): Promise<Project>;
    /** Replaces the 状態 stages; other fields stay as on disk. An issue on a removed stage reads as the first stage. */
    putStatuses(statuses: StatusDef[]): Promise<Project>;
  };
  users: {
    /** The record keyed by the OS login, or the member who bound that login with `claim`. */
    me(): Promise<User | null>;
    /** Creates or renames the current user's own record under the OS login (first launch). */
    register(displayName: string): Promise<User>;
    list(): Promise<User[]>;
    /** A member added by name; the username is a file stamp. A name already registered resolves to that member. */
    add(displayName: string): Promise<User>;
    rename(username: string, displayName: string): Promise<User>;
    /** Binds the OS login to a member added by name; rejects with "already-claimed" once bound. */
    claim(username: string): Promise<User>;
    /** Rejects with "in-use" while an issue names the member as assignee or reporter. */
    remove(username: string): Promise<void>;
  };
  issues: {
    list(): Promise<Issue[]>;
    get(key: string): Promise<Issue | null>;
    /** Rejects with "too-deep" when parentKey sits on level MAX_DEPTH (see issueTree). */
    create(draft: IssueDraft): Promise<Issue>;
    /**
     * Rejects with "cycle" when parentKey is the issue or one under it, with "too-deep" when the chain would pass MAX_DEPTH
     * levels, or with "stale" when `expectedUpdatedAt` is given and no longer matches the record on disk (or the record is gone).
     */
    put(issue: Issue, expectedUpdatedAt?: string): Promise<void>;
    remove(key: string): Promise<void>;
    history(key: string): Promise<Issue[]>;
  };
  summary: { exportCsv(csv: string, defaultName: string): Promise<boolean> };
  comments: {
    list(key: string): Promise<Comment[]>;
    add(c: Comment): Promise<void>;
    /** One pass over every issue's comments, for the search screen. */
    listAll(): Promise<Comment[]>;
  };
  attachments: {
    list(owner: AttachmentOwner): Promise<Attachment[]>;
    add(owner: AttachmentOwner, paths: string[] | null): Promise<AddAttachmentsResult>;
    /** Opens the file picker without copying; the new-issue form adds the paths once the key exists. */
    choose(): Promise<string[] | null>;
    open(owner: AttachmentOwner, name: string): Promise<void>;
    openFolder(owner: AttachmentOwner): Promise<void>;
    remove(owner: AttachmentOwner, name: string): Promise<void>;
  };
  wiki: {
    list(): Promise<WikiPage[]>;
    get(id: string): Promise<WikiPage | null>;
    /** Resolves to the page with its allocated id. */
    create(p: WikiPage): Promise<WikiPage>;
    /** Rejects with "cycle" when parentId is the page itself or one of its descendants, or with "stale" per `expectedUpdatedAt` (see issues.put). */
    put(p: WikiPage, expectedUpdatedAt?: string): Promise<void>;
    /** Rejects with "has-children" while other pages name this one as their parent. */
    remove(id: string): Promise<void>;
    history(id: string): Promise<WikiPage[]>;
  };
  reports: {
    list(): Promise<Report[]>;
    get(id: string): Promise<Report | null>;
    /** Resolves to the report with its allocated id. */
    create(r: Report): Promise<Report>;
    /** Rejects with "stale" per `expectedUpdatedAt` (see issues.put). */
    put(r: Report, expectedUpdatedAt?: string): Promise<void>;
    remove(id: string): Promise<void>;
    /** Save dialog filtered to `filter`, then the text as UTF-8; false when cancelled. */
    save(text: string, defaultName: string, filter: SaveFilter): Promise<boolean>;
    /** Puts the rendered report on the clipboard as HTML, with `text` as the plain-text form. */
    copy(html: string, text: string): Promise<void>;
  };
};

export type Api = StoreApi & {
  /** Absolute path of a File dropped on the window (Electron webUtils). */
  pathForFile(file: File): string;
};

export const API_METHODS = {
  config: ["get", "chooseRoot", "put"],
  project: ["get", "init", "put", "putFields", "putLabels", "putStatuses"],
  users: ["me", "register", "list", "add", "rename", "claim", "remove"],
  issues: ["list", "get", "create", "put", "remove", "history"],
  summary: ["exportCsv"],
  comments: ["list", "add", "listAll"],
  attachments: ["list", "add", "choose", "open", "openFolder", "remove"],
  wiki: ["list", "get", "create", "put", "remove", "history"],
  reports: ["list", "get", "create", "put", "remove", "save", "copy"],
} as const satisfies { [G in keyof StoreApi]: readonly (keyof StoreApi[G])[] };
