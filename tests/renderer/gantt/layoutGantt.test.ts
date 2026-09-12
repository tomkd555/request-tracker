import { expect, test } from "vitest";
import { daysOf, layoutGantt, rangeForMonth } from "../../../src/renderer/gantt/layoutGantt";
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

const range = rangeForMonth("2026-09");
const today = "2026-09-12";

test("range spans the month plus seven days each side", () => {
  expect(range).toEqual({ start: "2026-08-25", end: "2026-10-07" });
  expect(daysOf(range)).toHaveLength(44);
});

test("a bar inside the range spans start to due inclusive", () => {
  const l = layoutGantt([issue({ startDate: "2026-09-01", dueDate: "2026-09-05" })], range, today);
  expect(l.rows).toEqual([{ key: "26-0001", summary: "", depth: 0, startCol: 7, span: 5, tone: "overdue" }]);
  expect(l.todayCol).toBe(18);
});

test("start before the range is clipped; due after the range is clipped", () => {
  const before = layoutGantt([issue({ startDate: "2026-08-01", dueDate: "2026-08-26" })], range, today);
  expect(before.rows[0]).toMatchObject({ startCol: 0, span: 2 });
  const after = layoutGantt([issue({ startDate: "2026-10-06", dueDate: "2026-11-30" })], range, today);
  expect(after.rows[0]).toMatchObject({ startCol: 42, span: 2, tone: "normal" });
});

test("no due date, or a bar entirely outside the range, is absent", () => {
  expect(layoutGantt([issue({})], range, today).rows).toEqual([]);
  expect(layoutGantt([issue({ startDate: "2026-11-01", dueDate: "2026-11-02" })], range, today).rows).toEqual([]);
});

test("start falls back to the created date; overdue and muted tones", () => {
  const open = layoutGantt([issue({ dueDate: "2026-09-11" })], range, today).rows[0];
  expect(open).toMatchObject({ startCol: 16, span: 2, tone: "overdue" });
  const closed = layoutGantt([issue({ dueDate: "2026-09-11", status: "closed" })], range, today).rows[0];
  expect(closed.tone).toBe("muted");
});

test("a due date before the start date still draws a one-day bar", () => {
  const l = layoutGantt([issue({ startDate: "2026-09-10", dueDate: "2026-09-05" })], range, today);
  expect(l.rows[0]).toMatchObject({ startCol: 16, span: 1 });
});

test("children sit under their parent", () => {
  const l = layoutGantt(
    [
      issue({ key: "26-0002", parentKey: "26-0001", dueDate: "2026-09-20" }),
      issue({ key: "26-0001", dueDate: "2026-09-30" }),
      issue({ key: "26-0003", dueDate: "2026-09-15" }),
    ],
    range,
    today,
  );
  expect(l.rows.map((r) => `${r.depth}:${r.key}`)).toEqual(["0:26-0003", "0:26-0001", "1:26-0002"]);
});
