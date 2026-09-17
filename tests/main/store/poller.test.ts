import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { collectionDirs, layout, type Layout } from "../../../src/main/store/paths";
import { diff, FULL_SCAN_EVERY, scan, startPoller, type Poller } from "../../../src/main/store/poller";
import type { ChangeEvent, WatchTarget } from "../../../src/shared/api";

let base: string;
let root: string;
let l: Layout;
let poller: Poller | null = null;
beforeEach(async () => {
  base = await fsp.mkdtemp(join(tmpdir(), "rt-poller-"));
  root = join(base, "share");
  l = layout(root);
  for (const d of collectionDirs(l)) await fsp.mkdir(d, { recursive: true });
});
afterEach(async () => {
  poller?.stop();
  poller = null;
  vi.restoreAllMocks();
  await fsp.rm(base, { recursive: true, force: true });
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const write = (path: string, text: string): Promise<void> => fsp.writeFile(path, text, "utf8");
const watchIssue = (key: string): WatchTarget[] => [{ collection: "issue", id: key }];

test("diff reports added, changed and removed entries once per (collection, id)", async () => {
  await write(join(l.issues, "26-0001.json"), "{}");
  await fsp.mkdir(l.comments("26-0001"));
  await write(join(l.comments("26-0001"), "a.json"), "{}");
  const a = await scan(l, watchIssue("26-0001"));
  await write(join(l.issues, "26-0001.json"), "{ }");
  await write(join(l.issues, "26-0002.json"), "{}");
  await write(join(l.comments("26-0001"), "b.json"), "{}");
  await write(join(l.comments("26-0001"), "c.json"), "{}");
  const b = await scan(l, watchIssue("26-0001"));
  expect(diff(a.snap, b.snap)).toEqual([
    { collection: "issues", id: "26-0001" },
    { collection: "issues", id: "26-0002" },
    { collection: "comments", id: "26-0001" },
  ]);
  await fsp.rename(join(l.issues, "26-0002.json"), join(l.trashIssues, "26-0002.json"));
  expect(diff(b.snap, (await scan(l, watchIssue("26-0001"))).snap)).toEqual([{ collection: "issues", id: "26-0002" }]);
});

test("an unchanged directory is carried over without a readdir; a write inside it moves the mtime and is listed", async () => {
  await write(join(l.issues, "26-0001.json"), "{}");
  await write(join(l.wiki, "20260912T000000000Z.json"), "{}");
  const a = await scan(l);
  const readdir = vi.spyOn(fsp, "readdir");
  const b = await scan(l, [], a);
  expect(readdir).not.toHaveBeenCalled();
  expect(diff(a.snap, b.snap)).toEqual([]);
  await sleep(20); // mtime resolution
  await write(join(l.issues, "26-0002.json"), "{}");
  const c = await scan(l, [], b);
  expect(readdir.mock.calls.map((c) => c[0])).toEqual([l.issues]);
  expect(diff(b.snap, c.snap)).toEqual([{ collection: "issues", id: "26-0002" }]);
});

test("comments and attachments are read for the watched record only", async () => {
  await fsp.mkdir(l.comments("26-0001"));
  await fsp.mkdir(l.comments("26-0002"));
  await write(join(l.comments("26-0001"), "a.json"), "{}");
  const a = await scan(l, watchIssue("26-0001"));
  await write(join(l.comments("26-0002"), "b.json"), "{}");
  expect(diff(a.snap, (await scan(l, watchIssue("26-0001"), a)).snap)).toEqual([]);
  expect(diff(a.snap, (await scan(l, watchIssue("26-0002"), a)).snap)).toEqual([
    { collection: "comments", id: "26-0002" },
    { collection: "comments", id: "26-0001" },
  ]);
});

test("touching a file in issues/ yields one store:changed within one cycle", async () => {
  const batches: ChangeEvent[][] = [];
  poller = startPoller({ getLayout: () => l, intervalMs: () => 50, onChange: (e) => batches.push(e) });
  await sleep(120);
  await write(join(l.issues, "26-0001.json"), "{}");
  await sleep(200);
  expect(batches).toEqual([[{ collection: "issues", id: "26-0001" }]]);
});

test("while inactive nothing is scanned; wake after a pause delivers the changes made meanwhile", async () => {
  let active = true;
  const batches: ChangeEvent[][] = [];
  poller = startPoller({ getLayout: () => l, intervalMs: () => 50, active: () => active, onChange: (e) => batches.push(e) });
  await sleep(120);
  active = false;
  await sleep(100);
  const stat = vi.spyOn(fsp, "stat");
  await write(join(l.issues, "26-0001.json"), "{}");
  await sleep(200);
  expect(stat).not.toHaveBeenCalled();
  expect(batches).toEqual([]);
  active = true;
  poller.wake();
  await sleep(150);
  expect(batches).toEqual([[{ collection: "issues", id: "26-0001" }]]);
});

test("started unattended, the poller takes one baseline scan and then rests until woken", async () => {
  let active = false;
  const batches: ChangeEvent[][] = [];
  const stat = vi.spyOn(fsp, "stat");
  poller = startPoller({ getLayout: () => l, intervalMs: () => 50, active: () => active, onChange: (e) => batches.push(e) });
  await sleep(100);
  const baseline = stat.mock.calls.length;
  expect(baseline).toBeGreaterThan(0);
  await write(join(l.issues, "26-0001.json"), "{}");
  await sleep(150);
  expect(stat.mock.calls.length).toBe(baseline);
  active = true;
  poller.wake();
  await sleep(150);
  expect(batches).toEqual([[{ collection: "issues", id: "26-0001" }]]);
});

test("every FULL_SCAN_EVERY cycles the directories are listed regardless of their mtimes", async () => {
  await write(join(l.issues, "26-0001.json"), "{}");
  poller = startPoller({ getLayout: () => l, intervalMs: () => 20, onChange: () => {} });
  await sleep(60);
  const readdir = vi.spyOn(fsp, "readdir");
  await sleep(20 * FULL_SCAN_EVERY * 2);
  const listed = readdir.mock.calls.map((c) => c[0]).filter((d) => d === l.issues);
  expect(listed.length).toBeGreaterThanOrEqual(1);
  expect(listed.length).toBeLessThanOrEqual(3);
});

test("an unreachable root logs once per cycle, and changes made meanwhile arrive when it is back", async () => {
  const logs: string[] = [];
  const batches: ChangeEvent[][] = [];
  poller = startPoller({ getLayout: () => l, intervalMs: () => 50, onChange: (e) => batches.push(e), log: (m) => logs.push(m) });
  await sleep(120);
  const away = join(base, "away");
  await fsp.rename(root, away);
  await write(join(away, "issues", "26-0001.json"), "{}");
  await sleep(160);
  expect(logs.length).toBeGreaterThanOrEqual(2);
  expect(batches).toEqual([]);
  await fsp.rename(away, root);
  await sleep(150);
  expect(batches).toEqual([[{ collection: "issues", id: "26-0001" }]]);
});

test("a rewritten project.json yields one store:changed for the project", async () => {
  await write(l.projectFile, "{}");
  const a = await scan(l);
  await write(l.projectFile, "{ }");
  expect(diff(a.snap, (await scan(l, [], a)).snap)).toEqual([{ collection: "project", id: "project" }]);
});

test("a share made before wiki-attachments/ existed still scans; files under a watched page are reported once it appears", async () => {
  await fsp.rm(l.wikiAttachmentsRoot, { recursive: true, force: true });
  const page: WatchTarget[] = [{ collection: "wiki", id: "20260912T000000000Z" }];
  const a = await scan(l, page);
  await fsp.mkdir(join(l.wikiAttachmentsRoot, "20260912T000000000Z"), { recursive: true });
  await write(join(l.wikiAttachmentsRoot, "20260912T000000000Z", "memo.txt"), "x");
  expect(diff(a.snap, (await scan(l, page, a)).snap)).toEqual([{ collection: "wiki-attachments", id: "20260912T000000000Z" }]);
});
