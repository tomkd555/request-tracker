# Request Tracker

A desktop app for a small team to file and track requests without a server. Every client reads and writes a folder of JSON files on a shared network drive; attachments are copied into that folder. The UI is Japanese.

Screenshots: to be added.

## Features

- Parent issues with child issues, each with status, priority, category, labels, assignee, start and due dates, a Markdown description, typed links to other issues (関連, 重複, 先行, with the other side shown as 後続) and the project's custom columns (汎用列: free text or a choice list, never required)
- New-issue form in a fixed order (category, subject, description, then a two-column attribute block) with a Markdown toolbar and preview, a text template per category, a searchable parent field, assign-to-me, attachments dropped before the issue exists, 追加して続ける, and Ctrl+Enter
- Issue detail with the description first, the properties in a sticky sidebar edited in place, and a breadcrumb to the parent
- Issue list with filters (status, assignee, reporter, category, labels, due date, mine, awaiting confirmation, keyword, each choice-list custom column), saved filters per machine, column sort including the custom columns, overdue and due-soon tones, an unseen-update marker, bulk edit of status, assignee, due date and labels over a selection of up to 100 rows, and CSV export
- Kanban board with a column per status in the filter, the same filters and saved filters as the list, and drag to move a card between columns
- Search across issues, comments and wiki pages, grouped by kind with a snippet per hit
- Comments, merged with the field-change feed; a status change can be saved together with a comment
- Attachments as files or whole folders (50 MB per file; executable extensions are refused), opened with the default application or in Explorer
- Edit history with restore, for issues, wiki pages and the project settings; a save over a record someone else changed meanwhile is refused with 「他の人が先に保存しました」 and the screen offers a reload
- Wiki pages in Markdown as a tree (parent page, sidebar, breadcrumb, index), `[[タイトル]]` links that create a missing page on click, a table of contents from the headings, attachments, a change note per save, and a line diff between versions
- Gantt chart of 1, 2, 3 or 6 months: any issue with a start or due date, a late segment past the due date, a parent's span from its children, grouping by assignee, sort by key, subject, assignee, status or due date, folding, and drag to move a bar or one of its edges
- Monthly counts by reporter, assignee, status and category, with CSV export (UTF-8 with BOM, for spreadsheet apps)
- Nothing runs in the background: the app reads the shared folder when a screen opens, after a save, and on 更新 in the nav
- Colour presets (green, blue, grey, dark) with a free accent colour per machine, and a colour per category and per label shared by the team
- Members registered by name in project settings or right from the assignee field (メンバーを追加…), so an issue can be assigned to someone who has yet to open the app; that person picks the name on first launch and it becomes theirs
- Status stages defined per project: name, colour, order, and a kind (活動中, 確認待ち, 完了) that drives the due-date tones, the 確認待ち filter, 確認して完了 and the monthly closed count; a stage can be removed while issues still use it, and those issues read as the first stage
- Two settings screens: 設定 (name, appearance, due-soon window, shared folder; all per machine) and プロジェクト設定 (categories with colours and templates, status stages, labels, members, custom columns; shared by the team)

## How it works

There is no server and no database. The shared folder is the database:

```
<root>/
  project.json                         fiscal year start month, categories with their colours and templates, status stages, labels with their colours, custom column definitions
  users/<username|stamp>.json          a stamp names a member added in project settings; the file gains `login` once that person picks the name
  issues/<KEY>.json                    one issue: fields, label names, typed links written on this side only
  comments/<KEY>/<stamp>-<username>.json
  attachments/<KEY>/<filename>         copied files and folders
  wiki/<id>.json                       title, Markdown body, parent page id, change note
  wiki-attachments/<id>/<filename>     files attached to a wiki page
  history/issues/<KEY>/<stamp>.json    previous versions
  history/wiki/<id>/<stamp>.json
  history/project/<stamp>.json
  trash/issues/<KEY>.json              deleted records; nothing is ever unlinked
  trash/users/<id>.json
  trash/wiki/<id>.json
  trash/attachments/<KEY>/<filename>
  trash/wiki-attachments/<id>/<filename>
```

