import type { Attachment, CategoryTemplate, Comment, Issue, LocalConfig, LocalSettings, Project, User, WikiPage } from "./types";

export type IssueDraft = Omit<Issue, "key">;
export interface AttachmentRefusal { path: string; reason: "size" | "extension" | "link" }
/** What an attachment belongs to: an issue by key, or a wiki page by id. */
export type AttachmentOwner = { kind: "issue"; id: string } | { kind: "wiki"; id: string };
export interface AddAttachmentsResult { added: string[]; refused: AttachmentRefusal[] }
export interface ChangeEvent { collection: string; id: string }

// IPC surface between renderer and main. Each group.method maps to the channel "group:method".
export type StoreApi = {
  config: {
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
  };
  users: { me(): Promise<User | null>; register(displayName: string): Promise<User>; list(): Promise<User[]> };
  issues: {
    list(): Promise<Issue[]>;
    get(key: string): Promise<Issue | null>;
    create(draft: IssueDraft): Promise<Issue>;
    put(issue: Issue): Promise<void>;
    remove(key: string): Promise<void>;
    history(key: string): Promise<Issue[]>;
  };
  summary: { exportCsv(csv: string, defaultName: string): Promise<boolean> };
  comments: { list(key: string): Promise<Comment[]>; add(c: Comment): Promise<void> };
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
    /** Rejects with "cycle" when parentId is the page itself or one of its descendants. */
    put(p: WikiPage): Promise<void>;
    /** Rejects with "has-children" while other pages name this one as their parent. */
    remove(id: string): Promise<void>;
    history(id: string): Promise<WikiPage[]>;
  };
};

export type Api = StoreApi & {
  onChanged(cb: (e: ChangeEvent) => void): () => void;
  /** Absolute path of a File dropped on the window (Electron webUtils). */
  pathForFile(file: File): string;
};

export const API_METHODS = {
  config: ["get", "chooseRoot", "put"],
  project: ["get", "init", "put"],
  users: ["me", "register", "list"],
  issues: ["list", "get", "create", "put", "remove", "history"],
  summary: ["exportCsv"],
  comments: ["list", "add"],
  attachments: ["list", "add", "choose", "open", "openFolder", "remove"],
  wiki: ["list", "get", "create", "put", "remove", "history"],
} as const satisfies { [G in keyof StoreApi]: readonly (keyof StoreApi[G])[] };
