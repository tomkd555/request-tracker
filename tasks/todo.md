# Tasks: Request Tracker

Verification commands for every task: `npm run typecheck`, `npx vitest run`, and the manual check named in the task.

## Phase 1: Foundation

## Task 1: Scaffold, tokens, test and package commands

**Description:** Run `git init` and commit the spec and task files first. Scaffold the electron-vite React + TypeScript template into an empty subdirectory and move the generated files up, so the scaffolder never sees a non-empty target. Move the renderer entry from the template's `src/renderer/src/` to the `SPEC.md` layout and add `src/shared` to the include list of both tsconfig files. Add vitest and the typecheck script. Write `tokens.css` with Backlog's palette sampled from the product UI (issue list and issue detail screens): page background, table header, row border, link, one status pill colour per status, priority marker, overdue and muted bar tones. Configure electron-builder for a Windows portable exe. The window opens with a placeholder shell.

**Acceptance criteria:**
- [x] `npm run dev` opens a window; `npm run typecheck` (covering `src/shared`) and `npx vitest run` (one trivial test) succeed; `npm run build` followed by `npx electron-builder --win portable` produces an exe
- [x] `src/renderer/tokens.css` defines the listed colours plus spacing and type-scale variables, with a comment naming the screen each colour was sampled from
- [x] `SPEC.md` Tech Stack records the installed Electron version; the six spec files and `tasks/` are unchanged and committed

**Verification:**
- [x] Build succeeds: `npm run build`
- [x] Manual check: the produced exe starts on this machine (window title "Request Tracker" confirmed 2026-09-12)

**Dependencies:** None

**Files likely touched:** `.gitignore`, `package.json`, `electron.vite.config.ts`, `electron-builder.yml`, `vitest.config.ts`, `tsconfig.node.json`, `tsconfig.web.json`, `src/renderer/tokens.css`, `SPEC.md`

**Estimated scope:** Medium

## Task 2: Store collection primitives and record types

**Description:** Implement `src/main/store/collection.ts` (list, get, create with `wx`, put with atomic rename and history copy, remove to trash, history list) over a directory of JSON files. The directory comes from a resolver (a constant for issues, wiki and users; `comments/<KEY>` for comments), and history and trash are each optional per collection. Add `fileStamp(iso: string): string` producing the `YYYYMMDDTHHmmssSSSZ` file-name stamp used by history files, comment ids and wiki ids. Add `src/shared/types.ts` with every record type from the specs and a type guard per record. Nothing in `src/main/store/` imports `electron`: paths such as userData are passed in as arguments, so vitest runs these modules without a mock.

**Acceptance criteria:**
- [x] A write interrupted between temp write and rename leaves the target intact and the temp file as the only leftover
- [x] A corrupt file is skipped and logged; the rest of the collection lists
- [x] Concurrent `create` of the same id: one succeeds, one rejects with `EEXIST`
- [x] `put` on an existing record leaves the old content under `history/<collection>/<id>/`; `remove` moves the file to `trash/<collection>/`

**Verification:**
- [x] Tests pass: `npx vitest run tests/main/store`
- [x] Manual check: none

**Dependencies:** Task 1

**Files likely touched:** `src/main/store/collection.ts`, `src/main/store/paths.ts`, `src/main/store/fileStamp.ts`, `src/shared/types.ts`, `tests/main/store/collection.test.ts`, `tests/main/store/fileStamp.test.ts`

**Estimated scope:** Medium

## Task 3: Store config, project, users, IPC and preload

**Description:** Local `config.json` (`rootDir`), folder picker, `project.json` init with fiscal year start month, `users/<username>.json` with `os.userInfo`, and the typed IPC surface from `SPEC-store.md` wired through `ipc.ts` and `preload/index.ts` into `window.api`. Handlers for issues, comments, attachments and wiki may throw "not implemented" until their tasks. `ipc.ts` and `index.ts` are the only files that import `electron`; `config.ts` receives the userData path and `chooseRoot` receives the dialog result as arguments, so `tests/main/store` runs without an electron mock.

