import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createStore } from "../../../src/main/store";
import { collectionDirs, layout } from "../../../src/main/store/paths";
import type { IssueDraft } from "../../../src/shared/api";
import { DEFAULT_LOCAL_SETTINGS, DEFAULT_STATUSES, type IssueFilter, type SavedFilter } from "../../../src/shared/types";

let userData: string;
let shared: string;
beforeEach(async () => {
  userData = await fsp.mkdtemp(join(tmpdir(), "rt-userdata-"));
  shared = await fsp.mkdtemp(join(tmpdir(), "rt-shared-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fsp.rm(userData, { recursive: true, force: true });
  await fsp.rm(shared, { recursive: true, force: true });
});

const store = (chosen: string | null, username = "alice") =>
  createStore({
    userDataDir: userData,
    username,
    chooseDirectory: async () => chosen,
    chooseFiles: async () => null,
    openPath: async () => "",
    chooseSavePath: async () => join(userData, "out.csv"),
  });

test("config.get is null on fresh userData and returns the root after chooseRoot", async () => {
  const s = store(shared);
  expect(await s.config.get()).toBeNull();
  expect(await s.config.chooseRoot()).toBe(shared);
  expect(await s.config.get()).toEqual({ rootDir: shared, ...DEFAULT_LOCAL_SETTINGS });
  expect(await store(null).config.get()).toEqual({ rootDir: shared, ...DEFAULT_LOCAL_SETTINGS });
});

test("warm reads the share once at launch: the first list afterwards is served from memory; an unconfigured or unreachable share warms nothing", async () => {
  await expect(store(null).warm()).resolves.toBeUndefined();
  const s = store(shared);
  await s.config.chooseRoot();
  await s.users.add("山田 太郎");
  const fresh = store(null);
  await fresh.warm();
  const readdir = vi.spyOn(fsp, "readdir");
  expect(await fresh.users.list()).toHaveLength(1);
  expect(readdir).not.toHaveBeenCalled();
  await fsp.writeFile(join(userData, "config.json"), JSON.stringify({ rootDir: join(shared, "gone") }), "utf8");
  await expect(store(null).warm()).resolves.toBeUndefined();
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

test("project.get on an unreadable project.json reports it, and project.init never overwrites a file", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  await fsp.writeFile(layout(shared).projectFile, "{ not json", "utf8");
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(s.project.get()).rejects.toThrow("project-invalid");
  await expect(s.project.init(4)).rejects.toThrow();
  expect(await fsp.readFile(layout(shared).projectFile, "utf8")).toBe("{ not json");
  err.mockRestore();
});

test("project.get on a root that does not exist reports the share as unreachable", async () => {
  const s = store(join(shared, "missing"));
  await s.config.chooseRoot();
  await expect(s.project.get()).rejects.toThrow("share-unreachable");
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
  category: "",
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
  fields: {},
  labels: [],
  relations: [],
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

test("issues.put guards a stale write: a matching stamp succeeds with history, a stale stamp rejects leaving the file and history untouched, an omitted stamp overwrites as before, and a vanished record is stale too", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  const created = await s.issues.create(draft());
  const l = layout(shared);
  const file = join(l.issues, "26-0001.json");
  const before = await fsp.readFile(file);

  await expect(s.issues.put({ ...created, summary: "stale" }, "2000-01-01T00:00:00.000Z")).rejects.toThrow("stale");
  expect(await fsp.readFile(file)).toEqual(before);
  await expect(fsp.readdir(join(l.historyIssues, "26-0001"))).rejects.toThrow();

  await s.issues.put({ ...created, summary: "second" }, created.updatedAt);
  expect((await s.issues.get("26-0001"))?.summary).toBe("second");
  expect((await s.issues.history("26-0001")).map((i) => i.summary)).toEqual(["s"]);

  await s.issues.put({ ...created, summary: "third" }); // the 0.2.0 path: no stamp, no guard
  expect((await s.issues.get("26-0001"))?.summary).toBe("third");

  await s.issues.remove("26-0001");
  await expect(s.issues.put({ ...created, summary: "resurrected" }, created.updatedAt)).rejects.toThrow("stale");
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

test("comments.listAll gathers both issues' comments and ignores a stray file and a stray directory under comments/", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  await s.issues.create(draft());
  await s.issues.create(draft());
  const at = (sec: number): string => `2026-09-12T00:00:0${sec}.000Z`;
  await s.comments.add({ id: "", issueKey: "26-0001", author: "alice", body: "first", createdAt: at(1) });
  await s.comments.add({ id: "", issueKey: "26-0002", author: "bob", body: "second", createdAt: at(2) });
  await fsp.writeFile(join(shared, "comments", "stray.json"), "{}", "utf8");
  await fsp.writeFile(join(shared, "comments", "26-0003"), "{}", "utf8"); // a key-shaped file, as a sync client can leave
  await fsp.mkdir(join(shared, "comments", "trash"));
  expect((await s.comments.listAll()).map((c) => `${c.issueKey}:${c.body}`)).toEqual(["26-0001:first", "26-0002:second"]);
});

test("wiki pages get stamp ids, keep history on put, and move to trash on remove", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  const at = "2026-09-12T00:00:00.000Z";
  const page = { id: "", title: "手順", body: "a", parentId: null, note: "", createdAt: at, createdBy: "alice", updatedAt: at, updatedBy: "alice" };
  await Promise.all([s.wiki.create(page), s.wiki.create({ ...page, title: "同時" })]);
  const list = await s.wiki.list();
  expect(list.map((p) => p.id)).toEqual(["20260912T000000000Z", "20260912T000000001Z"]);
  const [first, second] = list; // which title took the first stamp depends on the race
  await s.wiki.put({ ...first, body: "b", updatedAt: "2026-09-12T01:00:00.000Z" });
  await s.wiki.put({ ...first, body: "c", updatedAt: "2026-09-12T02:00:00.000Z" });
  expect((await s.wiki.history(first.id)).map((p) => p.body)).toEqual(["a", "b"]);
  expect((await s.wiki.get(first.id))?.body).toBe("c");
  await s.wiki.remove(first.id);
  expect((await s.wiki.list()).map((p) => p.title)).toEqual([second.title]);
  expect(await fsp.readdir(join(shared, "trash", "wiki"))).toEqual(["20260912T000000000Z.json"]);
});

test("wiki.put guards a stale write the same way, after the cycle check", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  const at = "2026-09-12T00:00:00.000Z";
  const page = await s.wiki.create({ id: "", title: "手順", body: "a", parentId: null, note: "", createdAt: at, createdBy: "alice", updatedAt: at, updatedBy: "alice" });
  const l = layout(shared);
  const file = join(l.wiki, `${page.id}.json`);
  const before = await fsp.readFile(file);

  await expect(s.wiki.put({ ...page, body: "stale" }, "2000-01-01T00:00:00.000Z")).rejects.toThrow("stale");
  expect(await fsp.readFile(file)).toEqual(before);
  await expect(fsp.readdir(join(l.historyWiki, page.id))).rejects.toThrow();

  await s.wiki.put({ ...page, body: "b", updatedAt: "2026-09-12T01:00:00.000Z" }, page.updatedAt);
  expect((await s.wiki.get(page.id))?.body).toBe("b");
  expect((await s.wiki.history(page.id)).map((p) => p.body)).toEqual(["a"]);

  await s.wiki.remove(page.id);
  await expect(s.wiki.put({ ...page, body: "resurrected" }, page.updatedAt)).rejects.toThrow("stale");
});

test("ids and keys from other people's files never reach a path join", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  const planted = { ...draft(), key: "../../escape" };
  await fsp.writeFile(join(shared, "issues", "planted.json"), JSON.stringify(planted), "utf8");
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await s.issues.list()).toEqual([]); // guard rejects the key shape
  expect(err).toHaveBeenCalled();
  await expect(s.issues.put({ ...planted, key: "../../escape" })).rejects.toThrow("invalid");
  await expect(s.attachments.list({ kind: "issue", id: "../../escape" })).rejects.toThrow("invalid issue key");
  await expect(s.attachments.list({ kind: "wiki", id: "../../escape" })).rejects.toThrow("invalid wiki page id");
  await expect(s.attachments.open({ kind: "issue", id: "26-0001" }, "..\\..\\x")).rejects.toThrow("invalid attachment name");
  await expect(s.attachments.remove({ kind: "issue", id: "26-0001" }, "../x")).rejects.toThrow("invalid attachment name");
  await expect(s.comments.list("26-0001/../x")).rejects.toThrow("invalid issue key");
});

test("opening a refused extension placed in the folder by hand is refused", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  await s.issues.create(draft());
  await fsp.writeFile(join(shared, "attachments", "26-0001", "run.bat"), "echo", "utf8");
  await expect(s.attachments.open({ kind: "issue", id: "26-0001" }, "run.bat")).rejects.toThrow("refused-extension");
});

