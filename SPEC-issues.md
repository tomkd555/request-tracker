# Spec: issues

Module id `issues`. Depends on `store`. Inherits the shared sections of `SPEC.md`.

## Objective

File, list, edit and count requests. A request is a parent issue; its steps are child issues. Requesters and assignees use the same screens.

## Records

```ts
export type IssueStatus = "open" | "in_progress" | "resolved" | "closed";
export type IssuePriority = "high" | "normal" | "low";

export type Issue = {
  key: string;              // "26-0012": fiscal year (two digits) - sequence within that year (four digits, zero-padded)
  summary: string;
  description: string;      // Markdown
  status: IssueStatus;
  priority: IssuePriority;
  assignee: string | null;  // username
  reporter: string;         // username
  parentKey: string | null; // one level: a child has no children
  startDate: string | null; // YYYY-MM-DD
  dueDate: string | null;   // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
};

export type Comment = {
  id: string;        // `${createdAt file stamp}-${author}`
  issueKey: string;
  author: string;
  body: string;      // Markdown
  createdAt: string;
};
```

## Screens

Labels in Japanese follow Backlog: 課題, 件名, 詳細, 状態, 担当者, 優先度, 期限日, 開始日, 登録者, 親課題, 子課題, コメント, 添付ファイル.

- **Issue list** (`/issues`, home). Table: キー, 件名, 担当者, 状態, 優先度, 期限日, 更新日. Children render under their parent, indented, in key order. Filters above the table: 状態 (multi-select, default all except 完了), 担当者, 登録者, keyword over key and summary. Sort by key descending. Row click opens the detail.
- **Issue detail** (`/issues/:key`). Header with key, summary, status pill. Fields edit in place and save on blur or Enter. Description edits in a textarea with a preview tab. Sections: 子課題 (list with 状態 and 担当者, and a 子課題を追加 button), 添付ファイル (names, 追加, click opens), コメント (chronological, textarea with 投稿), 履歴 (timestamps and 更新者, each with 戻す which saves that version as the current one).
- **Create issue** (`/issues/new`, `/issues/new?parent=KEY`). Fields: 件名 (required), 詳細, 優先度 (default 中), 担当者, 開始日, 期限日, 親課題 (preset and read-only when opened from a parent). Submit creates and opens the detail.
- **Monthly counts** (`/summary`). Month picker (default current month). Three tables for issues whose `createdAt` falls in the month: 登録者別, 担当者別, 状態別, each row a name and a count, plus a total. CSV export via `dialog.showSaveDialog`, UTF-8 with BOM so Excel opens it.

## Behaviour

- **Key allocation**: the fiscal year is the two-digit year of the date on which the year containing `createdAt` started (start month from `project.json`; 2027-03-15 with start month 4 belongs to `26`). Scan `issues/` and `trash/issues/` for `<yy>-<n>` with the same `yy`, take max + 1 (starting at 1 each fiscal year), pad to four digits, `create` with `wx`; on `EEXIST` increment and retry. `// ponytail: past 9999 the number simply grows to five digits`.
- **Reporter** is the current user at creation; **updatedBy** is the current user on every save.
- **Parent and child**: a child cannot be chosen as a parent (the picker lists only issues with `parentKey === null`). Closing a parent leaves its children as they are. Deleting an issue that still has children is refused with a message.
- **Concurrency**: last write wins. `// ponytail: no stale-write check; history keeps the overwritten version for manual recovery`.
- **Refresh**: on `store:changed` for `issues` or `comments`, reload that record; the list re-renders from the in-memory map.
- **Comments** are append-only and never conflict between users.

## Attachments

Every issue owns one folder on the shared drive, `attachments/<KEY>/` (for example `attachments/26-0012/`), created together with the issue record. Attachments are plain files and folders inside it. The issue record holds no list of them; the directory is the list.

Adding:

- Available on the detail screen only. The create form has no attachment field; after creation the detail opens and files can be added there.
- Two ways in: the 追加 button (file dialog, multi-select, files only) and drag-and-drop of files or folders onto the 添付ファイル section.
- A dropped folder is copied whole, with its subfolders, to `attachments/<KEY>/<folder name>/`. Every file inside is subject to the same size and extension rules; a refused file is skipped, the rest of the folder is copied, and the refusals are listed in one message.
- Each file is copied, never moved; the original stays where the user had it.
- Limit: 50 MB per file. A larger file is refused with 「50 MB を超えるファイルは添付できません」 and the other files in the same drop are still copied.
- Refused extensions: `.exe .bat .cmd .com .ps1 .vbs .js .msi .scr .lnk`, because opening them from the app would run them. Message: 「実行ファイルは添付できません」.
- Name: the original file or folder name with its path stripped. If an entry of that name already exists for the issue, ` (2)`, ` (3)` … is inserted before the extension (after the name, for a folder).
- Copy is atomic per entry: a file is written to `.<name>.tmp-<pid>` and renamed; a folder is copied into `.<name>.tmp-<pid>/` and the directory renamed. A half-copied entry never appears in the list. If the shared folder is unreachable the copy fails before anything is written and the screen shows 「共有フォルダに接続できません」.
- Two users adding the same name at the same moment: the final name is claimed with an exclusive create; on `EEXIST` the suffix is bumped and the rename retried.

Listing:

- Top-level entries of `attachments/<KEY>/`, folders first, then files, each group sorted by name. A file row shows name, size and added date (from `stat`); a folder row shows name and added date.
- The list refreshes when the poller reports a change under `attachments/<KEY>/`, so entries added by another client, or placed there directly in Explorer, appear within one poll cycle.

Opening:

- Click on a file name opens it with the Windows default application (`shell.openPath`). Click on a folder name opens that folder in Explorer. Failure shows 「開けません」 with the OS message.
- フォルダを開く at the top of the section opens `attachments/<KEY>/` itself in Explorer, so files can be dropped in or copied out by hand.

Removing:

- 削除 on each row asks 「<name> を削除しますか」 and, on yes, moves the file or folder to `trash/attachments/<KEY>/`. Nothing is unlinked.

Out of scope: inline preview, thumbnails, attaching to comments, versioning of a re-uploaded file (it lands as ` (2)`), browsing inside a subfolder from the app (Explorer does that).

## Success Criteria

- Create a parent with two children; the list shows the parent row with two indented rows beneath it.
- Two clients allocate a key at the same moment: both end up with distinct keys.
- Changing 状態 in one client shows in the other within 10 s.
- A comment posted in client A while client B edits the same issue's summary is present after both save.
- Dropping two files of the same name onto an issue yields `report.xlsx` and `report (2).xlsx`; a 60 MB file in the same drop is refused while the others are copied.
- Dropping a folder with a nested subfolder and one `.exe` inside copies the tree to `attachments/<KEY>/<folder>/` without the `.exe`, and the message names the skipped file.
- Creating an issue creates `attachments/<KEY>/`; a file placed there in Explorer is listed in the app within 10 s.
- A file added in client A is listed in client B within 10 s; deleting it in B moves it to `trash/attachments/<KEY>/` and both lists drop it.
- The monthly table for a month with 3 issues from 2 reporters shows those counts, and the exported CSV opens in Excel with correct Japanese.
- `fiscalYearOf`, `filterIssues`, `allocateKey`, `countByMonth` each have a vitest test per branch; `fiscalYearOf` covers a date before and after the start month and a start month of 1.

## Open Questions

- Whether resolved parent issues should be hidden from the default list along with closed ones. Default: shown.
