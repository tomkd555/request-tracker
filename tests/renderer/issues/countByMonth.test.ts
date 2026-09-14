import { expect, test } from "vitest";
import { countByMonth, monthOf, toCsv } from "../../../src/renderer/issues/countByMonth";
import type { Issue } from "../../../src/shared/types";

const issue = (over: Partial<Issue>): Issue => ({
  key: "26-0001",
  summary: "",
  description: "",
  category: "",
  status: "open",
  priority: "normal",
  assignee: null,
  reporter: "alice",
  parentKey: null,
  startDate: null,
  dueDate: null,
  createdAt: "2026-09-10T03:00:00.000Z",
  updatedAt: "",
  updatedBy: "",
  ...over,
});

const all = [
  issue({ key: "26-0001", reporter: "alice", assignee: "bob", status: "open" }),
  issue({ key: "26-0002", reporter: "alice", assignee: "bob", status: "closed", updatedAt: "2026-09-12T03:00:00.000Z" }),
  issue({ key: "26-0003", reporter: "carol", assignee: null, status: "open", category: "依頼" }),
  issue({ key: "26-0004", reporter: "carol", createdAt: "2026-08-31T03:00:00.000Z" }),
  issue({ key: "26-0005", reporter: "carol", assignee: null, status: "closed", createdAt: "2026-08-20T03:00:00.000Z", updatedAt: "2026-09-01T03:00:00.000Z" }),
  issue({ key: "26-0006", reporter: "carol", assignee: "bob", status: "closed", createdAt: "2026-08-20T03:00:00.000Z", updatedAt: "2026-08-25T03:00:00.000Z" }),
];

test("month of a timestamp in local time", () => {
  expect(monthOf("2026-09-10T03:00:00.000Z")).toBe("2026-09");
});

test("three issues from two reporters in one month; other months excluded", () => {
  const c = countByMonth(all, "2026-09");
  expect(c.total).toBe(3);
  expect(c.byReporter).toEqual([
    { key: "alice", count: 2 },
    { key: "carol", count: 1 },
  ]);
  expect(c.byAssignee).toEqual([
    { key: "bob", count: 2 },
    { key: "", count: 1 },
  ]);
  expect(c.byStatus).toEqual([
    { key: "open", count: 2 },
    { key: "closed", count: 1 },
  ]);
  expect(countByMonth(all, "2026-07").total).toBe(0);
});

test("closed in the month counts by updatedAt regardless of creation month", () => {
  const c = countByMonth(all, "2026-09");
  expect(c.closedTotal).toBe(2);
  expect(c.closedByAssignee).toEqual([
    { key: "", count: 1 },
    { key: "bob", count: 1 },
  ]);
  expect(countByMonth(all, "2026-08").closedTotal).toBe(1);
});

test("a name that would be a spreadsheet formula is prefixed", () => {
  const csv = toCsv(countByMonth(all, "2026-09"), { user: (u) => (u === "alice" ? "=1+1" : u), status: (s) => s });
  expect(csv).toContain("'=1+1,2");
});

test("csv has CRLF rows, quoted names when needed, and labels", () => {
  const csv = toCsv(countByMonth(all, "2026-09"), {
    user: (u) => (u === "alice" ? "山田, 花子" : u),
    status: (s) => (s === "open" ? "未対応" : "完了"),
  });
  expect(csv.split("\r\n")).toEqual([
    "対象月,2026-09",
    "合計,3",
    "",
    "登録者,件数",
    '"山田, 花子",2',
    "carol,1",
    "",
    "担当者,件数",
    "bob,2",
    "未設定,1",
    "",
    "状態,件数",
    "未対応,2",
    "完了,1",
    "",
    "種別,件数",
    "未設定,2",
    "依頼,1",
    "",
    "完了件数,2",
    "",
    "完了 担当者別,件数",
    "未設定,1",
    "bob,1",
    "",
  ]);
});
