import { expect, test } from "vitest";
import { dueTone } from "../../../src/renderer/issues/dueTone";
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
  createdAt: "",
  updatedAt: "",
  updatedBy: "",
  ...over,
});

const today = "2026-09-12";

test("overdue when due before today and still open", () => {
  expect(dueTone(issue({ dueDate: "2026-09-11" }), today)).toBe("overdue");
  expect(dueTone(issue({ dueDate: "2026-09-11", status: "in_progress" }), today)).toBe("overdue");
});

test("soon from today through three days ahead", () => {
  expect(dueTone(issue({ dueDate: "2026-09-12" }), today)).toBe("soon");
  expect(dueTone(issue({ dueDate: "2026-09-15" }), today)).toBe("soon");
  expect(dueTone(issue({ dueDate: "2026-09-16" }), today)).toBe("none");
});

test("none without a due date or once resolved or closed", () => {
  expect(dueTone(issue({}), today)).toBe("none");
  expect(dueTone(issue({ dueDate: "2026-09-01", status: "resolved" }), today)).toBe("none");
  expect(dueTone(issue({ dueDate: "2026-09-01", status: "closed" }), today)).toBe("none");
});

test("soonDays widens or removes the soon window", () => {
  expect(dueTone(issue({ dueDate: "2026-09-19" }), today, 7)).toBe("soon");
  expect(dueTone(issue({ dueDate: "2026-09-20" }), today, 7)).toBe("none");
  expect(dueTone(issue({ dueDate: "2026-09-12" }), today, 0)).toBe("soon");
  expect(dueTone(issue({ dueDate: "2026-09-13" }), today, 0)).toBe("none");
});
