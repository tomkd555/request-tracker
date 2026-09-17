import { expect, test } from "vitest";
import { DEFAULT_FILTER } from "../../../src/renderer/issues/filterIssues";
import { removeFilter, sameFilter, upsertFilter } from "../../../src/renderer/issues/savedFilter";
import type { IssueFilter, SavedFilter } from "../../../src/shared/types";

const filter = (over: Partial<IssueFilter> = {}): IssueFilter => ({ ...DEFAULT_FILTER, ...over });

test("sameFilter compares statuses and labels as a set, and fields entry-wise", () => {
  expect(sameFilter(filter({ statuses: ["open", "closed"] }), filter({ statuses: ["closed", "open"] }))).toBe(true);
  expect(sameFilter(filter({ statuses: ["open"] }), filter({ statuses: ["open", "closed"] }))).toBe(false);
  expect(sameFilter(filter({ labels: ["a", "b"] }), filter({ labels: ["b", "a"] }))).toBe(true);
  expect(sameFilter(filter({ labels: ["a"] }), filter({ labels: ["a", "b"] }))).toBe(false);
  expect(sameFilter(filter({ fields: { a: "1" } }), filter({ fields: { a: "1" } }))).toBe(true);
  expect(sameFilter(filter({ fields: { a: "1" } }), filter({ fields: { a: "2" } }))).toBe(false);
  expect(sameFilter(filter({ fields: { a: "1" } }), filter({ fields: {} }))).toBe(false);
});

test("sameFilter compares every other field by equality", () => {
  expect(sameFilter(filter({ keyword: "x" }), filter({ keyword: "x" }))).toBe(true);
  expect(sameFilter(filter({ due: "overdue" }), filter({ due: "week" }))).toBe(false);
  expect(sameFilter(filter({ awaitingConfirmation: true }), filter({ awaitingConfirmation: false }))).toBe(false);
});

test("upsertFilter replaces the row of the same name and appends a new name", () => {
  const saved: SavedFilter[] = [{ name: "a", filter: filter() }];
  expect(upsertFilter(saved, "a", filter({ keyword: "x" }))).toEqual([{ name: "a", filter: filter({ keyword: "x" }) }]);
  expect(upsertFilter(saved, "b", filter({ keyword: "y" }))).toEqual([{ name: "a", filter: filter() }, { name: "b", filter: filter({ keyword: "y" }) }]);
});

test("removeFilter drops the named row and leaves the rest", () => {
  const saved: SavedFilter[] = [{ name: "a", filter: filter() }, { name: "b", filter: filter() }];
  expect(removeFilter(saved, "a")).toEqual([{ name: "b", filter: filter() }]);
  expect(removeFilter(saved, "missing")).toEqual(saved);
});
