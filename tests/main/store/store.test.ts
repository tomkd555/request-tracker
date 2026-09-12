import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createStore } from "../../../src/main/store";
import { collectionDirs, layout } from "../../../src/main/store/paths";

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
  createStore({ userDataDir: userData, username: "alice", chooseDirectory: async () => chosen });

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

test("methods needing the shared folder reject before it is configured", async () => {
  await expect(store(null).users.me()).rejects.toThrow("not configured");
});
