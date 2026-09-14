import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { collectionDirs, layout, type Layout } from "../../../src/main/store/paths";
import { diff, scan, startPoller } from "../../../src/main/store/poller";
import type { ChangeEvent } from "../../../src/shared/api";

let base: string;
let root: string;
let l: Layout;
let stop: (() => void) | null = null;
beforeEach(async () => {
  base = await fsp.mkdtemp(join(tmpdir(), "rt-poller-"));
  root = join(base, "share");
  l = layout(root);
  for (const d of collectionDirs(l)) await fsp.mkdir(d, { recursive: true });
});
afterEach(async () => {
  stop?.();
  stop = null;
  await fsp.rm(base, { recursive: true, force: true });
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const write = (path: string, text: string): Promise<void> => fsp.writeFile(path, text, "utf8");

test("diff reports added, changed and removed entries once per (collection, id)", async () => {
  await write(join(l.issues, "26-0001.json"), "{}");
  await fsp.mkdir(l.comments("26-0001"));
  await write(join(l.comments("26-0001"), "a.json"), "{}");
  const a = await scan(l);
  await write(join(l.issues, "26-0001.json"), "{ }");
  await write(join(l.issues, "26-0002.json"), "{}");
  await write(join(l.comments("26-0001"), "b.json"), "{}");
  await write(join(l.comments("26-0001"), "c.json"), "{}");
  const b = await scan(l);
  expect(diff(a, b)).toEqual([
    { collection: "issues", id: "26-0001" },
    { collection: "issues", id: "26-0002" },
    { collection: "comments", id: "26-0001" },
  ]);
  await fsp.rename(join(l.issues, "26-0002.json"), join(l.trashIssues, "26-0002.json"));
  expect(diff(b, await scan(l))).toEqual([{ collection: "issues", id: "26-0002" }]);
});

test("touching a file in issues/ yields one store:changed within one cycle", async () => {
  const batches: ChangeEvent[][] = [];
  stop = startPoller({ getLayout: () => l, intervalMs: () => 50, onChange: (e) => batches.push(e) });
  await sleep(120);
  await write(join(l.issues, "26-0001.json"), "{}");
  await sleep(200);
  expect(batches).toEqual([[{ collection: "issues", id: "26-0001" }]]);
});

test("an unreachable root logs once per cycle, and changes made meanwhile arrive when it is back", async () => {
  const logs: string[] = [];
  const batches: ChangeEvent[][] = [];
  stop = startPoller({ getLayout: () => l, intervalMs: () => 50, onChange: (e) => batches.push(e), log: (m) => logs.push(m) });
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
  expect(diff(a, await scan(l))).toEqual([{ collection: "project", id: "project" }]);
});

test("a share made before wiki-attachments/ existed still scans; files under it are reported once it appears", async () => {
  await fsp.rm(l.wikiAttachmentsRoot, { recursive: true, force: true });
  const a = await scan(l);
  await fsp.mkdir(join(l.wikiAttachmentsRoot, "20260912T000000000Z"), { recursive: true });
  await write(join(l.wikiAttachmentsRoot, "20260912T000000000Z", "memo.txt"), "x");
  expect(diff(a, await scan(l))).toEqual([{ collection: "wiki-attachments", id: "20260912T000000000Z" }]);
});