- A record is written to a temp file in the same directory and renamed over the target, so a client that dies mid-write leaves the old file intact.
- The previous version is copied to `history/` before every overwrite. Deletion moves the file to `trash/`.
- A save carries the `updatedAt` the client last read; when the file on disk holds a newer one, the store refuses the write before anything is copied or written, so the later editor sees the message and reloads. Restoring a version goes through the same check.
- A typed link is stored on the issue it was added to; the other issue shows the inverse when read. A label is stored by name, like a category, so a label removed from the project stays on its issues as a grey chip.
- A client running 0.2.0 keeps the 0.3.0 fields it cannot show (`labels`, `relations`) when it saves, because every save writes the whole record it read.
- An issue's `status` is the id of a stage in `project.json`; the four stages of 0.3.0 keep their ids, so a 0.4.0 client reads older records unchanged. A client older than 0.4.0 skips an issue on a stage added later, so update every client before adding a stage.
- Issue keys are `YY-NNNN`: the two-digit fiscal year and a sequence within it (`26-0001`). The key is claimed with an exclusive create, so two clients creating at the same moment get distinct keys with no counter file.
- Nothing runs in the background. The app reads the shared folder when a screen opens, after its own save, and when 更新 is pressed; a change another person made shows on the next of those. A listing is served from memory while the directory's mtime is unchanged and the listing is under a minute old (every write is a temp file plus a rename inside the directory, so the mtime moves), and a client's own write drops its cache at once. SMB shares deliver no file-watch events reliably, so there is no watcher.
- The current user is the OS username; the name shown to other members is asked once on first launch and stored in `users/`. A member added by name in project settings is a record with a stamp id; when that person launches the app and picks the name, the OS username is written into the record as `login`, so the assignee value on existing issues stays as it is.
- Every record read from the shared folder is validated; a corrupt file is skipped and logged, and never blocks the list.

## Requirements

- Windows 10 or 11
- A shared folder every user can write to (a network drive or a synced folder)

## First launch

1. Download `RequestTracker-<version>.exe` from the Releases page. It is a portable build; there is no installer.
2. Run it. A three-step screen (shared folder, project, name) opens. Pick the shared folder. If the folder holds no project yet, set the fiscal year start month (default April); the app creates `project.json` and the directories.
3. Enter your name, or pick it from the members already registered in project settings. The issue list opens; the next launch opens it directly. When the folder cannot be reached later (drive offline, VPN down), the same screen names the folder and offers to reload or pick another one.

The chosen folder is stored in `%APPDATA%\request-tracker\config.json`, together with the colour preset, accent colour, due-soon window and the saved filters. The settings screen changes any of them, including the folder.

## Development

```
npm install
npm run dev          # one instance with hot reload
npm run dev:second   # a second instance with its own user data, for two-client checks
npm run typecheck    # tsc for main/preload and for the renderer; serves as lint
npx vitest run       # unit tests under tests/, mirroring src/
npm run build        # typecheck and electron-vite build into out/
npm run package      # build and electron-builder, producing dist/RequestTracker-<version>.exe
```

If electron-builder fails while extracting `winCodeSign` with a symlink permission error, enable Windows Developer Mode or run that step once from an administrator shell. The exe is unsigned.

Stack: Electron 39, electron-vite 5, React 19, TypeScript 5.9 (`strict`), `react-markdown`, vitest, plain CSS with the palette in `src/renderer/tokens.css`. Tests cover the store against a real temporary directory and every pure function (filters, key allocation, counts, gantt layout); React components have no automated tests.

Layout:

```
src/main/index.ts        app lifecycle, window, external-link guard
src/main/store/          all file-system access: collections, identity, config
src/main/ipc.ts          IPC handlers; the only path from renderer to the file system
src/preload/index.ts     contextBridge exposing window.api (typed in src/shared/api.ts)
src/shared/types.ts      record types; this file is the schema
src/renderer/            React screens: app shell, issues, kanban, search, wiki, gantt
tests/                   vitest, mirroring src/
```

A `// ponytail:` comment marks a deliberate shortcut and names its ceiling and the upgrade path.

## Security

- The renderer runs with `sandbox`, `contextIsolation` on and `nodeIntegration` off, and reaches the file system only through the typed IPC surface.
- Markdown renders with raw HTML disabled.
- Issue keys and attachment names coming from the renderer or from other people's files are validated before they reach a path.
- Attachments with an extension Windows runs on open (`.exe .bat .cmd .com .ps1 .vbs .vbe .js .jse .wsf .wsh .hta .msi .msp .scr .pif .lnk .url .scf .reg .msc .cpl .jar`) are refused, on adding and on opening alike.
- The app stores no passwords or tokens.

See `SECURITY.md` for how to report a problem.

## Release

Releases are cut by hand. `.github/workflows/ci.yml` type-checks, tests and builds on every push; it publishes nothing. Before a release:

- Set `version` in `package.json` to `X.Y.Z`
- `npm run typecheck`, `npx vitest run` and `npm run package` pass locally
- The exe starts on a machine without Node or this repository
- Two instances pointed at the real network share see each other's changes on the next screen change or 更新, and simultaneous creation yields distinct keys

Two branches carry the code. `master` is the private working branch. `public` is an orphan branch holding one squashed commit per release, and `origin/master` on GitHub is `public`; a pull request merged on GitHub lands on `public` alone and the next squash reverts it, so dependency bumps are applied on `master` by hand. Publishing a release:

```
git checkout public
git read-tree -u --reset master      # the index and worktree become master's tree; HEAD stays on public
git diff master --stat               # prints nothing
git commit -m "X.Y.Z: ..."
git push origin public:master
git tag vX.Y.Z public && git push origin vX.Y.Z
gh release create vX.Y.Z dist/RequestTracker-X.Y.Z.exe --title "X.Y.Z"
git checkout master
```

## License

MIT. See `LICENSE`.
