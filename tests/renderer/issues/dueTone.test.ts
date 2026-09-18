import { expect, test } from "vitest";
import { dueTone } from "../../../src/renderer/issues/dueTone";
import { DEFAULT_STATUSES, type Issue } from "../../../src/shared/types";

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

test("overdue when due before today and still open", () => {
  expect(dueTone(issue({ dueDate: "2026-09-11" }), today, 3, DEFAULT_STATUSES)).toBe("overdue");
  expect(dueTone(issue({ dueDate: "2026-09-11", status: "in_progress" }), today, 3, DEFAULT_STATUSES)).toBe("overdue");
});

test("soon from today through three days ahead", () => {
  expect(dueTone(issue({ dueDate: "2026-09-12" }), today, 3, DEFAULT_STATUSES)).toBe("soon");
  expect(dueTone(issue({ dueDate: "2026-09-15" }), today, 3, DEFAULT_STATUSES)).toBe("soon");
  expect(dueTone(issue({ dueDate: "2026-09-16" }), today, 3, DEFAULT_STATUSES)).toBe("none");
});

test("none without a due date or once resolved or closed", () => {
  expect(dueTone(issue({}), today, 3, DEFAULT_STATUSES)).toBe("none");
  expect(dueTone(issue({ dueDate: "2026-09-01", status: "resolved" }), today, 3, DEFAULT_STATUSES)).toBe("none");
  expect(dueTone(issue({ dueDate: "2026-09-01", status: "closed" }), today, 3, DEFAULT_STATUSES)).toBe("none");
});

test("soonDays widens or removes the soon window", () => {
  expect(dueTone(issue({ dueDate: "2026-09-19" }), today, 7, DEFAULT_STATUSES)).toBe("soon");
  expect(dueTone(issue({ dueDate: "2026-09-20" }), today, 7, DEFAULT_STATUSES)).toBe("none");
  expect(dueTone(issue({ dueDate: "2026-09-12" }), today, 0, DEFAULT_STATUSES)).toBe("soon");
  expect(dueTone(issue({ dueDate: "2026-09-13" }), today, 0, DEFAULT_STATUSES)).toBe("none");
});
