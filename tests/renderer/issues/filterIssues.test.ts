import { expect, test } from "vitest";
import { defaultFilter, filterIssues } from "../../../src/renderer/issues/filterIssues";
import { DEFAULT_STATUSES, type Issue } from "../../../src/shared/types";

const DEFAULT_FILTER = defaultFilter(DEFAULT_STATUSES);

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
  createdAt: "",
  updatedAt: "",
  updatedBy: "",
  fields: {},
  labels: [],
  relations: [],
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
  expect(keys(filterIssues(all, DEFAULT_FILTER, today, "alice", DEFAULT_STATUSES))).toEqual(["26-0001", "26-0003", "26-0004"]);
});

test("status list, assignee, reporter and keyword combine", () => {
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, statuses: ["closed"] }, today, "alice", DEFAULT_STATUSES))).toEqual(["26-0002"]);
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, assignee: "bob" }, today, "alice", DEFAULT_STATUSES))).toEqual(["26-0001"]);
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, statuses: ["closed"], reporter: "carol" }, today, "alice", DEFAULT_STATUSES))).toEqual(["26-0002"]);
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, keyword: "LOGIN" }, today, "alice", DEFAULT_STATUSES))).toEqual(["26-0003"]);
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, keyword: "0001" }, today, "alice", DEFAULT_STATUSES))).toEqual(["26-0001"]);
  expect(filterIssues(all, { ...DEFAULT_FILTER, keyword: "nothing" }, today, "alice", DEFAULT_STATUSES)).toEqual([]);
});

test("keyword also searches the description", () => {
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, keyword: "password" }, today, "alice", DEFAULT_STATUSES))).toEqual(["26-0003"]);
});

test("due conditions: overdue, within a week, none", () => {
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, due: "overdue" }, today, "alice", DEFAULT_STATUSES))).toEqual(["26-0001"]);
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, due: "week" }, today, "alice", DEFAULT_STATUSES))).toEqual(["26-0003"]);
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, due: "week" }, "2026-09-11", "alice", DEFAULT_STATUSES))).toEqual([]);
  const closedSoon = [...all, issue({ key: "26-0005", status: "closed", dueDate: "2026-09-13" })];
  expect(keys(filterIssues(closedSoon, { ...DEFAULT_FILTER, statuses: ["closed"], due: "week" }, today, "alice", DEFAULT_STATUSES))).toEqual([]);
  expect(keys(filterIssues(all, { ...DEFAULT_FILTER, due: "none" }, today, "alice", DEFAULT_STATUSES))).toEqual(["26-0004"]);
});

test("awaitingConfirmation keeps resolved issues reported by me", () => {
  const withResolved = [...all, issue({ key: "26-0005", status: "resolved", reporter: "alice" }), issue({ key: "26-0006", status: "resolved", reporter: "carol" })];
  expect(keys(filterIssues(withResolved, { ...DEFAULT_FILTER, awaitingConfirmation: true }, today, "alice", DEFAULT_STATUSES))).toEqual(["26-0005"]);
});

test("a 汎用列 filter keeps the chosen value only; a record without the value counts as empty", () => {
  const tagged = [...all, issue({ key: "26-0005", status: "open", fields: { env: "本番" } })];
  expect(keys(filterIssues(tagged, { ...DEFAULT_FILTER, fields: { env: "本番" } }, today, "alice", DEFAULT_STATUSES))).toEqual(["26-0005"]);
  expect(keys(filterIssues(tagged, { ...DEFAULT_FILTER, fields: { env: "" } }, today, "alice", DEFAULT_STATUSES))).toEqual(["26-0001", "26-0003", "26-0004"]);
});

test("an empty labels filter matches every issue; a chosen set keeps an issue carrying any one of them", () => {
  const tagged = [...all, issue({ key: "26-0005", status: "open", labels: ["bug"] }), issue({ key: "26-0006", status: "open", labels: ["urgent"] })];
  expect(keys(filterIssues(tagged, { ...DEFAULT_FILTER, labels: [] }, today, "alice", DEFAULT_STATUSES))).toEqual(["26-0001", "26-0003", "26-0004", "26-0005", "26-0006"]);
  expect(keys(filterIssues(tagged, { ...DEFAULT_FILTER, labels: ["bug", "urgent"] }, today, "alice", DEFAULT_STATUSES))).toEqual(["26-0005", "26-0006"]);
});
