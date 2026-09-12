import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { addAttachments, listAttachments, removeAttachment, suffixed } from "../../../src/main/store/attachments";

const ISSUE = { kind: "issue", id: "26-0001" } as const;
import { collectionDirs, layout, type Layout } from "../../../src/main/store/paths";

let base: string;
let src: string;
let l: Layout;
beforeEach(async () => {
  base = await fsp.mkdtemp(join(tmpdir(), "rt-att-"));
  src = join(base, "src");
  await fsp.mkdir(src);
  l = layout(join(base, "share"));
  for (const d of collectionDirs(l)) await fsp.mkdir(d, { recursive: true });
  await fsp.mkdir(l.attachments("26-0001"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fsp.rm(base, { recursive: true, force: true });
});

const file = async (name: string, content = "x"): Promise<string> => {
  const p = join(src, name);
  await fsp.writeFile(p, content);
  return p;
};

test("suffix goes before the extension for files and after the name for folders", () => {
  expect(suffixed("report.xlsx", 1, false)).toBe("report.xlsx");
  expect(suffixed("report.xlsx", 2, false)).toBe("report (2).xlsx");
  expect(suffixed("photos", 3, true)).toBe("photos (3)");
});

test("same name twice yields (2); an oversized file is refused while the others are copied", async () => {
  const report = await file("report.xlsx", "data");
  const big = await file("big.bin");
  await fsp.truncate(big, 60 * 1024 * 1024);
  const r1 = await addAttachments(l, ISSUE, [report, big]);
  expect(r1.added).toEqual(["report.xlsx"]);
  expect(r1.refused).toEqual([{ path: big, reason: "size" }]);
  const r2 = await addAttachments(l, ISSUE, [report]);
  expect(r2.added).toEqual(["report (2).xlsx"]);
  expect((await listAttachments(l, ISSUE)).map((a) => `${a.kind}:${a.name}:${a.size}`)).toEqual([
    "file:report (2).xlsx:4",
    "file:report.xlsx:4",
  ]);
});

test("executables are refused by extension", async () => {
  const exe = await file("setup.EXE");
  const r = await addAttachments(l, ISSUE, [exe]);
  expect(r).toEqual({ added: [], refused: [{ path: exe, reason: "extension" }] });
});

test("a copy interrupted before the rename leaves only the temp file", async () => {
  const p = await file("a.txt");
  vi.spyOn(fsp, "rename").mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "EIO" }));
  await expect(addAttachments(l, ISSUE, [p])).rejects.toThrow("boom");
  const names = await fsp.readdir(l.attachments("26-0001"));
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(new RegExp(`^\\.a\\.txt\\.tmp-${process.pid}-\\d+$`));
  expect(await listAttachments(l, ISSUE)).toEqual([]);
});

test("two concurrent adds of the same name yield name and name (2)", async () => {
  const p = await file("same.txt");
  const [a, b] = await Promise.all([addAttachments(l, ISSUE, [p]), addAttachments(l, ISSUE, [p])]);
  expect([...a.added, ...b.added].sort()).toEqual(["same (2).txt", "same.txt"]);
});

test("remove moves the entry to trash/attachments/<KEY>/", async () => {
  await addAttachments(l, ISSUE, [await file("gone.txt")]);
  await removeAttachment(l, ISSUE, "gone.txt");
  expect(await listAttachments(l, ISSUE)).toEqual([]);
  expect(await fsp.readdir(l.trashAttachments("26-0001"))).toEqual(["gone.txt"]);
});

test("a dropped folder is copied whole without its refused files, which are reported", async () => {
  const folder = join(src, "docs");
  await fsp.mkdir(join(folder, "sub"), { recursive: true });
  await fsp.writeFile(join(folder, "readme.md"), "hi");
  await fsp.writeFile(join(folder, "sub", "run.bat"), "echo");
  await fsp.writeFile(join(folder, "sub", "data.csv"), "1,2");
  const r = await addAttachments(l, ISSUE, [folder]);
  expect(r.added).toEqual(["docs"]);
  expect(r.refused).toEqual([{ path: join(folder, "sub", "run.bat"), reason: "extension" }]);
  expect((await fsp.readdir(join(l.attachments("26-0001"), "docs", "sub"))).sort()).toEqual(["data.csv"]);
  expect((await listAttachments(l, ISSUE))[0]).toMatchObject({ name: "docs", kind: "folder", size: null });
  expect((await addAttachments(l, ISSUE, [folder])).added).toEqual(["docs (2)"]);
});

test("an unreachable share fails before anything is written", async () => {
  const p = await file("a.txt");
  const dead = layout(join(base, "missing"));
  await expect(addAttachments(dead, ISSUE, [p])).rejects.toThrow("share-unreachable");
});
