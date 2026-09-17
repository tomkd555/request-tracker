import { expect, test } from "vitest";
import { BULK_MAX, bulkApply } from "../../../src/renderer/issues/bulkEdit";
import type { Issue } from "../../../src/shared/types";

const issue = (over: Partial<Issue>): Issue => ({
  key: "26-0001",
  summary: "",
  description: "",
  category: "",
  status: "open",
  priority: "normal",
  assignee: "alice",
  reporter: "alice",
  parentKey: null,
  startDate: null,
  dueDate: "2026-09-10",
  createdAt: "",
  updatedAt: "",
  updatedBy: "",
  fields: {},
  labels: ["bug"],
  relations: [],
  ...over,
});

test("an empty patch changes nothing", () => {
  expect(bulkApply(issue({}), {})).toBeNull();
});

test("status alone", () => {
  expect(bulkApply(issue({ status: "open" }), { status: "closed" })).toEqual({ status: "closed" });
});

test("status already at the target value is a no-op", () => {
  expect(bulkApply(issue({ status: "closed" }), { status: "closed" })).toBeNull();
});

test("assignee alone, and clearing it with null", () => {
  expect(bulkApply(issue({ assignee: "alice" }), { assignee: "bob" })).toEqual({ assignee: "bob" });
  expect(bulkApply(issue({ assignee: "alice" }), { assignee: null })).toEqual({ assignee: null });
  expect(bulkApply(issue({ assignee: null }), { assignee: null })).toBeNull();
});

test("dueDate alone, and clearing it with null", () => {
  expect(bulkApply(issue({ dueDate: "2026-09-10" }), { dueDate: "2026-09-20" })).toEqual({ dueDate: "2026-09-20" });
  expect(bulkApply(issue({ dueDate: "2026-09-10" }), { dueDate: null })).toEqual({ dueDate: null });
  expect(bulkApply(issue({ dueDate: null }), { dueDate: null })).toBeNull();
});

test("addLabel alone, absent and already-present", () => {
  expect(bulkApply(issue({ labels: ["bug"] }), { addLabel: "urgent" })).toEqual({ labels: ["bug", "urgent"] });
  expect(bulkApply(issue({ labels: ["bug"] }), { addLabel: "bug" })).toBeNull();
});

test("removeLabel alone, present and already-absent", () => {
  expect(bulkApply(issue({ labels: ["bug", "urgent"] }), { removeLabel: "urgent" })).toEqual({ labels: ["bug"] });
  expect(bulkApply(issue({ labels: ["bug"] }), { removeLabel: "urgent" })).toBeNull();
});

test("addLabel and removeLabel combine with the other fields", () => {
  expect(
    bulkApply(issue({ status: "open", assignee: "alice", dueDate: "2026-09-10", labels: ["bug"] }), {
      status: "closed",
      assignee: "bob",
      dueDate: null,
      addLabel: "urgent",
      removeLabel: "bug",
    }),
  ).toEqual({ status: "closed", assignee: "bob", dueDate: null, labels: ["urgent"] });
});

test("BULK_MAX is 100", () => {
  expect(BULK_MAX).toBe(100);
});
