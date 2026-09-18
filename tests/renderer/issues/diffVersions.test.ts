import { expect, test } from "vitest";
import { changeEntries, diffVersions } from "../../../src/renderer/issues/diffVersions";
import { DEFAULT_STATUSES, type Issue } from "../../../src/shared/types";

const issue = (over: Partial<Issue>): Issue => ({
  key: "26-0001",
  summary: "A",
  description: "",
  category: "",
  status: "open",
  priority: "normal",
  assignee: null,
  reporter: "alice",
  parentKey: null,
  startDate: null,
  dueDate: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  updatedBy: "alice",
  fields: {},
  labels: [],
  relations: [],
  ...over,
});
const nameOf = (u: string | null): string => (u === "bob" ? "Bob" : u ?? "");

test("each differing field yields one line; unchanged fields yield none", () => {
  const a = issue({});
  const b = issue({ status: "in_progress", assignee: "bob", dueDate: "2026-09-20", description: "x" });
  expect(diffVersions(a, b, nameOf, [], DEFAULT_STATUSES)).toEqual(["状態: 未対応 → 処理中", "担当者: 未設定 → Bob", "期限日: なし → 2026-09-20", "詳細を編集"]);
  expect(diffVersions(a, a, nameOf, [], DEFAULT_STATUSES)).toEqual([]);
});

test("changeEntries stamps each change with the later version and skips empty diffs", () => {
  const h0 = issue({});
  const h1 = issue({ status: "in_progress", updatedAt: "2026-09-02T00:00:00.000Z", updatedBy: "bob" });
  const cur = issue({ status: "in_progress", summary: "B", updatedAt: "2026-09-03T00:00:00.000Z", updatedBy: "alice" });
  expect(changeEntries([h0, h1], cur, nameOf, [], DEFAULT_STATUSES)).toEqual([
    { at: "2026-09-02T00:00:00.000Z", by: "bob", lines: ["状態: 未対応 → 処理中"] },
    { at: "2026-09-03T00:00:00.000Z", by: "alice", lines: ["件名: A → B"] },
  ]);
  expect(changeEntries([], cur, nameOf, [], DEFAULT_STATUSES)).toEqual([]);
});

test("a 汎用列 that changed yields one line named after the column", () => {
  const fields = [{ id: "env", name: "環境", options: [] }];
  expect(diffVersions(issue({}), issue({ fields: { env: "本番" } }), nameOf, fields, DEFAULT_STATUSES)).toEqual(["環境: 未設定 → 本番"]);
  expect(diffVersions(issue({ fields: { env: "本番" } }), issue({ fields: { env: "本番" } }), nameOf, fields, DEFAULT_STATUSES)).toEqual([]);
});

test("labels join by a space; the same set on both sides yields no line", () => {
  expect(diffVersions(issue({}), issue({ labels: ["bug", "urgent"] }), nameOf, [], DEFAULT_STATUSES)).toEqual(["ラベル:  → bug urgent"]);
  expect(diffVersions(issue({ labels: ["bug"] }), issue({ labels: ["bug"] }), nameOf, [], DEFAULT_STATUSES)).toEqual([]);
});

test("a stage deleted since the save is named as such, never as the first stage", () => {
  expect(diffVersions(issue({ status: "gone" }), issue({ status: "in_progress" }), nameOf, [], DEFAULT_STATUSES)).toEqual(["状態: 削除された状態 → 処理中"]);
});
