import { expect, test } from "vitest";
import { ancestorsOf, depthOf, descendantKeysOf, heightOf, MAX_DEPTH, parentRefusal } from "../../src/shared/issueTree";
import type { Issue } from "../../src/shared/types";

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

// 1 > 2 > 3 > 4 (a chain of four) and 1 > 5; 9 > 8 apart.
const all = [issue("1"), issue("2", "1"), issue("3", "2"), issue("4", "3"), issue("5", "1"), issue("9"), issue("8", "9")];
const byKey = new Map(all.map((i) => [i.key, i]));

test("ancestors run root first; depth counts the root as 1; height counts a leaf as 1", () => {
  expect(ancestorsOf(byKey, "4").map((i) => i.key)).toEqual(["1", "2", "3"]);
  expect(depthOf(byKey, "1")).toBe(1);
  expect(depthOf(byKey, "4")).toBe(4);
  expect(heightOf(all, "1")).toBe(4);
  expect(heightOf(all, "5")).toBe(1);
  expect([...descendantKeysOf(all, "2")].sort()).toEqual(["2", "3", "4"]);
});

test("a missing parent or a cycle in hand-edited data ends the walk", () => {
  const odd = [issue("a", "b"), issue("b", "a"), issue("c", "zzz")];
  const m = new Map(odd.map((i) => [i.key, i]));
  expect(ancestorsOf(m, "a").map((i) => i.key)).toEqual(["b"]);
  expect(ancestorsOf(m, "c")).toEqual([]);
  expect(heightOf(odd, "a")).toBe(2);
});

test("parentRefusal: the issue itself or one under it is a cycle; a chain past MAX_DEPTH is too deep; otherwise null", () => {
  expect(MAX_DEPTH).toBe(5);
  expect(parentRefusal(all, "1", "1")).toBe("cycle");
  expect(parentRefusal(all, "1", "4")).toBe("cycle");
  expect(parentRefusal(all, null, "4")).toBeNull(); // a new leaf makes level 5
  expect(parentRefusal(all, "9", "4")).toBe("too-deep"); // two levels under level 4 make six
  expect(parentRefusal(all, "1", "9")).toBeNull(); // four levels under a root make five
  expect(parentRefusal(all, "1", "8")).toBe("too-deep"); // four levels under level 2 make six
  expect(parentRefusal(all, "2", "5")).toBeNull(); // three levels under level 2 make five
  expect(parentRefusal(all, "5", "4")).toBeNull();
});
