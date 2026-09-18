import { expect, test } from "vitest";
import { issuesToCsv } from "../../../src/renderer/issues/issuesToCsv";
import { statusName } from "../../../src/renderer/issues/labels";
import { DEFAULT_STATUSES, type Issue } from "../../../src/shared/types";

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
  fields: {},
  labels: [],
  relations: [],
  ...over,
});
const names = { user: (u: string | null): string => (u === null ? "" : u.toUpperCase()), status: (s: string): string => statusName(DEFAULT_STATUSES, s) };

test("header row, one line per row, quoting and formula guard applied", () => {
  const rows = [
    { issue: issue({}), depth: 0 as const },
    { issue: issue({ key: "26-0002", summary: 'a, "b"', category: "不具合", labels: ["bug", "urgent"], assignee: "bob", dueDate: "2026-09-20", parentKey: "26-0001", priority: "high" }), depth: 1 as const },
    { issue: issue({ key: "26-0003", summary: "=1+1" }), depth: 0 as const },
  ];
  expect(issuesToCsv(rows, names).split("\r\n")).toEqual([
    "キー,件名,種別,ラベル,担当者,状態,優先度,期限日,更新日,登録者,登録日",
    "26-0001,A,,,,未対応,中,,2026-09-02,ALICE,2026-09-01",
    '26-0002,"a, ""b""",不具合,bug urgent,BOB,未対応,高,2026-09-20,2026-09-02,ALICE,2026-09-01',
    "26-0003,'=1+1,,,,未対応,中,,2026-09-02,ALICE,2026-09-01",
  ]);
});

test("汎用列 follow the fixed columns, empty where the issue has no value", () => {
  const fields = [{ id: "env", name: "環境", options: ["本番", "検証"] }, { id: "ticket", name: "チケット番号", options: [] }];
  const rows = [{ issue: issue({ fields: { env: "本番" } }), depth: 0 as const }, { issue: issue({ key: "26-0002" }), depth: 0 as const }];
  expect(issuesToCsv(rows, names, fields).split("\r\n")).toEqual([
    "キー,件名,種別,ラベル,担当者,状態,優先度,期限日,更新日,登録者,登録日,環境,チケット番号",
    "26-0001,A,,,,未対応,中,,2026-09-02,ALICE,2026-09-01,本番,",
    "26-0002,A,,,,未対応,中,,2026-09-02,ALICE,2026-09-01,,",
  ]);
});
