import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { collection, LIST_TTL_MS, mapLimit, mkdirp } from "../../../src/main/store/collection";
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
  fields: {},
  labels: [],
  relations: [],
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

test("a write interrupted before rename leaves the target intact and removes its temp file", async () => {
  const c = issues();
  await c.create("26-0001", issue());
  vi.spyOn(fsp, "rename").mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "EIO" }));
  await expect(c.put("26-0001", issue({ summary: "lost" }))).rejects.toThrow("boom");
  expect((await c.get("26-0001"))?.summary).toBe("first");
  expect((await fsp.readdir(join(root, "issues"))).sort()).toEqual(["26-0001.json"]);
  expect(await c.list()).toHaveLength(1);
});

test("remove moves the file to trash", async () => {
  const c = issues();
  await c.create("26-0001", issue());
  await c.remove("26-0001");
  expect(await c.list()).toEqual([]);
  expect(await fsp.readdir(join(root, "trash", "issues"))).toEqual(["26-0001.json"]);
});

test("a corrupt file is skipped and the rest of the collection lists in file-name order", async () => {
  const c = issues();
  await c.create("26-0004", issue({ key: "26-0004" }));
  await c.create("26-0001", issue());
  await fsp.writeFile(join(root, "issues", "26-0002.json"), "{ not json", "utf8");
  await fsp.writeFile(join(root, "issues", "26-0003.json"), JSON.stringify({ key: "26-0003" }), "utf8");
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  expect((await c.list()).map((i) => i.key)).toEqual(["26-0001", "26-0004"]);
  expect(err).toHaveBeenCalledTimes(2);
});

test("two list calls in flight share one read and each gets its own array", async () => {
  const c = collection<Issue>({ dir: join(root, "issues"), guard: isIssue });
  await c.create("26-0001", issue());
  const readdir = vi.spyOn(fsp, "readdir");
  const [a, b] = await Promise.all([c.list(), c.list()]);
  expect(readdir).toHaveBeenCalledTimes(1);
  expect(a).toEqual(b);
  expect(a).not.toBe(b);
});

test("a write during an in-flight read is never cached: the next list reads again", async () => {
  const dir = join(root, "issues");
  const c = collection<Issue>({ dir, guard: isIssue });
  await c.create("26-0001", issue());
  const real = fsp.readdir.bind(fsp) as (p: string) => Promise<string[]>;
  let open = (): void => {};
  const gate = new Promise<void>((r) => {
    open = r;
  });
  const gated = async (p: string): Promise<string[]> => {
    const names = await real(p); // the names as they were before the write below
    await gate;
    return names;
  };
  const readdir = vi.spyOn(fsp, "readdir").mockImplementationOnce(gated as unknown as typeof fsp.readdir);
  const early = c.list();
  await c.create("26-0002", issue({ key: "26-0002" }));
  open();
  expect(await early).toHaveLength(1);
  expect((await c.list()).map((i) => i.key)).toEqual(["26-0001", "26-0002"]);
  expect(readdir).toHaveBeenCalledTimes(2);
});

test("mkdirp creates nested folders, accepts existing ones, and rejects a parent that refuses entries", async () => {
  await mkdirp(join(root, "a", "b", "c"));
  await mkdirp(join(root, "a", "b", "c"));
  expect((await fsp.stat(join(root, "a", "b", "c"))).isDirectory()).toBe(true);
  await fsp.writeFile(join(root, "file"), "", "utf8");
  await expect(mkdirp(join(root, "file", "under"))).rejects.toMatchObject({ code: expect.stringMatching(/^E/) });
});

test("list is served from memory while the directory mtime holds, and re-read after an own write or an outside write", async () => {
  const dir = join(root, "issues");
  const c = collection<Issue>({ dir, guard: isIssue });
  await c.create("26-0001", issue());
  expect(await c.list()).toHaveLength(1);
  const readdir = vi.spyOn(fsp, "readdir");
  expect(await c.list()).toHaveLength(1);
  expect(readdir).not.toHaveBeenCalled();
  await c.create("26-0002", issue({ key: "26-0002" }));
  expect(await c.list()).toHaveLength(2);
  expect(readdir).toHaveBeenCalledTimes(1);
  await new Promise((r) => setTimeout(r, 20)); // mtime resolution
  await fsp.writeFile(join(dir, "26-0003.json"), JSON.stringify(issue({ key: "26-0003" })), "utf8");
  expect(await c.list()).toHaveLength(3);
  expect(readdir).toHaveBeenCalledTimes(2);
});

test("a removed record leaves the listing; an absent directory lists empty and is read once it appears; a caller's sort never reaches the cache", async () => {
  const dir = join(root, "issues");
  const c = collection<Issue>({ dir, guard: isIssue, trashDir: join(root, "trash") });
  expect(await c.list()).toEqual([]);
  await c.create("26-0001", issue());
  await c.create("26-0002", issue({ key: "26-0002" }));
  expect(await c.list()).toHaveLength(2);
  const first = await c.list();
  first.reverse();
  first.push(issue({ key: "26-0009" }));
  expect((await c.list()).map((i) => i.key)).toEqual(["26-0001", "26-0002"]);
  await c.remove("26-0001");
  expect((await c.list()).map((i) => i.key)).toEqual(["26-0002"]);
});

test("an id may carry a space or Japanese, as an OS login does, and never a path separator", async () => {
  const dir = join(root, "users");
  const c = collection<Issue>({ dir, guard: isIssue });
  await c.create("山田 太郎", issue());
  expect(await c.get("山田 太郎")).not.toBeNull();
  for (const bad of ["..\\x", "a/b", "..", "con:", "ab"]) expect(() => c.get(bad)).toThrow("invalid id");
});

test("a listing older than LIST_TTL_MS is re-read even when the directory mtime holds", async () => {
  const dir = join(root, "issues");
  const c = collection<Issue>({ dir, guard: isIssue });
  await c.create("26-0001", issue());
  expect(await c.list()).toHaveLength(1);
  const readdir = vi.spyOn(fsp, "readdir");
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + LIST_TTL_MS + 1);
  expect(await c.list()).toHaveLength(1);
  expect(readdir).toHaveBeenCalledTimes(1);
});

test("mapLimit keeps the order of the results and never runs more than the limit at once", async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await mapLimit(
    [5, 1, 4, 2, 3],
    async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, n));
      inFlight--;
      return n * 10;
    },
    2,
  );
  expect(out).toEqual([50, 10, 40, 20, 30]);
  expect(peak).toBe(2);
});
