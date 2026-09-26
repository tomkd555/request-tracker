import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createStore, type StoreDeps } from "../../../src/main/store";
import { layout } from "../../../src/main/store/paths";
import type { Report } from "../../../src/shared/types";

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

const store = (chosen: string | null, overrides: Partial<StoreDeps> = {}) =>
  createStore({
    userDataDir: userData,
    username: "alice",
    chooseDirectory: async () => chosen,
    chooseFiles: async () => null,
    openPath: async () => "",
    chooseSavePath: async (_name, filter) => join(userData, `out.${filter.extensions[0]}`),
    writeClipboard: () => undefined,
    ...overrides,
  });

const report = (over: Partial<Report> = {}): Report => ({
  id: "",
  title: "月次報告",
  body: "",
  isTemplate: false,
  terms: {},
  issueNotes: {},
  createdAt: "2026-09-12T00:00:00.000Z",
  createdBy: "alice",
  updatedAt: "2026-09-12T00:00:00.000Z",
  updatedBy: "alice",
  ...over,
});

test("reports.create allocates a stamp id and lists it", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  const created = await s.reports.create(report());
  expect(created.id).toBe("20260912T000000000Z");
  expect((await s.reports.list()).map((r) => r.id)).toEqual([created.id]);
});

test("reports.put guards a stale write and copies the previous version to history; an omitted stamp overwrites as before, and a vanished record is stale too", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  const created = await s.reports.create(report({ body: "a" }));
  const l = layout(shared);
  const file = join(l.reports, `${created.id}.json`);
  const before = await fsp.readFile(file);

  await expect(s.reports.put({ ...created, body: "stale" }, "2000-01-01T00:00:00.000Z")).rejects.toThrow("stale");
  expect(await fsp.readFile(file)).toEqual(before);
  await expect(fsp.readdir(join(l.historyReports, created.id))).rejects.toThrow();

  await s.reports.put({ ...created, body: "b", updatedAt: "2026-09-12T01:00:00.000Z" }, created.updatedAt);
  expect((await s.reports.get(created.id))?.body).toBe("b");
  const historyFiles = await fsp.readdir(join(l.historyReports, created.id));
  expect(historyFiles).toHaveLength(1);
  const historyRecord: Report = JSON.parse(await fsp.readFile(join(l.historyReports, created.id, historyFiles[0]), "utf8"));
  expect(historyRecord.body).toBe("a");

  await s.reports.put({ ...created, body: "c" }); // no stamp, no guard
  expect((await s.reports.get(created.id))?.body).toBe("c");

  await s.reports.remove(created.id);
  await expect(s.reports.put({ ...created, body: "resurrected" }, created.updatedAt)).rejects.toThrow("stale");
});

test("reports.remove moves the file to trash", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  const created = await s.reports.create(report());
  await s.reports.remove(created.id);
  expect(await s.reports.list()).toEqual([]);
  expect(await fsp.readdir(layout(shared).trashReports)).toEqual([`${created.id}.json`]);
});

test("a file failing isReport is skipped by list", async () => {
  const s = store(shared);
  await s.config.chooseRoot();
  await s.project.init(4);
  const l = layout(shared);
  await fsp.mkdir(l.reports, { recursive: true });
  await fsp.writeFile(join(l.reports, "20260912T000000000Z.json"), JSON.stringify({ id: "20260912T000000000Z", title: "x" }), "utf8");
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await s.reports.list()).toEqual([]);
  expect(err).toHaveBeenCalled();
  err.mockRestore();
});

test("reports.save writes the text at the chosen path and returns false when the dialog is cancelled", async () => {
  const s = store(shared);
  expect(await s.reports.save("hello", "report.html", { name: "HTML", extensions: ["html"] })).toBe(true);
  expect(await fsp.readFile(join(userData, "out.html"), "utf8")).toBe("hello");

  const cancelled = store(shared, { chooseSavePath: async () => null });
  expect(await cancelled.reports.save("hello", "report.html", { name: "HTML", extensions: ["html"] })).toBe(false);
});

test("reports.copy hands the html and text straight to writeClipboard", async () => {
  const writeClipboard = vi.fn();
  const s = store(shared, { writeClipboard });
  await s.reports.copy("<p>a</p>", "a");
  expect(writeClipboard).toHaveBeenCalledWith("<p>a</p>", "a");
});