test("summary.exportCsv writes UTF-8 with BOM to the chosen path", async () => {
  const s = store(shared);
  expect(await s.summary.exportCsv("a,b", "summary.csv")).toBe(true);
  const bytes = await fsp.readFile(join(userData, "out.csv"));
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(bytes.subarray(3).toString("utf8")).toBe("a,b");
});

test("methods needing the shared folder reject before it is configured", async () => {
  await expect(store(null).users.me()).rejects.toThrow("not configured");
});

test("records and project.json written before category existed load with defaults; project.put replaces categories only", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  const l = layout(shared);
  await fsp.writeFile(l.projectFile, JSON.stringify({ fiscalYearStartMonth: 4, createdAt: "2026-04-01T00:00:00.000Z" }), "utf8");
  expect((await s.project.get())?.categories).toEqual(["問い合わせ", "不具合", "依頼", "その他"]);
  expect((await s.project.get())?.fields).toEqual([]);
  expect((await s.project.get())?.labels).toEqual([]);
  const { category: _dropped, fields: _dropped2, labels: _dropped3, ...old } = { ...draft(), key: "26-0001" };
  await fsp.writeFile(join(l.issues, "26-0001.json"), JSON.stringify(old), "utf8");
  expect(await s.issues.get("26-0001")).toMatchObject({ category: "", fields: {}, labels: [] });
  expect((await s.issues.list())[0]).toMatchObject({ category: "", fields: {}, labels: [] });
  await s.issues.put({ ...old, category: "依頼", fields: {}, labels: [] });
  expect((await s.issues.history("26-0001"))[0].category).toBe("");
  const p = await s.project.put([" 相談 ", "", "不具合", "相談"], {}, {});
  expect(p).toMatchObject({ fiscalYearStartMonth: 4, createdAt: "2026-04-01T00:00:00.000Z", categories: ["相談", "不具合"] });
  expect(await fsp.readdir(l.historyProject)).toHaveLength(1);
  await expect(s.project.put(["", " "], {}, {})).rejects.toThrow();
});

