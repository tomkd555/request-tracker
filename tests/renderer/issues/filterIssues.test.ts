import { expect, test } from "vitest";
import { DEFAULT_FILTER, filterIssues } from "../../../src/renderer/issues/filterIssues";
import type { Issue } from "../../../src/shared/types";

const issue = (over: Partial<Issue>): Issue => ({
  key: "26-0001",
  summary: "",
  description: "",
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
  ...over,
});

const all = [
  issue({ key: "26-0001", summary: "Portal permissions", status: "open", assignee: "bob" }),
  issue({ key: "26-0002", summary: "Export report", status: "closed", assignee: "bob", reporter: "carol" }),
  issue({ key: "26-0003", summary: "Fix login", status: "in_progress", assignee: null }),
];

test("default filter hides closed issues", () => {
  expect(filterIssues(all, DEFAULT_FILTER).map((i) => i.key)).toEqual(["26-0001", "26-0003"]);
});

test("status list, assignee, reporter and keyword combine", () => {
  expect(filterIssues(all, { ...DEFAULT_FILTER, statuses: ["closed"] }).map((i) => i.key)).toEqual(["26-0002"]);
  expect(filterIssues(all, { ...DEFAULT_FILTER, assignee: "bob" }).map((i) => i.key)).toEqual(["26-0001"]);
  expect(filterIssues(all, { ...DEFAULT_FILTER, statuses: ["closed"], reporter: "carol" }).map((i) => i.key)).toEqual(["26-0002"]);
  expect(filterIssues(all, { ...DEFAULT_FILTER, keyword: "LOGIN" }).map((i) => i.key)).toEqual(["26-0003"]);
  expect(filterIssues(all, { ...DEFAULT_FILTER, keyword: "0001" }).map((i) => i.key)).toEqual(["26-0001"]);
  expect(filterIssues(all, { ...DEFAULT_FILTER, keyword: "nothing" })).toEqual([]);
});