**Acceptance criteria:**
- [x] `window.api.config.get()` returns `null` on a fresh userData and the saved root after `chooseRoot`
- [x] `project.init(4)` creates `project.json` and all collection directories
- [x] `users.me()` returns `null` until `users.register(displayName)` writes the file

**Verification:**
- [x] Tests pass: `npx vitest run tests/main/store`
- [x] Manual check: call the api from DevTools console in `npm run dev`

**Dependencies:** Task 2

**Files likely touched:** `src/main/store/config.ts`, `src/main/store/project.ts`, `src/main/store/users.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/shared/api.ts`

**Estimated scope:** Medium

## Task 4: First-launch screens and app shell

**Description:** Renderer shell: left navigation (課題, Wiki, ガントチャート, 集計), `useHashRoute`, current-user context, and the first-launch sequence (folder picker → fiscal month → display name) that ends on an empty issue list.

**Acceptance criteria:**
- [x] Fresh userData: the three first-launch screens appear in order, then the list
- [x] Second launch: the list appears directly, showing the display name in the header
- [x] Navigation switches between four placeholder screens by hash

**Verification:**
- [x] Build succeeds: `npm run build`
- [x] Manual check: delete `config.json` under userData and relaunch

**Dependencies:** Task 3

**Files likely touched:** `src/renderer/app/App.tsx`, `src/renderer/app/Nav.tsx`, `src/renderer/app/useHashRoute.ts`, `src/renderer/app/FirstLaunch.tsx`, `src/renderer/app/UserContext.tsx`

**Estimated scope:** Medium

## Checkpoint A: Foundation
- [ ] `npm run typecheck` and `npx vitest run` pass
- [ ] First-launch and second-launch flows work as in Task 4
- [ ] Review with human before Phase 2

## Phase 2: Issues

## Task 5: Create an issue with fiscal-year key

**Description:** `fiscalYearOf(date, startMonth)` and `allocateKey(existingKeys, yy)` as pure functions in `src/main/store/`. `issues.create(draft)` in the main process allocates the key from the union of `issues/` and `trash/issues/`, retries on `EEXIST`, creates `attachments/<KEY>/`, and returns the created record; the renderer sends the draft without a key. `useIssues()` loads the map through `window.api` (the `store:changed` patching comes in Task 8). The create form (`/issues/new`, `?parent=`) and a read-only detail screen showing every field.

**Acceptance criteria:**
- [x] Creating on 2027-03-15 with start month 4 yields `26-0001`; the next issue is `26-0002`
- [x] A key whose issue sits in `trash/issues/` is never reallocated
- [x] The create form requires 件名 and defaults 優先度 to 中; submit opens `/issues/<key>`
- [x] `attachments/<KEY>/` exists after creation

**Verification:**
- [x] Tests pass: `npx vitest run tests/main/store`
- [x] Manual check: create two issues, inspect the shared folder

**Dependencies:** Task 4

**Files likely touched:** `src/main/store/issues.ts`, `src/main/store/fiscalYear.ts`, `src/main/store/allocateKey.ts`, `src/renderer/issues/useIssues.ts`, `src/renderer/issues/IssueCreate.tsx`, `src/renderer/issues/IssueDetail.tsx`, `tests/main/store/fiscalYear.test.ts`, `tests/main/store/allocateKey.test.ts`

**Estimated scope:** Medium

## Task 6: Issue list with filters and parent/child rows

**Description:** `filterIssues`, `groupByParent`, and the list screen with the filter bar (状態 multi-select default all except 完了, 担当者, 登録者, keyword), parents sorted by key descending, children under their parent in ascending key order, row click to detail, and 子課題を追加 on the detail.

**Acceptance criteria:**
- [x] A parent with two children renders as one parent row followed by two indented rows in ascending key order
- [x] Filters combine; clearing them restores the default set
- [x] The parent picker on the create form lists only issues with `parentKey === null`

**Verification:**
- [x] Tests pass: `npx vitest run tests/renderer/issues`
- [x] Manual check: create parent + children, filter by each field

**Dependencies:** Task 5

