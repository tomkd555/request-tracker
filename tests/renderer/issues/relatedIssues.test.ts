import { expect, test } from "vitest";
import { relatedIssues } from "../../../src/renderer/issues/relatedIssues";
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
