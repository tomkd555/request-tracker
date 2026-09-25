import { expect, test } from "vitest";
import { expandVariables, parseBlockLine, parseBody, resolveMonth, scopeIssues, serializeBlock, type ReportContext } from "../../../src/renderer/reports/blocks";
import { DEFAULT_STATUSES, type Issue, type Project, type User } from "../../../src/shared/types";

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
  updatedAt: "2026-09-10T03:00:00.000Z",
  updatedBy: "alice",
  fields: {},
  labels: [],
  relations: [],
  ...over,
});

const project: Project = {
  fiscalYearStartMonth: 4,
  createdAt: "2026-01-01T00:00:00.000Z",
  categories: [],
  categoryColors: {},
  categoryTemplates: {},
  fields: [],
  labels: [],
  statuses: DEFAULT_STATUSES,
};

const alice: User = { username: "alice", displayName: "佐藤", createdAt: "2026-01-01T00:00:00.000Z" };
const users: User[] = [alice];

const ctx = (over: Partial<ReportContext> = {}): ReportContext => ({ issues: [], users, project, me: alice, today: "2026-09-15", ...over });

test("parseBlockLine: an ordinary line is null; a bare kind and valid JSON both parse", () => {
  expect(parseBlockLine("課題の一覧です")).toBeNull();
  expect(parseBlockLine("::issues")).toEqual({ block: { kind: "issues" } });
  expect(parseBlockLine('::issues {"columns":["key","summary"]}')).toEqual({ block: { kind: "issues", columns: ["key", "summary"] } });
});

test("parseBlockLine: broken JSON and a wrong-typed or out-of-range field are invalid; an unknown key survives unvalidated", () => {
  expect(parseBlockLine('::issues {"columns":}')).toEqual({ invalid: true });
  expect(parseBlockLine('::issues {"columns":"key"}')).toEqual({ invalid: true });
  expect(parseBlockLine('::gantt {"months":5}')).toEqual({ invalid: true });
  expect(parseBlockLine('::issues {"extra":"x"}')).toEqual({ block: { kind: "issues", extra: "x" } });
});

test("parseBlockLine: a kind followed by an unclosed brace is invalid, never Markdown", () => {
  expect(parseBlockLine('::issues {"oops"')).toEqual({ invalid: true });
  expect(parseBlockLine("::issues x")).toEqual({ invalid: true });
});

test("parseBlockLine: sort must be a fixed key or a field: key", () => {
  expect(parseBlockLine('::issues {"sort":"dueDate"}')).toEqual({ block: { kind: "issues", sort: "dueDate" } });
  expect(parseBlockLine('::issues {"sort":"field:abc"}')).toEqual({ block: { kind: "issues", sort: "field:abc" } });
  expect(parseBlockLine('::issues {"sort":"startDate"}')).toEqual({ invalid: true });
});

test("parseBody leaves a block line inside a code fence as Markdown", () => {
  const segs = parseBody("```\n::issues\n```\n::issues");
  expect(segs.map((s) => s.kind)).toEqual(["markdown", "block"]);
  expect(segs[1]).toEqual({ kind: "block", block: { kind: "issues" }, line: 4 });
});

test("parseBody splits Markdown runs from block lines and numbers lines from 1", () => {
  const body = "前置き\n::issues\n本文\n本文2\n::summary {,}";
  expect(parseBody(body)).toEqual([
    { kind: "markdown", text: "前置き" },
    { kind: "block", block: { kind: "issues" }, line: 2 },
    { kind: "markdown", text: "本文\n本文2" },
    { kind: "invalid", line: 5, text: "::summary {,}" },
  ]);
});

test("serializeBlock round-trips through parseBlockLine; an empty params object is left off", () => {
  const block = { kind: "gantt" as const, month: "2026-08", months: 2 as const };
  const line = serializeBlock(block);
  expect(line).toBe('::gantt {"month":"2026-08","months":2}');
  expect(parseBlockLine(line)).toEqual({ block });
  expect(serializeBlock({ kind: "issues" })).toBe("::issues");
});

test("resolveMonth: current, previous and a fixed month", () => {
  expect(resolveMonth("current", "2026-09-15")).toBe("2026-09");
  expect(resolveMonth("previous", "2026-09-15")).toBe("2026-08");
  expect(resolveMonth("2026-01", "2026-09-15")).toBe("2026-01");
  expect(resolveMonth(undefined, "2026-09-15")).toBe("2026-09");
});

test("scopeIssues narrows by keys, statuses, createdIn and updatedIn", () => {
  const issues = [
    issue({ key: "26-0001", status: "open", createdAt: "2026-09-05T03:00:00.000Z", updatedAt: "2026-09-06T03:00:00.000Z" }),
    issue({ key: "26-0002", status: "closed", createdAt: "2026-08-05T03:00:00.000Z", updatedAt: "2026-09-07T03:00:00.000Z" }),
    issue({ key: "26-0003", status: "open", createdAt: "2026-09-05T03:00:00.000Z", updatedAt: "2026-08-05T03:00:00.000Z" }),
  ];
  const c = ctx({ issues });
  expect(scopeIssues(issues, { keys: ["26-0001"] }, c).map((i) => i.key)).toEqual(["26-0001"]);
  expect(scopeIssues(issues, { statuses: ["closed"] }, c).map((i) => i.key)).toEqual(["26-0002"]);
  expect(scopeIssues(issues, { createdIn: "2026-08" }, c).map((i) => i.key)).toEqual(["26-0002"]);
  expect(scopeIssues(issues, { updatedIn: "2026-09" }, c).map((i) => i.key)).toEqual(["26-0001", "26-0002"]);
});

test("expandVariables replaces {{today}}, {{month}}, {{prevMonth}} and {{me}}", () => {
  const c = ctx({ today: "2026-09-15" });
  expect(expandVariables("作成日: {{today}} ({{month}} / 前月 {{prevMonth}}) by {{me}}", c)).toBe("作成日: 2026/09/15 (2026年9月 / 前月 2026年8月) by 佐藤");
});
