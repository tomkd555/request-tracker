import { expect, test } from "vitest";
import { searchAll, snippet } from "../../../src/renderer/search/searchAll";
import type { Comment, Issue, WikiPage } from "../../../src/shared/types";

const issue = (over: Partial<Issue> = {}): Issue => ({
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

const comment = (over: Partial<Comment> = {}): Comment => ({
  id: "c1",
  issueKey: "26-0002",
  author: "bob",
  body: "",
  createdAt: "2026-09-15T00:00:00.000Z",
  ...over,
});

const page = (over: Partial<WikiPage> = {}): WikiPage => ({
  id: "20260915T000000000Z",
  title: "",
  body: "",
  parentId: null,
  note: "",
  createdAt: "",
  createdBy: "alice",
  updatedAt: "",
  updatedBy: "alice",
  ...over,
});

test("searchAll groups hits 課題 → コメント → Wiki, in that order", () => {
  const issues = [issue({ key: "26-0001", summary: "配線図の確認" })];
  const comments = [comment({ issueKey: "26-0002", body: "配線図を添付しました" })];
  const pages = [page({ id: "p1", title: "配線図まとめ" })];
  const hits = searchAll("配線図", issues, comments, pages);
  expect(hits.map((h) => h.kind)).toEqual(["issue", "comment", "wiki"]);
  expect(hits[0]).toMatchObject({ id: "26-0001", title: "26-0001 配線図の確認" });
  expect(hits[2]).toMatchObject({ id: "p1", title: "配線図まとめ" });
});

test("a comment hit carries the issue key as id and the comment's createdAt as at", () => {
  const comments = [comment({ issueKey: "26-0009", body: "配線図の写真です", createdAt: "2026-09-16T01:02:03.000Z" })];
  const [hit] = searchAll("配線図", [], comments, []);
  expect(hit).toMatchObject({ kind: "comment", id: "26-0009", at: "2026-09-16T01:02:03.000Z" });
});

test("matching case-folds the comment body", () => {
  const comments = [comment({ body: "The Wiring Diagram is attached" })];
  expect(searchAll("wiring diagram", [], comments, [])).toHaveLength(1);
});

test("a blank keyword finds nothing", () => {
  expect(searchAll("  ", [issue({ summary: "x" })], [], [])).toEqual([]);
});

test("snippet centers the match with an ellipsis on each cut edge", () => {
  const text = "a".repeat(60) + "KEYWORD" + "b".repeat(60);
  const s = snippet(text, "keyword", 10);
  expect(s.startsWith("…")).toBe(true);
  expect(s.endsWith("…")).toBe(true);
  expect(s.toLowerCase()).toContain("keyword");
});

test("snippet keeps an edge intact when the match sits within the radius of it", () => {
  expect(snippet("KEYWORD" + "b".repeat(60), "keyword", 10).startsWith("…")).toBe(false);
  expect(snippet("a".repeat(60) + "KEYWORD", "keyword", 10).endsWith("…")).toBe(false);
});

test("snippet collapses newlines and takes the head of the text when the keyword is absent", () => {
  expect(snippet("line one\nline two", "missing", 40)).toBe("line one line two");
  expect(snippet("x".repeat(200), "missing", 10)).toBe(`${"x".repeat(20)}…`);
});
