import { expect, test } from "vitest";
import { ancestorsOf, descendantIdsOf, flattenTree, searchPages, titleIndex } from "../../../src/renderer/wiki/wikiTree";
import type { WikiPage } from "../../../src/shared/types";

const page = (id: string, title: string, parentId: string | null, body = ""): WikiPage => ({
  id,
  title,
  body,
  parentId,
  note: "",
  createdAt: "",
  createdBy: "a",
  updatedAt: "",
  updatedBy: "a",
});

const pages = [page("3", "手順", "1"), page("1", "運用", null), page("2", "あ", "1"), page("4", "孤児", "missing"), page("5", "深い", "3")];

test("flattenTree nests children under parents by title; an orphan sits at the root", () => {
  expect(flattenTree(pages).map((r) => `${r.depth}:${r.page.title}`)).toEqual(["0:運用", "1:あ", "1:手順", "2:深い", "0:孤児"]);
});

test("ancestors run root first; descendants include the page itself", () => {
  expect(ancestorsOf(pages, "5").map((p) => p.id)).toEqual(["1", "3"]);
  expect(ancestorsOf(pages, "4")).toEqual([]);
  expect([...descendantIdsOf(pages, "1")].sort()).toEqual(["1", "2", "3", "5"]);
});

test("a cycle in the data ends the ancestor walk", () => {
  const loop = [page("a", "A", "b"), page("b", "B", "a")];
  expect(ancestorsOf(loop, "a").map((p) => p.id)).toEqual(["b"]);
});

test("titleIndex folds case and spaces and keeps the first page on a duplicate; search covers the body", () => {
  const idx = titleIndex([page("9", " Home ", null), page("8", "home", null)]);
  expect(idx.get("home")).toBe("8");
  expect(searchPages(pages.concat(page("6", "x", null, "集計の手順")), "集計").map((p) => p.id)).toEqual(["6"]);
  const all = searchPages(pages, "").map((p) => p.title);
  expect(all).toHaveLength(5);
  expect(all[0]).toBe("あ");
});