**Files likely touched:** `src/renderer/issues/filterIssues.ts`, `src/renderer/issues/groupByParent.ts`, `src/renderer/issues/IssueList.tsx`, `src/renderer/issues/FilterBar.tsx`, `tests/renderer/issues/filterIssues.test.ts`

**Estimated scope:** Medium

## Task 7: Edit in place, history and restore

**Description:** Detail fields save on blur or Enter through `issues.put` (sets `updatedAt`, `updatedBy`); description edits in a textarea with a preview tab (`react-markdown`, raw HTML off); 履歴 section lists versions with 戻す.

**Acceptance criteria:**
- [x] Two edits produce two files under `history/issues/<KEY>/`
- [x] 戻す on the first version makes it current and adds a third history file
- [x] Description preview renders Markdown and shows `<script>` as text

**Verification:**
- [x] Tests pass: `npx vitest run tests/main/store`
- [x] Manual check: edit summary, status, dates; inspect history folder

**Dependencies:** Task 5

**Files likely touched:** `src/renderer/issues/IssueDetail.tsx`, `src/renderer/issues/FieldEditor.tsx`, `src/renderer/issues/HistoryList.tsx`, `src/renderer/app/Markdown.tsx`

**Estimated scope:** Medium

## Task 8: Poller and live refresh

