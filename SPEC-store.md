# Spec: store

Module id `store`. Inherits the shared sections of `SPEC.md`.

## Objective

The single path between the app and the shared folder. Runs in the main process. Provides typed read/write of one-record-per-file collections, change detection by polling, identification of the current user, and the local config that names the shared folder.

## Shared-folder layout

```
<root>/
  project.json                         { fiscalYearStartMonth, createdAt, categories }
  users/<username>.json                User
  issues/<KEY>.json                    Issue
  comments/<KEY>/<createdAt>-<username>.json   Comment
  attachments/<KEY>/<filename>         copied files
  wiki/<id>.json                       WikiPage
  history/issues/<KEY>/<updatedAt>.json        previous Issue versions
  history/wiki/<id>/<updatedAt>.json           previous WikiPage versions
  history/project/<stamp>.json                 previous project.json versions
  trash/issues/<KEY>.json              deleted issues
  trash/wiki/<id>.json                 deleted pages
  trash/attachments/<KEY>/<filename>   deleted attachments
```

`<updatedAt>` and `<createdAt>` in file names use `YYYYMMDDTHHmmssSSSZ` so names sort chronologically. Every file is UTF-8 JSON, pretty-printed with two spaces.

Local config: `app.getPath("userData")/config.json` holding `{ rootDir }`.

## Records

```ts
export type Project = { fiscalYearStartMonth: number; createdAt: string; categories: string[] }; // month 1–12, default 4; categories default 問い合わせ / 不具合 / 依頼 / その他 and are filled in on read when absent
export type User = { username: string; displayName: string; createdAt: string };
export type Attachment = { name: string; kind: "file" | "folder"; size: number | null; addedAt: string }; // derived from stat, never stored; size is null for a folder
```

Other record types are owned by their module specs.

## Behaviour

- **Write**: serialise to `<dir>/.<name>.tmp-<pid>`, then `fs.rename` over `<dir>/<name>`. If the target exists and the collection keeps history, copy the existing file to `history/…/<updatedAt of the old record>.json` first.
- **Create**: `fs.writeFile` with flag `wx`. On `EEXIST` the caller retries with a new id. This is how issue keys stay unique with no counter file.
- **Read**: parse and validate against the collection's type guard. A file that fails to parse or validate is skipped and logged with its path.
- **Remove**: `fs.rename` into `trash/<collection>/`. Nothing under `<root>` is ever unlinked.
- **Attachments**: `attachments/<KEY>/` is created when the issue is created. A file is copied to `attachments/<KEY>/.<name>.tmp-<pid>` and renamed to the final name; a folder is copied recursively (`fs.cp`) into `attachments/<KEY>/.<name>.tmp-<pid>/` and the directory renamed. The final name is claimed with an exclusive create (`wx` probe, then rename); on `EEXIST` bump the ` (n)` suffix and retry. Size and extension checks run per file before any write; inside a folder, a refused file is skipped and reported. Listing is `readdir` + `stat` of the top level; there is no metadata file. Opening a file uses `shell.openPath`, opening a folder or the issue folder uses `shell.openPath` on the directory, removing renames into `trash/attachments/<KEY>/`. Rules for limits, refused extensions and messages are in `SPEC-issues.md`.
- **Drag-and-drop paths**: the preload exposes `webUtils.getPathForFile(file)` so the renderer can hand absolute paths to `attachments.add`.
- **Poller**: every 5 s, `stat` of `project.json` (collection `project`, id `project`) and `readdir` + `stat` of `issues/`, `comments/*/`, `attachments/*/`, `wiki/`, `users/`; compare `mtimeMs` and size with the last snapshot; emit `store:changed` with `{ collection, id }` per difference. `fs.watch` is excluded because SMB shares deliver no events reliably. `// ponytail: full rescan every 5 s; switch to per-directory mtimes if the folder grows past a few thousand files`.
- **Project settings**: `project.put(categories)` re-reads `project.json`, copies it to `history/project/<stamp>.json`, replaces `categories` only (trimmed, empty lines and duplicates dropped, at least one required) and writes it atomically.
- **Defaults on read**: an issue record without `category` is returned with `""` from `list`, `get` and `history`; a `project.json` without `categories` is returned with the default list.
- **Identity**: `os.userInfo().username`. If `users/<username>.json` is absent, the renderer shows the display-name screen and the store creates it.
- **First launch**: if `config.json` is absent, the renderer shows a folder picker (`dialog.showOpenDialog` with `openDirectory`). If the chosen folder has no `project.json`, ask for the fiscal year start month (default 4) and create `project.json` and the collection directories.

## IPC surface

```ts
export type Api = {
  config: { get(): Promise<{ rootDir: string } | null>; chooseRoot(): Promise<string | null> };
  project: { get(): Promise<Project | null>; init(fiscalYearStartMonth: number): Promise<Project>; put(categories: string[]): Promise<Project> };
  users: { me(): Promise<User | null>; register(displayName: string): Promise<User>; list(): Promise<User[]> };
  issues: {
    list(): Promise<Issue[]>;
    get(key: string): Promise<Issue | null>;
    create(draft: Omit<Issue, "key">): Promise<Issue>; // main allocates the key from issues/ and trash/issues/
    put(issue: Issue): Promise<void>;
    remove(key: string): Promise<void>;
    history(key: string): Promise<Issue[]>;
  };
  summary: { exportCsv(csv: string, defaultName: string): Promise<boolean> }; // save dialog with that default file name, UTF-8 with BOM; false when cancelled; used by 集計 and by the issue list
  comments: { list(key: string): Promise<Comment[]>; add(c: Comment): Promise<void> };
  attachments: {
    list(key: string): Promise<Attachment[]>;
    add(key: string, paths: string[] | null): Promise<{ added: string[]; refused: { path: string; reason: "size" | "extension" }[] }>; // null opens the file dialog; a path may be a folder
    open(key: string, name: string): Promise<void>;      // file with default app, folder in Explorer
    openIssueFolder(key: string): Promise<void>;         // attachments/<KEY>/ in Explorer
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
  onChanged(cb: (e: { collection: string; id: string }) => void): () => void;
};
```

`attachments.add` with `paths: null` opens the file dialog in main; with paths it copies those files. Either way it returns what was added and what was refused, so the renderer can show one message per refusal. `wiki.create` allocates the id from `createdAt` and, when that stamp is taken, retries at the next millisecond; `issues.create` retries the key the same way and returns the record with its allocated key. Neither surfaces `EEXIST` to the renderer.

## Success Criteria

- Writing a record leaves either the old file or the new file on disk after a simulated failure between write and rename (test: temp file present, target intact).
- Two concurrent `create` calls with the same id: exactly one succeeds, the other gets `EEXIST`.
- Overwriting an issue produces one file in `history/issues/<KEY>/` with the old content.
- `remove` moves the file to `trash/` and the collection listing no longer contains it.
- A corrupt JSON file in `issues/` is skipped; `issues.list()` returns the other records.
- Poller test: touching a file in `issues/` yields one `store:changed` event within one poll cycle.
- Attachment copy interrupted after the temp file is written: the final name is absent from `list()` and the temp file is the only leftover.
- Two concurrent `add` calls with the same file name yield `name.ext` and `name (2).ext`.
- Adding a folder whose subfolder holds a `.bat` copies every other file, leaves the `.bat` out, and returns it under `refused`.

## Open Questions

- Poll interval. Default 5 s.
