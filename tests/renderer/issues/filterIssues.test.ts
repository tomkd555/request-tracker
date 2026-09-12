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

const today = "2026-09-12";
const all = [
  issue({ key: "26-0001", summary: "Portal permissions", status: "open", assignee: "bob", dueDate: "2026-09-10" }),
  issue({ key: "26-0002", summary: "Export report", status: "closed", assignee: "bob", reporter: "carol", dueDate: "2026-09-01" }),
  issue({ key: "26-0003", summary: "Fix login", description: "password reset page", status: "in_progress", assignee: null, dueDate: "2026-09-19" }),
  issue({ key: "26-0004", summary: "No date", status: "open" }),
];
const keys = (r: Issue[]): string[] => r.map((i) => i.key);

test("default filter hides closed issues", () => {
  expect(keys(filterIssues(all, DEFAULT_FILTER, today))).toEqual(["26-0001", "26-0003", "26-0004"]);
});

test("status list, assignee, reporter and keyword combine", () => {
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, statuses: ["closed"] }, today))).toEqual(["26-0002"]);
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, assignee: "bob" }, today))).toEqual(["26-0001"]);
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, statuses: ["closed"], reporter: "carol" }, today))).toEqual(["26-0002"]);
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, keyword: "LOGIN" }, today))).toEqual(["26-0003"]);
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, keyword: "0001" }, today))).toEqual(["26-0001"]);
  expect(filterIssues(all, { ...DEFAULT_FILTER, keyword: "nothing" }, today)).toEqual([]);
});

test("keyword also searches the description", () => {
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, keyword: "password" }, today))).toEqual(["26-0003"]);
});

test("due conditions: overdue, within a week, none", () => {
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, due: "overdue" }, today))).toEqual(["26-0001"]);
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, due: "week" }, today))).toEqual(["26-0003"]);
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, due: "week" }, "2026-09-11"))).toEqual([]);
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, due: "none" }, today))).toEqual(["26-0004"]);
});
