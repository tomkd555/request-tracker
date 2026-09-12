import { expect, test } from "vitest";
import { datesAfterDrag } from "../../../src/renderer/gantt/layoutGantt";
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

test("move shifts both dates and leaves a missing one missing", () => {
  expect(datesAfterDrag(issue("2026-09-01", "2026-09-05"), "move", 3)).toEqual({ startDate: "2026-09-04", dueDate: "2026-09-08" });
  expect(datesAfterDrag(issue(null, "2026-09-05"), "move", -2)).toEqual({ startDate: null, dueDate: "2026-09-03" });
  expect(datesAfterDrag(issue("2026-09-05", null), "move", 1)).toEqual({ startDate: "2026-09-06", dueDate: null });
});

test("an edge never crosses the other date; a start edge on a due-only bar starts from the created day", () => {
  expect(datesAfterDrag(issue("2026-09-01", "2026-09-05"), "start", 10)).toEqual({ startDate: "2026-09-05", dueDate: "2026-09-05" });
  expect(datesAfterDrag(issue("2026-09-01", "2026-09-05"), "due", -10)).toEqual({ startDate: "2026-09-01", dueDate: "2026-09-01" });
  expect(datesAfterDrag(issue(null, "2026-09-20"), "start", 2)).toEqual({ startDate: "2026-09-12", dueDate: "2026-09-20" });
});