test("a record written before relations existed loads with []; a record whose relations holds a malformed type is skipped like any other invalid record", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  const l = layout(shared);
  const { relations: _dropped, ...old } = { ...draft(), key: "26-0001" };
  await fsp.writeFile(join(l.issues, "26-0001.json"), JSON.stringify(old), "utf8");
  expect(await s.issues.get("26-0001")).toMatchObject({ relations: [] });
  expect((await s.issues.list())[0]).toMatchObject({ relations: [] });

  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  await fsp.writeFile(join(l.issues, "26-0002.json"), JSON.stringify({ ...draft(), key: "26-0002", relations: [{ type: "wrong", key: "26-0001" }] }), "utf8");
  expect(await s.issues.get("26-0002")).toBeNull();
  expect((await s.issues.list()).map((i) => i.key)).toEqual(["26-0001"]);
  expect(err).toHaveBeenCalled();
  err.mockRestore();
});

test("config.json holding only rootDir loads with default settings; config.put validates and chooseRoot keeps the saved settings", async () => {
  const s = store(shared);
  await fsp.writeFile(join(userData, "config.json"), JSON.stringify({ rootDir: shared, dueSoonDays: 99 }), "utf8");
  expect(await s.config.get()).toEqual({ rootDir: shared, ...DEFAULT_LOCAL_SETTINGS });
  const next = { theme: "dark" as const, accent: "#123abc", dueSoonDays: 7, savedFilters: [] };
  expect(await s.config.put(next)).toEqual({ ...next, rootDir: shared });
  expect(s.settings()).toEqual(next);
  expect(await store(null).config.get()).toEqual({ ...next, rootDir: shared });
  await expect(s.config.put({ ...next, accent: "red" })).rejects.toThrow("accent");
  await expect(s.config.put({ ...next, dueSoonDays: 31 })).rejects.toThrow("dueSoonDays");
  await expect(s.config.put({ ...next, dueSoonDays: 31 })).rejects.toThrow("dueSoonDays");
  const other = await fsp.mkdtemp(join(tmpdir(), "rt-shared2-"));
  try {
    expect(await store(other).config.chooseRoot()).toBe(other);
    expect(await store(null).config.get()).toEqual({ ...next, rootDir: other });
  } finally {
    await fsp.rm(other, { recursive: true, force: true });
  }
});

