# Request Tracker

Request Tracker is a portable Windows desktop app that a small team uses to file and track requests without a server. The app calls each request an issue. Every instance of the app reads and writes the same folder of JSON files, kept on a shared network drive or in a synced folder. The UI is in Japanese.

## Features

- Parent and child issues with a status, a priority, a category, labels, an assignee and dates
- Links between issues, each with a link type
- Custom columns per project
- Issue list with filters, saved filters, bulk edit and CSV export
- Kanban board and Gantt chart, with drag-and-drop for cards and bars
- Comments, attachments as files or whole folders, and an edit history from which you can restore earlier versions
- Markdown wiki pages arranged in a tree, with `[[タイトル]]` links and a diff between versions
- Search across issues, comments and wiki pages
- Monthly issue counts
- Reports for people outside the team, exported as HTML or Markdown
- Categories, status stages, labels, members and templates defined per project

## Install

1. Download `RequestTracker-<version>.exe` from [Releases](https://github.com/tomkd555/request-tracker/releases). It is an unsigned, portable build that runs without installation.
2. Run it and pick the shared folder. If the folder does not hold a project yet, the app creates a new project in it.
3. Enter your name, or pick it from the list of existing members. The issue list opens.

Requirements: Windows 10 or later, and a shared folder every user can write to.

## How it works

The shared folder is the database: one JSON file per issue, comment, wiki page and report, with the attachments copied alongside them.

- The app writes each record to a temp file and then renames it over the target, so an instance of the app that stops mid-write leaves the old file intact.
- Before it overwrites an issue, a wiki page, a report or `project.json`, the app copies the previous version to `history/`. Deleting a record moves its file to `trash/`.
- If someone else changed an issue or a wiki page after you opened it, the app rejects your save and offers to reload it.
- Issue keys take the form `YY-NNNN`, where `YY` is the fiscal year and `NNNN` is a sequence number. The app claims each key by creating its file in exclusive mode, so two instances of the app that create an issue at the same moment get different keys.
- The app reads the shared folder when a screen opens, after each save and when you press 更新 (refresh). It does not watch the folder between these reads.

## Development

```
npm install
npm run dev          # one instance with hot reload
npm run dev:second   # a second instance with its own user data, for two-client checks
npm run typecheck    # tsc for main/preload and for the renderer
npm run package      # build and electron-builder, producing dist/RequestTracker-<version>.exe
```

Stack: Electron, electron-vite, React and TypeScript.

Source layout:

```
src/main/store/          all file-system access: collections, identity, config
src/main/ipc.ts          IPC handlers; the only path from renderer to the file system
src/preload/index.ts     contextBridge exposing window.api (typed in src/shared/api.ts)
src/shared/types.ts      record types; this file is the schema
src/renderer/            React screens: app shell, issues, kanban, search, wiki, gantt, reports
```

## Security

- The renderer runs with `sandbox` and `contextIsolation` on and `nodeIntegration` off, and reaches the file system only through the typed IPC handlers.
- Markdown renders with raw HTML disabled.
- The app refuses to add or open an attachment with an executable extension.
- The app does not store passwords or tokens.

To report a vulnerability, use "Report a vulnerability" under the repository's Security tab.

## License

MIT. See `LICENSE`. Request Tracker is a descriptive name that other products also use. This app is not affiliated with any of them. The packages bundled into the exe are listed with their licenses in `THIRD-PARTY-NOTICES.txt`.
