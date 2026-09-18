import { expect, test } from "vitest";
import { columnsOf } from "../../../src/renderer/kanban/columns";
import { DEFAULT_STATUSES, type Issue, type IssueStatus } from "../../../src/shared/types";

const issue = (key: string, over: Partial<Issue> = {}): Issue => ({
  key,
  summary: key,
  description: "",
  category: "",
  status: "open",
  priority: "normal",
  assignee: null,
  reporter: "alice",
  parentKey: null,
  startDate: null,
  dueDate: null,
  createdAt: "",
  updatedAt: "",
  updatedBy: "",
  fields: {},
  labels: [],
  relations: [],
  ...over,
});

const byKeyDesc = (a: Issue, b: Issue): number => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0);

test("buckets issues into the column matching their status", () => {
  const issues = [issue("26-0001", { status: "open" }), issue("26-0002", { status: "in_progress" }), issue("26-0003", { status: "open" })];
  const cols = columnsOf(issues, DEFAULT_STATUSES, ["open", "in_progress"], byKeyDesc);
  expect(cols.find((c) => c.status === "open")?.cards.map((i) => i.key)).toEqual(["26-0003", "26-0001"]);
  expect(cols.find((c) => c.status === "in_progress")?.cards.map((i) => i.key)).toEqual(["26-0002"]);
});

test("orders columns by the project list regardless of the filter's order", () => {
  const cols = columnsOf([], DEFAULT_STATUSES, ["closed", "open", "in_progress"], byKeyDesc);
  expect(cols.map((c) => c.status)).toEqual<IssueStatus[]>(["open", "in_progress", "closed"]);
  const reversed = [...DEFAULT_STATUSES].reverse();
  expect(columnsOf([], reversed, ["open", "closed"], byKeyDesc).map((c) => c.status)).toEqual<IssueStatus[]>(["closed", "open"]);
});

test("omits a status absent from the filter", () => {
  const issues = [issue("26-0001", { status: "closed" })];
  const cols = columnsOf(issues, DEFAULT_STATUSES, ["open", "in_progress", "resolved"], byKeyDesc);
  expect(cols.map((c) => c.status)).not.toContain("closed");
});

test("caps a column at the limit and reports the rest as overflow", () => {
  const issues = ["26-0001", "26-0002", "26-0003"].map((k) => issue(k, { status: "open" }));
  const cols = columnsOf(issues, DEFAULT_STATUSES, ["open"], byKeyDesc, 2);
  const col = cols[0];
  expect(col.cards).toHaveLength(2);
  expect(col.cards.map((i) => i.key)).toEqual(["26-0003", "26-0002"]);
  expect(col.overflow).toBe(1);
});

test("a column under the limit has no overflow", () => {
  const issues = [issue("26-0001", { status: "open" })];
  const cols = columnsOf(issues, DEFAULT_STATUSES, ["open"], byKeyDesc, 2);
  expect(cols[0].overflow).toBe(0);
});

test("sorts by the comparator argument", () => {
  const issues = [issue("26-0001", { status: "open" }), issue("26-0002", { status: "open" })];
  const byKeyAsc = (a: Issue, b: Issue): number => -byKeyDesc(a, b);
  const cols = columnsOf(issues, DEFAULT_STATUSES, ["open"], byKeyAsc);
  expect(cols[0].cards.map((i) => i.key)).toEqual(["26-0001", "26-0002"]);
});
