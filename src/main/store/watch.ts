import { promises as fsp } from "node:fs";
import { ISSUE_KEY } from "../../shared/types";
import { errorCode, writeAtomic } from "./collection";
import { assertIssueKey, type Layout } from "./paths";

/** The keys in the text of a watch file; text that is not the expected JSON reads as no keys, and an entry that is no issue key is dropped. */
function parseWatchedKeys(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const keys = (parsed as { keys?: unknown } | null)?.keys;
  return Array.isArray(keys) ? keys.filter((key): key is string => typeof key === "string" && ISSUE_KEY.test(key)) : [];
}

/** The keys of `watch/<username>.json`; a missing, unreadable or malformed file reads as no keys. */
export async function readWatch(layout: Layout, username: string): Promise<string[]> {
  try {
    return parseWatchedKeys(await fsp.readFile(layout.watch(username), "utf8"));
  } catch {
    return [];
  }
}

/** Adds (`shouldWatch`) or removes `key` in the member's file and returns the keys now stored. */
export async function setWatch(layout: Layout, username: string, key: string, shouldWatch: boolean): Promise<string[]> {
  assertIssueKey(key);
  // A read that fails for any reason other than a missing file rejects: writing over a list this call could not read would drop its other keys.
  const watchedKeys = await fsp.readFile(layout.watch(username), "utf8").then(parseWatchedKeys, (e: unknown) => {
    if (errorCode(e) === "ENOENT") return [] as string[];
    throw e;
  });
  const withKey = watchedKeys.includes(key) ? watchedKeys : [...watchedKeys, key];
  const keys = shouldWatch ? withKey : watchedKeys.filter((watchedKey) => watchedKey !== key);
  await writeAtomic(layout.watch(username), JSON.stringify({ keys }, null, 2));
  return keys;
}
