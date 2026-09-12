import type { Attachment, Comment, Issue, Project, User, WikiPage } from "./types";

export type IssueDraft = Omit<Issue, "key">;
export interface AttachmentRefusal { path: string; reason: "size" | "extension" }
export interface AddAttachmentsResult { added: string[]; refused: AttachmentRefusal[] }
export interface ChangeEvent { collection: string; id: string }

// IPC surface from SPEC-store.md. Each group.method maps to the channel "group:method".
export type StoreApi = {
  config: { get(): Promise<{ rootDir: string } | null>; chooseRoot(): Promise<string | null> };
  project: { get(): Promise<Project | null>; init(fiscalYearStartMonth: number): Promise<Project> };
  users: { me(): Promise<User | null>; register(displayName: string): Promise<User>; list(): Promise<User[]> };
  issues: {
    list(): Promise<Issue[]>;
    get(key: string): Promise<Issue | null>;
    create(draft: IssueDraft): Promise<Issue>;
    put(issue: Issue): Promise<void>;
    remove(key: string): Promise<void>;
    history(key: string): Promise<Issue[]>;
  };
  summary: { exportCsv(csv: string): Promise<boolean> };
  comments: { list(key: string): Promise<Comment[]>; add(c: Comment): Promise<void> };
  attachments: {
    list(key: string): Promise<Attachment[]>;
    add(key: string, paths: string[] | null): Promise<AddAttachmentsResult>;
    open(key: string, name: string): Promise<void>;
    openIssueFolder(key: string): Promise<void>;
    remove(key: string, name: string): Promise<void>;
  };
  wiki: {
    list(): Promise<WikiPage[]>;
    get(id: string): Promise<WikiPage | null>;
    create(p: WikiPage): Promise<void>;
    put(p: WikiPage): Promise<void>;
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
  config: ["get", "chooseRoot"],
  project: ["get", "init"],
  users: ["me", "register", "list"],
  issues: ["list", "get", "create", "put", "remove", "history"],
  summary: ["exportCsv"],
  comments: ["list", "add"],
  attachments: ["list", "add", "open", "openIssueFolder", "remove"],
  wiki: ["list", "get", "create", "put", "remove", "history"],
} as const satisfies { [G in keyof StoreApi]: readonly (keyof StoreApi[G])[] };
