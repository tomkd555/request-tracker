import { expect, test } from "vitest";
import { defaultStatusName, issuesToCsv } from "../../../src/renderer/issues/issuesToCsv";
import type { Issue } from "../../../src/shared/types";

const issue = (over: Partial<Issue>): Issue => ({
  key: "26-0001",
  summary: "A",
  description: "",
  category: "",
  status: "open",
  priority: "normal",
  assignee: null,
  reporter: "alice",
  parentKey: null,
  startDate: null,
  dueDate: null,
  createdAt: "2026-09-01T09:00:00.000Z",
  updatedAt: "2026-09-02T09:00:00.000Z",
  updatedBy: "alice",
  ...over,
});
const names = { user: (u: string | null): string => (u === null ? "" : u.toUpperCase()), status: defaultStatusName };

test("header row, one line per row, quoting and formula guard applied", () => {
  const rows = [
    { issue: issue({}), depth: 0 as const },
    { issue: issue({ key: "26-0002", summary: 'a, "b"', category: "不具合", assignee: "bob", dueDate: "2026-09-20", parentKey: "26-0001", priority: "high" }), depth: 1 as const },
    { issue: issue({ key: "26-0003", summary: "=1+1" }), depth: 0 as const },
  ];
  expect(issuesToCsv(rows, names).split("\r\n")).toEqual([
    "キー,件名,種別,担当者,状態,優先度,期限日,更新日,登録者,登録日",
    "26-0001,A,,,未対応,中,,2026-09-02,ALICE,2026-09-01",
    '26-0002,"a, ""b""",不具合,BOB,未対応,高,2026-09-20,2026-09-02,ALICE,2026-09-01',
    "26-0003,'=1+1,,,未対応,中,,2026-09-02,ALICE,2026-09-01",
  ]);
});
