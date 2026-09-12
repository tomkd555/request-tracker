import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createStore } from "../../../src/main/store";
import { collectionDirs, layout } from "../../../src/main/store/paths";
import type { IssueDraft } from "../../../src/shared/api";

let userData: string;
let shared: string;
beforeEach(async () => {
  userData = await fsp.mkdtemp(join(tmpdir(), "rt-userdata-"));
  shared = await fsp.mkdtemp(join(tmpdir(), "rt-shared-"));
});
afterEach(async () => {
  await fsp.rm(userData, { recursive: true, force: true });
  await fsp.rm(shared, { recursive: true, force: true });
});

const store = (chosen: string | null) =>
  createStore({
    userDataDir: userData,
    username: "alice",
    chooseDirectory: async () => chosen,
    chooseFiles: async () => null,
    openPath: async () => "",
  });

test("config.get is null on fresh userData and returns the root after chooseRoot", async () => {
  const s = store(shared);
  expect(await s.config.get()).toBeNull();
  expect(await s.config.chooseRoot()).toBe(shared);
  expect(await s.config.get()).toEqual({ rootDir: shared });
  expect(await store(null).config.get()).toEqual({ rootDir: shared });
});

test("chooseRoot cancelled leaves config untouched", async () => {
  const s = store(null);
  expect(await s.config.chooseRoot()).toBeNull();
  expect(await s.config.get()).toBeNull();
});

test("project.init creates project.json and every collection directory", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  expect(await s.project.get()).toBeNull();
  const p = await s.project.init(4);
  expect(p.fiscalYearStartMonth).toBe(4);
  expect(await s.project.get()).toEqual(p);
  for (const dir of collectionDirs(layout(shared))) {
    expect((await fsp.stat(dir)).isDirectory()).toBe(true);
  }
  await expect(s.project.init(13)).rejects.toThrow();
});

test("users.me is null until register writes users/<username>.json", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  expect(await s.users.me()).toBeNull();
  const u = await s.users.register(" Alice ");
  expect(u).toMatchObject({ username: "alice", displayName: "Alice" });
  expect(await s.users.me()).toEqual(u);
  expect(await s.users.list()).toEqual([u]);
  expect(await fsp.readdir(join(shared, "users"))).toEqual(["alice.json"]);
});

const draft = (over: Partial<IssueDraft> = {}): IssueDraft => ({
  summary: "s",
  description: "",
  status: "open",
  priority: "normal",
  assignee: null,
  reporter: "alice",
  parentKey: null,
  startDate: null,
  dueDate: null,
  createdAt: "2027-03-15T03:00:00.000Z",
  updatedAt: "2027-03-15T03:00:00.000Z",
  updatedBy: "alice",
  ...over,
});

test("issues.create allocates fiscal-year keys and makes the attachments folder", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  const a = await s.issues.create(draft());
  const b = await s.issues.create(draft());
  expect(a.key).toBe("26-0001");
  expect(b.key).toBe("26-0002");
  expect((await fsp.stat(join(shared, "attachments", "26-0001"))).isDirectory()).toBe(true);
  expect((await s.issues.list()).map((i) => i.key)).toEqual(["26-0001", "26-0002"]);
  const c = await s.issues.create(draft({ createdAt: "2027-04-01T03:00:00.000Z" }));
  expect(c.key).toBe("27-0001");
});

test("a key whose issue sits in trash is never reallocated", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  await s.issues.create(draft());
  await s.issues.remove("26-0001");
  expect((await s.issues.create(draft())).key).toBe("26-0002");
});

test("concurrent creates from two stores get distinct keys", async () => {
  const s1 = store(shared);
  await s1.config.chooseRoot();
  await s1.project.init(4);
  const s2 = store(null);
  await s2.config.get();
  const keys = (await Promise.all([s1.issues.create(draft()), s2.issues.create(draft()), s1.issues.create(draft())])).map((i) => i.key);
  expect(new Set(keys).size).toBe(3);
});

test("issues.remove refuses a parent with children and trashes a leaf", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  await s.issues.create(draft());
  await s.issues.create(draft({ parentKey: "26-0001" }));
  await expect(s.issues.remove("26-0001")).rejects.toThrow("has-children");
  await s.issues.remove("26-0002");
  expect((await s.issues.list()).map((i) => i.key)).toEqual(["26-0001"]);
  await s.issues.remove("26-0001");
  expect(await s.issues.list()).toEqual([]);
  expect((await fsp.readdir(join(shared, "trash", "issues"))).sort()).toEqual(["26-0001.json", "26-0002.json"]);
  expect((await fsp.stat(join(shared, "attachments", "26-0001"))).isDirectory()).toBe(true);
});

test("comments are one file each and list in creation order", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  await s.issues.create(draft());
  const at = (sec: number): string => `2026-09-12T00:00:0${sec}.000Z`;
  await Promise.all([
    s.comments.add({ id: "", issueKey: "26-0001", author: "bob", body: "second", createdAt: at(2) }),
    s.comments.add({ id: "", issueKey: "26-0001", author: "alice", body: "first ", createdAt: at(1) }),
    s.comments.add({ id: "", issueKey: "26-0001", author: "alice", body: "same second", createdAt: at(2) }),
  ]);
  const list = await s.comments.list("26-0001");
  expect(list.map((c) => `${c.author}:${c.body}`)).toEqual(["alice:first", "alice:same second", "bob:second"]);
  expect(await fsp.readdir(join(shared, "comments", "26-0001"))).toHaveLength(3);
  await expect(s.comments.add({ id: "", issueKey: "26-0001", author: "bob", body: "  ", createdAt: at(3) })).rejects.toThrow("empty");
});

test("methods needing the shared folder reject before it is configured", async () => {
  await expect(store(null).users.me()).rejects.toThrow("not configured");
});