const issueFilter = (over: Partial<IssueFilter> = {}): IssueFilter => ({
  statuses: ["open"],
  assignee: null,
  reporter: null,
  keyword: "",
  due: "all",
  category: null,
  awaitingConfirmation: false,
  labels: [],
  fields: {},
  ...over,
});

test("config.put round-trips two saved filters through config.get, and a malformed row is dropped on read", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  const savedFilters: SavedFilter[] = [{ name: "a", filter: issueFilter({ keyword: "x" }) }, { name: "b", filter: issueFilter({ due: "overdue" }) }];
  const next = { ...DEFAULT_LOCAL_SETTINGS, savedFilters };
  expect(await s.config.put(next)).toEqual({ ...next, rootDir: shared });
  expect(await store(null).config.get()).toEqual({ ...next, rootDir: shared });

  await fsp.writeFile(join(userData, "config.json"), JSON.stringify({ rootDir: shared, savedFilters: [savedFilters[0], { name: "bad" }] }), "utf8");
  expect((await store(null).config.get())?.savedFilters).toEqual([savedFilters[0]]);

  // A filter saved before `labels` existed keeps its row; the default is applied where the filter is used.
  const { labels: _dropped, ...before } = issueFilter({ keyword: "old" });
  await fsp.writeFile(join(userData, "config.json"), JSON.stringify({ rootDir: shared, savedFilters: [{ name: "old", filter: before }] }), "utf8");
  expect((await store(null).config.get())?.savedFilters).toEqual([{ name: "old", filter: before }]);
});

test("project.put keeps colours of surviving 種別 only and rejects a colour outside #rrggbb", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  const p = await s.project.put(["相談", "不具合"], { 相談: "#FF0000", 依頼: "#00ff00" }, { 相談: { summary: "件名", body: "本文" }, 依頼: { summary: "x", body: "" }, 不具合: { summary: " ", body: "" } });
  expect(p.categoryColors).toEqual({ 相談: "#ff0000" });
  expect((await s.project.get())?.categoryColors).toEqual({ 相談: "#ff0000" });
  expect(p.categoryTemplates).toEqual({ 相談: { summary: "件名", body: "本文" } }); // dropped: a vanished 種別, and a blank template

  await expect(s.project.put(["相談"], { 相談: "red" }, {})).rejects.toThrow("#rrggbb");
});

