import { promises as fsp } from "node:fs";
import { ISSUE_KEY } from "../../shared/types";
import { writeAtomic } from "./collection";
import { assertKey, type Layout } from "./paths";

/** The keys in the text of a watch file; text that is not the expected JSON reads as no keys, and an entry that is no issue key is dropped. */
function keysOf(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const keys = (parsed as { keys?: unknown } | null)?.keys;
  return Array.isArray(keys) ? keys.filter((k): k is string => typeof k === "string" && ISSUE_KEY.test(k)) : [];
}

/** The keys of `watch/<username>.json`; a missing, unreadable or malformed file reads as no keys. */
export async function readWatch(l: Layout, username: string): Promise<string[]> {
  try {
    return keysOf(await fsp.readFile(l.watch(username), "utf8"));
  } catch {
    return [];
  }
}

/** Adds or removes `key` in the member's file and returns the keys now stored. */
export async function setWatch(l: Layout, username: string, key: string, on: boolean): Promise<string[]> {
  assertKey(key);
  // A read that fails for any reason other than a missing file rejects: writing over a list this call could not read would drop its other keys.
  const current = await fsp.readFile(l.watch(username), "utf8").then(keysOf, (e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return [] as string[];
    throw e;
  });
  const keys = on ? (current.includes(key) ? current : [...current, key]) : current.filter((k) => k !== key);
  await writeAtomic(l.watch(username), JSON.stringify({ keys }, null, 2));
  return keys;
}
