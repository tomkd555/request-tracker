import { expect, test } from "vitest";
import { groupByParent } from "../../../src/renderer/issues/groupByParent";
import { issueComparator, nextSort, type IssueSort } from "../../../src/renderer/issues/sortIssues";
import { DEFAULT_STATUSES, type Issue } from "../../../src/shared/types";

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

const nameOf = (u: string | null): string => (u === null ? "" : u === "bob" ? "Bob" : "Alice");
const all = [
  issue("26-0001", { dueDate: "2026-09-20", assignee: "bob", priority: "low", status: "closed" }),
  issue("26-0002", { dueDate: null, assignee: null, priority: "high", status: "open" }),
  issue("26-0003", { dueDate: "2026-09-10", assignee: "alice", priority: "normal", status: "in_progress" }),
  issue("26-0004", { parentKey: "26-0003" }),
];
const keys = (sort: IssueSort): string[] => groupByParent(all, issueComparator(sort, nameOf, DEFAULT_STATUSES)).map((r) => `${r.depth}:${r.issue.key}`);

test("due date ascending puts missing dates last and keeps children under their parent", () => {
  expect(keys({ key: "dueDate", dir: "asc" })).toEqual(["0:26-0003", "1:26-0004", "0:26-0001", "0:26-0002"]);
  expect(keys({ key: "dueDate", dir: "desc" })).toEqual(["0:26-0001", "0:26-0003", "1:26-0004", "0:26-0002"]);
});

test("assignee sorts by display name with unassigned last", () => {
  expect(keys({ key: "assignee", dir: "asc" })).toEqual(["0:26-0003", "1:26-0004", "0:26-0001", "0:26-0002"]);
});

test("status and priority sort in their declared order", () => {
  expect(keys({ key: "status", dir: "asc" })).toEqual(["0:26-0002", "0:26-0003", "1:26-0004", "0:26-0001"]);
  expect(keys({ key: "priority", dir: "asc" })).toEqual(["0:26-0002", "0:26-0003", "1:26-0004", "0:26-0001"]);
});

test("ties fall back to key descending", () => {
  const tied = [issue("26-0001", { priority: "high" }), issue("26-0002", { priority: "high" }), issue("26-0003", { priority: "low" })];
  expect(groupByParent(tied, issueComparator({ key: "priority", dir: "asc" }, nameOf, DEFAULT_STATUSES)).map((r) => r.issue.key)).toEqual(["26-0002", "26-0001", "26-0003"]);
});

test("nextSort flips the same column and starts a new one in its natural direction", () => {
  expect(nextSort({ key: "key", dir: "desc" }, "key")).toEqual({ key: "key", dir: "asc" });
  expect(nextSort({ key: "key", dir: "desc" }, "summary")).toEqual({ key: "summary", dir: "asc" });
  expect(nextSort({ key: "summary", dir: "asc" }, "updatedAt")).toEqual({ key: "updatedAt", dir: "desc" });
});

test("a 汎用列 sorts by its value with empty values last, and starts ascending", () => {
  const tagged = [issue("26-0001", { fields: { env: "検証" } }), issue("26-0002"), issue("26-0003", { fields: { env: "本番" } })];
  const order = (sort: IssueSort): string[] => groupByParent(tagged, issueComparator(sort, nameOf, DEFAULT_STATUSES)).map((r) => r.issue.key);
  expect(order({ key: "field:env", dir: "asc" })).toEqual(["26-0003", "26-0001", "26-0002"]);
  expect(order({ key: "field:env", dir: "desc" })).toEqual(["26-0001", "26-0003", "26-0002"]);
  expect(nextSort({ key: "key", dir: "desc" }, "field:env")).toEqual({ key: "field:env", dir: "asc" });
});