test("users.register a second time renames and keeps createdAt", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  const first = await s.users.register("Alice");
  const second = await s.users.register("Alice B");
  expect(second).toEqual({ ...first, displayName: "Alice B" });
  expect(await s.users.me()).toEqual(second);
});

test("a member added by name is claimed by the OS login on first launch, keeps the login through a rename, and is trashed only while unassigned", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  await s.users.register("Alice");
  const member = await s.users.add(" 田中 ");
  expect(member.username).toMatch(/^\d{8}T\d{9}Z$/);
  expect(member.displayName).toBe("田中");
  expect("login" in member).toBe(false);
  const bob = store(null, "bob");
  await bob.config.get();
  expect(await bob.users.me()).toBeNull();
  const claimed = await bob.users.claim(member.username);
  expect(claimed).toEqual({ ...member, login: "bob" });
  expect(await bob.users.me()).toEqual(claimed);
  await expect(s.users.claim(member.username)).rejects.toThrow("already-claimed");
  const renamed = await bob.users.rename(member.username, "田中 太郎");
  expect(renamed).toEqual({ ...claimed, displayName: "田中 太郎" });
  expect(await bob.users.me()).toEqual(renamed);
  await expect(s.users.rename(member.username, " ")).rejects.toThrow("empty");
  await s.issues.create(draft({ assignee: member.username }));
  await expect(s.users.remove(member.username)).rejects.toThrow("in-use");
  await s.issues.put({ ...(await s.issues.get("26-0001"))!, assignee: null });
  await s.users.remove(member.username);
  expect((await s.users.list()).map((u) => u.username)).toEqual(["alice"]);
  expect(await fsp.readdir(join(shared, "trash", "users"))).toEqual([`${member.username}.json`]);
  expect(await bob.users.me()).toBeNull();
});

test("wiki: old records load with parentId null and note empty; put refuses a cycle; remove refuses a parent with children; page attachments live under wiki-attachments/", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  const l = layout(shared);
  const at = "2026-09-12T00:00:00.000Z";
  const old = { id: "20260912T000000000Z", title: "旧", body: "", createdAt: at, createdBy: "alice", updatedAt: at, updatedBy: "alice" };
  await fsp.writeFile(join(l.wiki, `${old.id}.json`), JSON.stringify(old), "utf8");
  const root = await s.wiki.get(old.id);
  expect(root).toMatchObject({ parentId: null, note: "" });
  const child = await s.wiki.create({ ...old, id: "", title: "子", parentId: old.id, note: "作成", createdAt: "2026-09-12T00:00:01.000Z" });
  expect(child.id).toBe("20260912T000001000Z");
  await expect(s.wiki.put({ ...root!, parentId: child.id, note: "" })).rejects.toThrow("cycle");
  await expect(s.wiki.put({ ...root!, parentId: root!.id, note: "" })).rejects.toThrow("cycle");
  await expect(s.wiki.remove(old.id)).rejects.toThrow("has-children");
  const file = join(userData, "memo.txt");
  await fsp.writeFile(file, "x", "utf8");
  expect((await s.attachments.add({ kind: "wiki", id: child.id }, [file])).added).toEqual(["memo.txt"]);
  expect(await fsp.readdir(join(shared, "wiki-attachments", child.id))).toEqual(["memo.txt"]);
  await s.attachments.remove({ kind: "wiki", id: child.id }, "memo.txt");
  expect(await fsp.readdir(join(shared, "trash", "wiki-attachments", child.id))).toEqual(["memo.txt"]);
  await s.wiki.remove(child.id);
  await s.wiki.remove(old.id);
  expect(await s.wiki.list()).toEqual([]);
});

