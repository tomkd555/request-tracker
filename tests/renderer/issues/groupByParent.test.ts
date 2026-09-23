import { expect, test } from "vitest";
import { groupByParent } from "../../../src/renderer/issues/groupByParent";
import type { Issue } from "../../../src/shared/types";

const issue = (key: string, parentKey: string | null = null): Issue => ({
  key,
  summary: key,
  description: "",
  category: "",
  status: "open",
  priority: "normal",
  assignee: null,
  reporter: "alice",
  parentKey,
  startDate: null,
  dueDate: null,
  createdAt: "",
  updatedAt: "",
  updatedBy: "",
  fields: {},
  labels: [],
  relations: [],
});

test("parents descend, children ascend under their parent", () => {
  const rows = groupByParent([issue("26-0003", "26-0001"), issue("26-0001"), issue("26-0004"), issue("26-0002", "26-0001")]);
  expect(rows.map((r) => `${r.depth}:${r.issue.key}`)).toEqual(["0:26-0004", "0:26-0001", "1:26-0002", "1:26-0003"]);
});

test("descendants follow depth-first, each level in ascending key order", () => {
  const rows = groupByParent([issue("26-0001"), issue("26-0005", "26-0002"), issue("26-0002", "26-0001"), issue("26-0003", "26-0001"), issue("26-0004", "26-0003")]);
  expect(rows.map((r) => `${r.depth}:${r.issue.key}`)).toEqual(["0:26-0001", "1:26-0002", "2:26-0005", "1:26-0003", "2:26-0004"]);
});

test("a child whose parent is filtered out becomes a top-level row", () => {
  const rows = groupByParent([issue("26-0002", "26-0001"), issue("26-0003")]);
  expect(rows.map((r) => `${r.depth}:${r.issue.key}`)).toEqual(["0:26-0003", "0:26-0002"]);
});
