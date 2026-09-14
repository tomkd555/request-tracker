import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { collection, mkdirp } from "../../../src/main/store/collection";
import { isIssue, type Issue } from "../../../src/shared/types";

let root: string;
beforeEach(async () => {
  root = await fsp.mkdtemp(join(tmpdir(), "rt-collection-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fsp.rm(root, { recursive: true, force: true });
});

const issue = (over: Partial<Issue> = {}): Issue => ({
  key: "26-0001",
  summary: "first",
  description: "",
  category: "",
  status: "open",
  priority: "normal",
  assignee: null,
  reporter: "alice",
  parentKey: null,
  startDate: null,
  dueDate: null,
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
  updatedBy: "alice",
  ...over,
});

const issues = () =>
  collection<Issue>({
    dir: join(root, "issues"),
    guard: isIssue,
    historyDir: join(root, "history", "issues"),
    trashDir: join(root, "trash", "issues"),
  });

test("create then list and get", async () => {
  const c = issues();
  await c.create("26-0001", issue());
  expect(await c.list()).toEqual([issue()]);
  expect(await c.get("26-0001")).toEqual(issue());
  expect(await c.get("26-0002")).toBeNull();
});

test("concurrent create of the same id: exactly one succeeds with EEXIST for the other", async () => {
  const c = issues();
  const results = await Promise.allSettled([c.create("26-0001", issue()), c.create("26-0001", issue())]);
  const codes = results.map((r) => (r.status === "rejected" ? (r.reason as NodeJS.ErrnoException).code : "ok"));
  expect(codes.sort()).toEqual(["EEXIST", "ok"]);
});

test("put archives the previous version under history", async () => {
  const c = issues();
  await c.create("26-0001", issue());
  await c.put("26-0001", issue({ summary: "second", updatedAt: "2026-09-12T01:00:00.000Z" }));
  await c.put("26-0001", issue({ summary: "third", updatedAt: "2026-09-12T02:00:00.000Z" }));
  const files = await fsp.readdir(join(root, "history", "issues", "26-0001"));
  expect(files).toEqual(["20260912T000000000Z.json", "20260912T010000000Z.json"]);
  expect((await c.history("26-0001")).map((i) => i.summary)).toEqual(["first", "second"]);
  expect((await c.get("26-0001"))?.summary).toBe("third");
});

test("a write interrupted before rename leaves the target intact and only the temp file behind", async () => {
  const c = issues();
  await c.create("26-0001", issue());
  vi.spyOn(fsp, "rename").mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "EIO" }));
  await expect(c.put("26-0001", issue({ summary: "lost" }))).rejects.toThrow("boom");
  expect((await c.get("26-0001"))?.summary).toBe("first");
  const names = (await fsp.readdir(join(root, "issues"))).sort();
  expect(names).toHaveLength(2);
  expect(names[0]).toMatch(new RegExp(`^\\.26-0001\\.json\\.tmp-${process.pid}-\\d+$`));
  expect(names[1]).toBe("26-0001.json");
  expect(await c.list()).toHaveLength(1);
});

test("remove moves the file to trash", async () => {
  const c = issues();
  await c.create("26-0001", issue());
  await c.remove("26-0001");
  expect(await c.list()).toEqual([]);
  expect(await fsp.readdir(join(root, "trash", "issues"))).toEqual(["26-0001.json"]);
});

test("a corrupt file is skipped and the rest of the collection lists", async () => {
  const c = issues();
  await c.create("26-0001", issue());
  await fsp.writeFile(join(root, "issues", "26-0002.json"), "{ not json", "utf8");
  await fsp.writeFile(join(root, "issues", "26-0003.json"), JSON.stringify({ key: "26-0003" }), "utf8");
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  expect((await c.list()).map((i) => i.key)).toEqual(["26-0001"]);
  expect(err).toHaveBeenCalledTimes(2);
});

test("mkdirp creates nested folders, accepts existing ones, and rejects a parent that refuses entries", async () => {
  await mkdirp(join(root, "a", "b", "c"));
  await mkdirp(join(root, "a", "b", "c"));
  expect((await fsp.stat(join(root, "a", "b", "c"))).isDirectory()).toBe(true);
  await fsp.writeFile(join(root, "file"), "", "utf8");
  await expect(mkdirp(join(root, "file", "under"))).rejects.toMatchObject({ code: expect.stringMatching(/^E/) });
});
