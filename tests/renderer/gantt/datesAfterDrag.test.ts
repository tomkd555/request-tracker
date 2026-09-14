import { expect, test } from "vitest";
import { datesAfterDrag, rangeFor } from "../../../src/renderer/gantt/layoutGantt";

const range = rangeFor("2026-09", 1);
import type { Issue } from "../../../src/shared/types";

const issue = (startDate: string | null, dueDate: string | null): Issue => ({
  key: "26-0001",
  summary: "",
  description: "",
  category: "",
  status: "open",
  priority: "normal",
  assignee: null,
  reporter: "a",
  parentKey: null,
  startDate,
  dueDate,
  createdAt: "2026-09-10T03:00:00.000Z",
  updatedAt: "",
  updatedBy: "",
});

test("move shifts both dates; a bar drawn from the created day gets that day as its start; a point keeps no due date", () => {
  expect(datesAfterDrag(issue("2026-09-01", "2026-09-05"), "move", 3, range)).toEqual({ startDate: "2026-09-04", dueDate: "2026-09-08" });
  expect(datesAfterDrag(issue(null, "2026-09-20"), "move", 5, range)).toEqual({ startDate: "2026-09-15", dueDate: "2026-09-25" });
  expect(datesAfterDrag(issue(null, "2026-09-05"), "move", -2, range)).toEqual({ startDate: "2026-09-08", dueDate: "2026-09-08" });
  expect(datesAfterDrag(issue("2026-09-05", null), "move", 1, range)).toEqual({ startDate: "2026-09-06", dueDate: null });
});

test("an edge never crosses the other date; a start edge on a due-only bar starts from the created day", () => {
  expect(datesAfterDrag(issue("2026-09-01", "2026-09-05"), "start", 10, range)).toEqual({ startDate: "2026-09-05", dueDate: "2026-09-05" });
  expect(datesAfterDrag(issue("2026-09-01", "2026-09-05"), "due", -10, range)).toEqual({ startDate: "2026-09-01", dueDate: "2026-09-01" });
  expect(datesAfterDrag(issue(null, "2026-09-20"), "start", 2, range)).toEqual({ startDate: "2026-09-12", dueDate: "2026-09-20" });
});

test("an edge clipped by the range moves from the visible edge", () => {
  expect(datesAfterDrag(issue("2026-08-20", "2026-09-10"), "start", 3, range)).toEqual({ startDate: "2026-09-04", dueDate: "2026-09-10" });
  expect(datesAfterDrag(issue("2026-09-20", "2026-10-15"), "due", -2, range)).toEqual({ startDate: "2026-09-20", dueDate: "2026-09-28" });
});