**Description:** `src/main/store/poller.ts` scans `issues/`, `comments/*/`, `attachments/*/`, `wiki/` and `users/` every 5 s, diffs `mtimeMs` and size, and sends `store:changed`; `useIssues` patches one record per event. Add a `dev:second` npm script that starts a second instance with its own `--user-data-dir` (passed to Electron through electron-vite's `--` separator; the exact form is fixed here) for every later two-instance check.

**Acceptance criteria:**
- [x] Touching a file in `issues/` produces exactly one `store:changed` within one cycle (test with a 50 ms interval)
- [x] Two dev instances: a status change in one shows in the other within 10 s
- [x] Rename the root directory away for two poll cycles: one logged error per cycle and no crash; rename it back: the next cycle emits the pending `store:changed` events

**Verification:**
- [x] Tests pass: `npx vitest run tests/main/store/poller.test.ts`
- [x] Manual check: `npm run dev` and `npm run dev:second` on the same shared folder

**Dependencies:** Tasks 5 and 7

**Files likely touched:** `src/main/store/poller.ts`, `src/main/index.ts`, `src/renderer/issues/useIssues.ts`, `package.json`, `tests/main/store/poller.test.ts`

**Estimated scope:** Small

## Checkpoint B: Two clients
- [x] Create, edit and status change propagate between two instances within 10 s (local folder, 5 s observed, 2026-09-12)
- [x] Simultaneous creation from two instances yields distinct keys (26-0004 / 26-0005)
- [ ] Same tests repeated on the real network share (no share reachable from the build machine; run before distribution)
- [ ] Review with human before continuing

## Task 9: Comments

**Description:** `comments/<KEY>/<stamp>-<username>.json`, `comments.list` and `comments.add`, the コメント section with chronological list and 投稿 textarea, poller coverage of `comments/*/`.

**Acceptance criteria:**
- [x] A comment posted in instance A appears in instance B within 10 s
- [x] A comment posted while another user saves the summary survives both saves

**Verification:**
- [x] Tests pass: `npx vitest run tests/main/store`
- [x] Manual check: two instances

**Dependencies:** Task 8

**Files likely touched:** `src/main/store/comments.ts`, `src/renderer/issues/Comments.tsx`, `src/main/store/poller.ts`

**Estimated scope:** Small

## Task 10: Attachments: files

**Description:** `attachments.list/add/open/openIssueFolder/remove` for files: dialog and drag-and-drop (`webUtils.getPathForFile`), 50 MB and extension checks, temp-then-rename copy, ` (n)` suffix, list with name/size/date, open with default app, フォルダを開く, 削除 to trash, poller coverage.

**Acceptance criteria:**
- [x] Dropping `report.xlsx` twice yields `report.xlsx` and `report (2).xlsx`; a 60 MB file in the same drop is refused and the others copied
- [x] A `.exe` is refused with 「実行ファイルは添付できません」
- [x] A file placed in the folder from Explorer is listed within 10 s
- [x] With the share unreachable, an add attempt writes nothing and shows 「共有フォルダに接続できません」; a failed open shows 「開けません」 with the OS message

**Verification:**
- [x] Tests pass: `npx vitest run tests/main/store/attachments.test.ts`
- [x] Manual check: drag from Explorer into the running app

**Dependencies:** Task 8

**Files likely touched:** `src/main/store/attachments.ts`, `src/preload/index.ts`, `src/renderer/issues/Attachments.tsx`, `tests/main/store/attachments.test.ts`

**Estimated scope:** Medium

## Task 11: Attachments: folders

**Description:** Extend `attachments.add` to accept a folder path: recursive copy into `.<name>.tmp-<pid>/` with a filter that skips refused files and reports them, rename on completion, folder rows first in the list, click opens in Explorer, remove moves the folder to trash.

**Acceptance criteria:**
- [x] A dropped folder with a subfolder and one `.bat` is copied without the `.bat`; the message names it
- [x] Folder rows sort before file rows; clicking one opens Explorer
- [x] 削除 moves the whole folder to `trash/attachments/<KEY>/`

**Verification:**
- [x] Tests pass: `npx vitest run tests/main/store/attachments.test.ts`
- [x] Manual check: drop a folder from Explorer

**Dependencies:** Task 10

**Files likely touched:** `src/main/store/attachments.ts`, `src/renderer/issues/Attachments.tsx`, `tests/main/store/attachments.test.ts`

**Estimated scope:** Small

## Task 12: Delete issue

**Description:** 削除 on the detail: refused with a message when children exist; otherwise the record moves to `trash/issues/` and the app returns to the list. Attachments folder stays in place.

**Acceptance criteria:**
- [x] Deleting a parent with children shows 「子課題があるため削除できません」 and changes nothing
- [x] Deleting a leaf moves `issues/<KEY>.json` to `trash/issues/` and removes it from both instances' lists

**Verification:**
- [x] Tests pass: `npx vitest run tests/main/store`
- [x] Manual check: two instances

**Dependencies:** Task 6

**Files likely touched:** `src/renderer/issues/IssueDetail.tsx`, `src/main/store/issues.ts`

**Estimated scope:** Small

## Task 13: Monthly counts and CSV export

**Description:** `countByMonth(issues, yyyyMm)` returning counts by reporter, assignee and status; the 集計 screen with month picker and three tables; CSV export through the IPC method `summary.exportCsv(csv: string): Promise<boolean>` (defined in `SPEC-store.md`), which opens `dialog.showSaveDialog` and writes UTF-8 with BOM.

**Acceptance criteria:**
- [x] Three issues from two reporters in one month produce the expected rows and totals
- [x] The exported CSV opens in Excel with Japanese intact
- [x] Issues from other months are excluded

**Verification:**
- [x] Tests pass: `npx vitest run tests/renderer/issues/countByMonth.test.ts`
- [x] Manual check: export and open in Excel

**Dependencies:** Task 6

**Files likely touched:** `src/renderer/issues/countByMonth.ts`, `src/renderer/issues/Summary.tsx`, `src/main/ipc.ts`, `src/shared/api.ts`, `tests/renderer/issues/countByMonth.test.ts`

**Estimated scope:** Medium

## Checkpoint C: Issues complete
- [ ] Every success criterion in `SPEC-issues.md` checked by hand on two instances
- [ ] `npm run typecheck` and `npx vitest run` pass
- [ ] Review with human before Phase 3

## Phase 3: Wiki and Gantt

## Task 14: Wiki pages

**Description:** `wiki/<id>.json` through the generic collection; list (title sort, keyword filter, 新規ページ), view (rendered Markdown, 編集), edit (タイトル, textarea with preview, 保存, キャンセル); `useWiki` with poller coverage.

**Acceptance criteria:**
- [x] Create, edit and view a page; a second instance lists it within 10 s
- [x] Markdown with `<script>` renders as text

**Verification:**
- [x] Build succeeds: `npm run build`
- [x] Manual check: two instances

**Dependencies:** Task 8

**Files likely touched:** `src/main/store/wiki.ts`, `src/renderer/wiki/WikiList.tsx`, `src/renderer/wiki/WikiView.tsx`, `src/renderer/wiki/WikiEdit.tsx`, `src/renderer/wiki/useWiki.ts`

**Estimated scope:** Medium

## Task 15: Wiki history, restore and delete

**Description:** 履歴 section with 戻す on the view screen, 削除 moving the page to `trash/wiki/`.

**Acceptance criteria:**
- [x] Two edits yield two history files; 戻す restores the first
- [x] 削除 removes the page from both instances' lists

**Verification:**
- [x] Tests pass: `npx vitest run tests/main/store`
- [x] Manual check: two instances

**Dependencies:** Task 14

**Files likely touched:** `src/renderer/wiki/WikiView.tsx`, `src/renderer/wiki/WikiHistory.tsx`

**Estimated scope:** Small

## Task 16: Gantt

**Description:** `layoutGantt(issues, range)` and the `/gantt` screen: day columns for the month ±7 days, parents first with children indented, bars from start (or created date) to due, overdue and muted tones, today line, weekend shading, 前月/今月/次月, row click to detail, 状態 filter shared with the list.

**Acceptance criteria:**
- [x] `layoutGantt` tests: inside range, start before range, due after range, child under parent
- [x] An issue without `dueDate` is absent; an open issue due yesterday shows the overdue tone
- [x] Month navigation moves the range and the today line

**Verification:**
- [x] Tests pass: `npx vitest run tests/renderer/gantt`
- [x] Manual check: issues spanning month boundaries

**Dependencies:** Task 6

**Files likely touched:** `src/renderer/gantt/layoutGantt.ts`, `src/renderer/gantt/Gantt.tsx`, `src/renderer/gantt/gantt.css`, `tests/renderer/gantt/layoutGantt.test.ts`

**Estimated scope:** Medium

## Task 17: Styling pass against Backlog

**Description:** Compare every screen (first launch, issue list, issue detail, create form, summary, wiki list/view/edit, gantt) against the Backlog product UI and adjust layout, spacing and tokens so the left navigation, table, detail pane and status pills read as Backlog's. Colour comes only from `tokens.css` variables.

**Acceptance criteria:**
- [ ] The user reviews each screen next to its Backlog counterpart and accepts it
- [ ] `grep -rE "#[0-9a-fA-F]{3,6}\b" src/renderer --include=*.css --include=*.tsx` matches lines in `tokens.css` only

**Verification:**
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: screen-by-screen review with the user

**Dependencies:** Tasks 4–16

**Files likely touched:** `src/renderer/tokens.css`, `src/renderer/app/*.css`, `src/renderer/issues/*.css`, `src/renderer/wiki/*.css`, `src/renderer/gantt/gantt.css`

**Estimated scope:** Medium

## Checkpoint D: Modules complete
- [ ] Success criteria in `SPEC-wiki.md` and `SPEC-gantt.md` checked by hand
- [ ] Review with human before release

## Phase 4: Release

## Task 18: Portable exe

**Description:** Package with `npm run build` followed by `npx electron-builder --win portable` and run the exe on a machine without Node or the repo.

**Acceptance criteria:**
- [ ] One `.exe` under `dist/` runs on a clean Windows 11 machine and reaches the issue list
- [ ] Packaging steps and the Developer Mode / symlink note are in `SPEC.md` Commands

**Verification:**
- [ ] Build succeeds: `npm run build` then `npx electron-builder --win portable`
- [ ] Manual check: clean machine

**Dependencies:** Tasks 1–17

**Files likely touched:** `electron-builder.yml`, `SPEC.md`

**Estimated scope:** Small

## Checkpoint E: Release
- [ ] All `SPEC.md` success criteria met
- [ ] `npm run typecheck` and `npx vitest run` pass
- [ ] Ready for distribution
