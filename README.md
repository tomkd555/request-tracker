# Request Tracker

A desktop app for a small team to file and track requests without a server. Every client reads and writes a folder of JSON files on a shared network drive; attachments are copied into that folder. The UI is Japanese.

Screenshots: to be added.

## Features

- Parent issues with child issues, each with status, priority, category, assignee, start and due dates and a Markdown description
- New-issue form in a fixed order (category, subject, description, then a two-column attribute block) with a Markdown toolbar and preview, a text template per category, a searchable parent field, assign-to-me, attachments dropped before the issue exists, 追加して続ける, and Ctrl+Enter
- Issue detail with the description first, the properties in a sticky sidebar edited in place, and a breadcrumb to the parent
- Issue list with filters (status, assignee, reporter, category, due date, mine, awaiting confirmation, keyword), column sort, overdue and due-soon tones, an unseen-update marker and CSV export
- Comments, merged with the field-change feed; a status change can be saved together with a comment
- Attachments as files or whole folders (50 MB per file; executable extensions are refused), opened with the default application or in Explorer
- Edit history with restore, for issues, wiki pages and the project settings
- Wiki pages in Markdown as a tree (parent page, sidebar, breadcrumb, index), `[[タイトル]]` links that create a missing page on click, a table of contents from the headings, attachments, a change note per save, and a line diff between versions
- Gantt chart of 1, 2, 3 or 6 months: any issue with a start or due date, a late segment past the due date, a parent's span from its children, grouping by assignee, folding, and drag to move a bar or one of its edges
- Monthly counts by reporter, assignee, status and category, with CSV export (UTF-8 with BOM, for spreadsheet apps)
- Live refresh across clients: every client polls the shared folder every 5 seconds by default
- Colour presets (green, blue, grey, dark) with a free accent colour per machine, and a colour per category shared by the team
- Settings screen in two groups: 個人設定 (name, appearance, due-soon window, poll interval, shared folder; all per machine) and プロジェクト設定 (the category list with colours and templates)

## How it works

There is no server and no database. The shared folder is the database:

```
<root>/
  project.json                         fiscal year start month, categories with their colours and templates
  users/<username>.json
  issues/<KEY>.json
  comments/<KEY>/<stamp>-<username>.json
  attachments/<KEY>/<filename>         copied files and folders
  wiki/<id>.json                       title, Markdown body, parent page id, change note
  wiki-attachments/<id>/<filename>     files attached to a wiki page
  history/issues/<KEY>/<stamp>.json    previous versions
  history/wiki/<id>/<stamp>.json
  history/project/<stamp>.json
  trash/issues/<KEY>.json              deleted records; nothing is ever unlinked
  trash/wiki/<id>.json
  trash/attachments/<KEY>/<filename>
  trash/wiki-attachments/<id>/<filename>
```

- A record is written to a temp file in the same directory and renamed over the target, so a client that dies mid-write leaves the old file intact.
- The previous version is copied to `history/` before every overwrite. Deletion moves the file to `trash/`.
- Issue keys are `YY-NNNN`: the two-digit fiscal year and a sequence within it (`26-0001`). The key is claimed with an exclusive create, so two clients creating at the same moment get distinct keys with no counter file.
- Change detection polls `stat` of the collection directories every 5 seconds by default (2–60 seconds, set per machine). SMB shares deliver no file-watch events reliably, so there is no watcher.
- The current user is the OS username; the name shown to other members is asked once on first launch and stored in `users/`.
- Every record read from the shared folder is validated; a corrupt file is skipped and logged, and never blocks the list.

## Requirements

- Windows 10 or 11
- A shared folder every user can write to (a network drive or a synced folder)

## First launch

1. Download `RequestTracker-<version>.exe` from the Releases page. It is a portable build; there is no installer.
2. Run it. A three-step screen (shared folder, project, name) opens. Pick the shared folder. If the folder holds no project yet, set the fiscal year start month (default April); the app creates `project.json` and the directories.
3. Enter your name. The issue list opens; the next launch opens it directly. When the folder cannot be reached later (drive offline, VPN down), the same screen names the folder and offers to reload or pick another one.

The chosen folder is stored in `%APPDATA%\request-tracker\config.json`, together with the colour preset, accent colour, due-soon window and poll interval. The settings screen changes any of them, including the folder.

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
src/main/store/          all file-system access: collections, poller, identity, config
src/main/ipc.ts          IPC handlers; the only path from renderer to the file system
src/preload/index.ts     contextBridge exposing window.api (typed in src/shared/api.ts)
src/shared/types.ts      record types; this file is the schema
src/renderer/            React screens: app shell, issues, wiki, gantt
tests/                   vitest, mirroring src/
```

A `// ponytail:` comment marks a deliberate shortcut and names its ceiling and the upgrade path.

## Security

- The renderer runs with `sandbox`, `contextIsolation` on and `nodeIntegration` off, and reaches the file system only through the typed IPC surface.
- Markdown renders with raw HTML disabled.
- Issue keys and attachment names coming from the renderer or from other people's files are validated before they reach a path.
- Attachments with executable extensions (`.exe .bat .cmd .com .ps1 .vbs .js .msi .scr .lnk`) are refused.
- The app stores no passwords or tokens.

See `SECURITY.md` for how to report a problem.

## Release checklist

Before publishing a new exe:

- `npm run typecheck`, `npx vitest run` and `npm run package` pass
- The exe starts on a machine without Node or this repository
- Two instances pointed at the real network share see each other's changes within 10 seconds, and simultaneous creation yields distinct keys

## License

MIT. See `LICENSE`.
