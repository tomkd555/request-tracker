import { expect, test } from "vitest";
import { addRelation, relatedIssues, relationRows } from "../../../src/renderer/issues/relatedIssues";
import type { Issue } from "../../../src/shared/types";

const issue = (key: string, over: Partial<Issue> = {}): Issue => ({
  key,
  summary: key,
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

test("mentions in either direction, excluding parent, children and code spans", () => {
  const all = [
    issue("26-0001", { description: "see 26-0002 and 26-0003 and 26-0004 and `26-0006`" }),
    issue("26-0002"),
    issue("26-0003", { parentKey: "26-0001" }),
    issue("26-0004", { parentKey: null }),
    issue("26-0005", { description: "follows 26-0001" }),
    issue("26-0006"),
    issue("26-0007", { description: "unrelated" }),
  ];
  const byKey = new Map(all.map((i) => [i.key, i]));
  expect(relatedIssues(byKey.get("26-0001")!, byKey).map((i) => i.key)).toEqual(["26-0002", "26-0004", "26-0005"]);
  expect(relatedIssues(byKey.get("26-0003")!, byKey).map((i) => i.key)).toEqual([]);
  expect(relatedIssues(byKey.get("26-0007")!, byKey)).toEqual([]);
});

test("relationRows: own relations in written order, then relations others wrote naming this issue, dropping a missing key and a self link", () => {
  const all = [
    issue("26-0001", {
      relations: [
        { type: "precedes", key: "26-0002" },
        { type: "relates", key: "26-0099" }, // no such issue
        { type: "duplicates", key: "26-0001" }, // itself
      ],
    }),
    issue("26-0002"),
    issue("26-0003", { relations: [{ type: "duplicates", key: "26-0001" }] }),
  ];
  const byKey = new Map(all.map((i) => [i.key, i]));
  expect(relationRows(byKey.get("26-0001")!, byKey)).toEqual([
    { direction: "out", type: "precedes", key: "26-0002", summary: "26-0002", status: "open" },
    { direction: "in", type: "duplicates", key: "26-0003", summary: "26-0003", status: "open" },
  ]);
});

test("relationRows: both sides written independently show one row each way", () => {
  const all = [issue("26-0001", { relations: [{ type: "relates", key: "26-0002" }] }), issue("26-0002", { relations: [{ type: "relates", key: "26-0001" }] })];
  const byKey = new Map(all.map((i) => [i.key, i]));
  expect(relationRows(byKey.get("26-0001")!, byKey)).toEqual([
    { direction: "out", type: "relates", key: "26-0002", summary: "26-0002", status: "open" },
    { direction: "in", type: "relates", key: "26-0002", summary: "26-0002", status: "open" },
  ]);
});

test("addRelation appends, and is a no-op on an exact {type, key} duplicate", () => {
  const relations = addRelation([], { type: "precedes", key: "26-0002" });
  expect(relations).toEqual([{ type: "precedes", key: "26-0002" }]);
  expect(addRelation(relations, { type: "precedes", key: "26-0002" })).toBe(relations);
  expect(addRelation(relations, { type: "relates", key: "26-0002" })).toEqual([
    { type: "precedes", key: "26-0002" },
    { type: "relates", key: "26-0002" },
  ]);
});
