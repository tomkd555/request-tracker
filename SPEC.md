# Spec: Request Tracker

Shared sections for every module. Module specs (`SPEC-store.md`, `SPEC-issues.md`, `SPEC-wiki.md`, `SPEC-gantt.md`) add their own objective, data, behaviour and success criteria and inherit everything here.

## Objective

An Electron desktop app for about a dozen people at one site to file and track requests. The layout, vocabulary and palette follow Nulab Backlog. Requesters file a parent issue with child issues; assignees work them; both see the same list.

There is no server. Every client reads and writes a folder of JSON files on a shared network drive. Attachments are copied into that folder.

Users: colleagues who file requests, and the people who handle them. UI language: Japanese. Platform: Windows 10 and 11.

Success, from the confirmed intent:

- Every open request and its child tasks are visible in one list.
- A requester sees progress without asking the assignee.
- Counts per requester, assignee and status for a chosen month can be produced and exported.

Out of scope for v1: board, notifications, Git, any connection to Nulab Backlog, login, custom fields, logo and icon assets.

## Tech Stack

- Electron 39 (installed by the electron-vite 5 template on 2026-09-12), electron-vite 5, Vite 7, React 19, TypeScript 5.9 with `strict`
- `react-markdown` for issue descriptions and wiki pages; raw HTML in Markdown stays disabled
- `electron-builder` with target `portable` for Windows x64
- `vitest`
- Plain CSS. Palette and spacing live as CSS variables in `src/renderer/tokens.css`; values are Backlog's, sampled from the product screenshots on backlog.com/ja/function/ (the file comments name the screen per colour).
- No database, no ORM, no state library, no CSS framework, no file-watcher library.

## Commands

```
Scaffold: npm create @quick-start/electron@latest . -- --template react-ts
Dev:      npm run dev
Typecheck (serves as lint): npm run typecheck
Test:     npx vitest run
Build:    npm run build
Package:  npm run build && npx electron-builder --win portable
```

`npm run typecheck` runs `tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json`. `npm run package` is the build plus the electron-builder step; the result is `dist/RequestTracker-<version>.exe`, a portable build with no installer and no code signing. If electron-builder fails while extracting `winCodeSign` (a symlink permission error), enable Windows Developer Mode or run that step once from an administrator shell. `npm run dev:second` starts a second instance with its own user data for two-client checks.

## Project Structure

```
src/main/index.ts        app lifecycle, window, first-launch dialogs
src/main/store/          module store: fs access, poller, identity, config
src/main/ipc.ts          IPC handlers; the only path from renderer to the file system
src/preload/index.ts     contextBridge exposing window.api (typed in src/shared/api.ts)
src/shared/types.ts      record types; this file is the schema
src/shared/api.ts        IPC surface type
src/renderer/app/        shell: left nav, routing, current user, first-launch screens
src/renderer/issues/     module issues
src/renderer/wiki/       module wiki
src/renderer/gantt/      module gantt
src/renderer/tokens.css  palette, spacing, type scale
tests/                   vitest; mirrors src/ paths (tests/main/store/…, tests/renderer/issues/…)
```

## Code Style

```ts
// src/renderer/issues/filterIssues.ts
import type { Issue, IssueStatus } from "../../shared/types";

export interface IssueFilter {
  statuses: IssueStatus[];
  assignee: string | null;
  reporter: string | null;
  keyword: string;
}

export function filterIssues(issues: Issue[], filter: IssueFilter): Issue[] {
  const kw = filter.keyword.trim().toLowerCase();
  return issues.filter(
    (i) =>
      filter.statuses.includes(i.status) &&
      (filter.assignee === null || i.assignee === filter.assignee) &&
      (filter.reporter === null || i.reporter === filter.reporter) &&
      (kw === "" || i.summary.toLowerCase().includes(kw) || i.key.toLowerCase().includes(kw)),
  );
}
```

- Prettier defaults (2 spaces, double quotes, semicolons, trailing commas).
- Named exports. One React component per file, function components, hooks prefixed `use`.
- Pure logic (filters, counts, layout) is a plain function in its own file so vitest can import it without React.
- Record types in `src/shared/types.ts` are the schema, declared as `interface`; unions and aliases stay `type`. Adding a field means editing that file and the module spec. `any` is never used.
- CSS class names follow BEM (`block__element--modifier`); colours live only in `tokens.css`. Body text is 16px and nothing goes below 14px, except an ASCII-only label of at most 24 characters, which may go down to 12px.
- IPC channel names are `collection:verb` (`issues:put`, `store:changed`).
- Timestamps are ISO 8601 strings with timezone; day-only dates are `YYYY-MM-DD`.
- Identifiers in code are English. User-visible strings are Japanese and live in the component that renders them.
- A deliberate shortcut carries a `// ponytail:` comment naming the ceiling and the upgrade path.

## Testing Strategy

- `vitest`, tests under `tests/` mirroring `src/`.
- `store`: every write path exercised against a real temporary directory (`fs.mkdtemp`); atomic write, exclusive create, history copy, trash move, poller diff.
- `issues`, `wiki`, `gantt`: pure functions (filter, key allocation, monthly counts, gantt layout) with one test per branch.
- React components: no automated tests in v1.
- Manual check before each release: two instances on one machine pointed at the same folder; an issue created in one appears in the other within 10 s.

## Boundaries

Always:

- Run `npm run typecheck` and `npx vitest run` before a commit.
- Access the file system from `src/main/store/` only.
- Write a record by writing a temp file in the same directory and renaming it over the target.
- Copy the current record to `history/` before overwriting it.
- Treat the shared folder as untrusted input: validate every record on read; a record that fails validation is skipped and logged, and never blocks the list.
- Keep Markdown rendering with raw HTML disabled.

Ask first:

- Adding a dependency.
- Adding, renaming or removing a field in `src/shared/types.ts`.
- Changing the shared-folder layout in `SPEC-store.md`.
- Changing `electron-builder` configuration or the packaging target.

Never:

- Commit a real shared-folder path, real records, or attachments.
- Hard-delete a file under the shared folder; deletion moves the file to `trash/`.
- Store passwords or tokens anywhere; the app has none.
- Enable `nodeIntegration` or disable `contextIsolation` in the renderer.

## Success Criteria

- `npx electron-builder --win portable` produces one `.exe` that runs on a clean Windows 11 machine without installation.
- First launch asks for the shared folder and a display name; the second launch asks nothing and opens the issue list.
- Two instances on the same folder: a change saved in one is visible in the other within 10 s.
- `npm run typecheck` and `npx vitest run` pass.
- Each module meets the criteria in its own spec.

## Open Questions

- Fiscal year start month for issue keys (`26-0001` = first issue of the fiscal year starting April 2026). Default 4, set on first launch and stored in `<root>/project.json`.
- Status set. Default Backlog's four: 未対応 / 処理中 / 処理済み / 完了 (`open`, `in_progress`, `resolved`, `closed`).
- Priority set. Default 高 / 中 / 低 (`high`, `normal`, `low`).