test("project.putFields drops unnamed rows and repeated ids, cleans the options, and keeps the other fields", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  const p = await s.project.putFields([
    { id: "a", name: " 環境 ", options: [" 本番", "検証", "", "本番"] },
    { id: "b", name: " ", options: [] },
    { id: "a", name: "重複", options: [] },
    { id: "", name: "無id", options: [] },
    { id: "c", name: "チケット番号", options: [] },
  ]);
  expect(p.fields).toEqual([{ id: "a", name: "環境", options: ["本番", "検証"] }, { id: "c", name: "チケット番号", options: [] }]);
  expect(await s.project.get()).toEqual(p);
  expect(p.categories).toEqual(["問い合わせ", "不具合", "依頼", "その他"]);
  expect(await fsp.readdir(layout(shared).historyProject)).toHaveLength(1);
  await s.issues.create(draft({ fields: { a: "本番" } }));
  expect((await s.issues.get("26-0001"))?.fields).toEqual({ a: "本番" });
});

test("project.putLabels drops a blank name and a repeated name, rejects a bad colour, and leaves categories and fields untouched", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  await s.project.putFields([{ id: "a", name: "環境", options: [] }]);
  const before = (await fsp.readdir(layout(shared).historyProject)).length;
  const p = await s.project.putLabels([
    { name: " bug ", color: "#FF0000" },
    { name: "  ", color: "#000000" },
    { name: "bug", color: "#00ff00" },
    { name: "urgent", color: "#123ABC" },
  ]);
  expect(p.labels).toEqual([{ name: "bug", color: "#ff0000" }, { name: "urgent", color: "#123abc" }]);
  expect(await s.project.get()).toEqual(p);
  expect(p.fields).toEqual([{ id: "a", name: "環境", options: [] }]);
  expect(p.categories).toEqual(["問い合わせ", "不具合", "依頼", "その他"]);
  expect((await fsp.readdir(layout(shared).historyProject)).length).toBe(before + 1);
  await expect(s.project.putLabels([{ name: "x", color: "red" }])).rejects.toThrow("#rrggbb");
});

test("project.putStatuses trims and drops blank names and repeated ids, rejects a bad colour, kind or empty list, and removes a stage issues still use", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  await s.issues.create(draft({ status: "resolved" }));
  const p = await s.project.putStatuses([
    { id: "open", name: " 受付 ", color: "#FF0000", kind: "active" },
    { id: "x", name: "  ", color: "#000000", kind: "active" },
    { id: "open", name: "重複", color: "#00ff00", kind: "done" },
    { id: "closed", name: "完了", color: "#123ABC", kind: "done" },
  ]);
  expect(p.statuses).toEqual([
    { id: "open", name: "受付", color: "#ff0000", kind: "active" },
    { id: "closed", name: "完了", color: "#123abc", kind: "done" },
  ]);
  expect(await s.project.get()).toEqual(p);
  expect(p.categories).toEqual(["問い合わせ", "不具合", "依頼", "その他"]);
  expect(await fsp.readdir(layout(shared).historyProject)).toHaveLength(1);
  expect((await s.issues.get("26-0001"))?.status).toBe("resolved"); // the file keeps the old id; the renderer reads it as the first stage
  await expect(s.project.putStatuses([{ id: "a", name: "x", color: "red", kind: "active" }])).rejects.toThrow("#rrggbb");
  await expect(s.project.putStatuses([{ id: "a", name: "x", color: "#000000", kind: "later" as "active" }])).rejects.toThrow("kind");
  await expect(s.project.putStatuses([{ id: "a", name: " ", color: "#000000", kind: "active" }])).rejects.toThrow("empty");
});

test("project.get fills DEFAULT_STATUSES on a project.json without statuses or with an empty list", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  const l = layout(shared);
  await fsp.writeFile(l.projectFile, JSON.stringify({ fiscalYearStartMonth: 4, createdAt: "2026-04-01T00:00:00.000Z" }), "utf8");
  expect((await s.project.get())?.statuses).toEqual(DEFAULT_STATUSES);
  await fsp.writeFile(l.projectFile, JSON.stringify({ fiscalYearStartMonth: 4, createdAt: "2026-04-01T00:00:00.000Z", statuses: [] }), "utf8");
  expect((await s.project.get())?.statuses).toEqual(DEFAULT_STATUSES);
});
