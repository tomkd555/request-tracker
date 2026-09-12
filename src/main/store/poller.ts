import { promises as fsp } from "node:fs";
import { join } from "node:path";
import type { ChangeEvent } from "../../shared/api";
import type { Layout } from "./paths";

type Entry = { collection: string; id: string; sig: string };
export type Snapshot = Map<string, Entry>; // absolute path -> entry

/** A collection directory a share made by an older build lacks (wiki-attachments/ before it existed) counts as empty. */
async function readdirOrEmpty(dir: string): Promise<string[]> {
  try {
    return await fsp.readdir(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

async function statDir(dir: string): Promise<{ name: string; sig: string; isDir: boolean }[]> {
  const out: { name: string; sig: string; isDir: boolean }[] = [];
  for (const name of await readdirOrEmpty(dir)) {
    if (name.startsWith(".")) continue;
    try {
      const s = await fsp.stat(join(dir, name));
      out.push({ name, sig: `${s.mtimeMs}:${s.size}`, isDir: s.isDirectory() });
    } catch {
      // vanished between readdir and stat; the next cycle sees the final state
    }
  }
  return out;
}

const idOf = (name: string): string => name.replace(/\.json$/, "");

/** One full scan: project.json, issues/, wiki/, users/ by record; comments/<KEY>/, attachments/<KEY>/ and wiki-attachments/<id>/ by owner. */
export async function scan(l: Layout): Promise<Snapshot> {
  await fsp.stat(l.root); // an unreachable share (drive offline) throws here and is logged; a missing subdirectory below is empty
  const snap: Snapshot = new Map();
  try {
    const s = await fsp.stat(l.projectFile);
    snap.set(l.projectFile, { collection: "project", id: "project", sig: `${s.mtimeMs}:${s.size}` });
  } catch {
    // absent until first launch finishes
  }
  for (const [collection, dir] of [
    ["issues", l.issues],
    ["wiki", l.wiki],
    ["users", l.users],
  ] as const) {
    for (const e of await statDir(dir)) snap.set(join(dir, e.name), { collection, id: idOf(e.name), sig: e.sig });
  }
  for (const [collection, root] of [
    ["comments", l.commentsRoot],
    ["attachments", l.attachmentsRoot],
    ["wiki-attachments", l.wikiAttachmentsRoot],
  ] as const) {
    for (const key of await statDir(root)) {
      if (!key.isDir) continue;
      const dir = join(root, key.name);
      for (const e of await statDir(dir)) snap.set(join(dir, e.name), { collection, id: key.name, sig: e.sig });
    }
  }
  return snap;
}

/** Entries added, removed or changed between two snapshots, one event per (collection, id). */
export function diff(before: Snapshot, after: Snapshot): ChangeEvent[] {
  const seen = new Set<string>();
  const events: ChangeEvent[] = [];
  const note = (e: Entry): void => {
    const k = `${e.collection}:${e.id}`;
    if (seen.has(k)) return;
    seen.add(k);
    events.push({ collection: e.collection, id: e.id });
  };
  for (const [path, e] of after) if (before.get(path)?.sig !== e.sig) note(e);
  for (const [path, e] of before) if (!after.has(path)) note(e);
  return events;
}

export interface PollerOptions {
  getLayout(): Layout | null;
  /** Read before each cycle, so a saved interval applies from the next one. */
  intervalMs(): number;
  onChange(events: ChangeEvent[]): void;
  log?: (message: string, error: unknown) => void;
}

// ponytail: full rescan every cycle; switch to per-directory mtimes if the folder grows past a few thousand files
export function startPoller(opts: PollerOptions): () => void {
  const log = opts.log ?? ((m, e) => console.error(m, e));
  let last: Snapshot | null = null;
  let lastRoot: string | null = null;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async (): Promise<void> => {
    try {
      const l = opts.getLayout();
      if (l === null) return;
      if (l.root !== lastRoot) {
        lastRoot = l.root;
        last = null;
      }
      const next = await scan(l);
      if (last !== null) {
        const events = diff(last, next);
        if (events.length > 0) opts.onChange(events);
      }
      last = next;
    } catch (e) {
      log("poller: scan failed, will retry", e);
    }
  };

  // One cycle at a time: the next timer is set only after the scan has finished.
  const cycle = async (): Promise<void> => {
    await tick();
    if (!stopped) timer = setTimeout(() => void cycle(), opts.intervalMs());
  };
  void cycle();
  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
  };
}
