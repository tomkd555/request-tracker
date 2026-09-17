import { promises as fsp } from "node:fs";
import { join } from "node:path";
import type { ChangeEvent, WatchTarget } from "../../shared/api";
import type { Layout } from "./paths";

type Entry = { collection: string; id: string; sig: string };
export type Snapshot = Map<string, Entry>; // absolute path -> entry
/** A snapshot plus the signature of each flat collection directory, so an unchanged directory is carried over without a readdir. */
export interface Scan { snap: Snapshot; dirs: Map<string, string> }

/** A collection directory a share made by an older build lacks (wiki-attachments/ before it existed) counts as empty. */
async function readdirOrEmpty(dir: string): Promise<string[]> {
  try {
    return await fsp.readdir(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

async function sigOf(path: string): Promise<string | null> {
  try {
    const s = await fsp.stat(path);
    return `${s.mtimeMs}:${s.size}`;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

async function statDir(dir: string): Promise<{ name: string; sig: string }[]> {
  const out: { name: string; sig: string }[] = [];
  for (const name of await readdirOrEmpty(dir)) {
    if (name.startsWith(".")) continue;
    try {
      const s = await fsp.stat(join(dir, name));
      out.push({ name, sig: `${s.mtimeMs}:${s.size}` });
    } catch {
      // vanished between readdir and stat; the next cycle sees the final state
    }
  }
  return out;
}

const idOf = (name: string): string => name.replace(/\.json$/, "");

/**
 * One scan: project.json, then issues/, wiki/ and users/ by record, then the comments/, attachments/ and
 * wiki-attachments/ folders of the watched records only. Every write is a temp file plus a rename inside the
 * record's directory, so a flat directory whose mtime matches `prev` keeps its previous entries unread;
 * `prev` null lists everything.
 */
export async function scan(l: Layout, watched: WatchTarget[] = [], prev: Scan | null = null): Promise<Scan> {
  await fsp.stat(l.root); // an unreachable share (drive offline) throws here and is logged; a missing subdirectory below is empty
  const snap: Snapshot = new Map();
  const dirs = new Map<string, string>();
  const projectSig = await sigOf(l.projectFile);
  if (projectSig !== null) snap.set(l.projectFile, { collection: "project", id: "project", sig: projectSig });
  for (const [collection, dir] of [
    ["issues", l.issues],
    ["wiki", l.wiki],
    ["users", l.users],
  ] as const) {
    const sig = await sigOf(dir);
    if (sig !== null) dirs.set(dir, sig);
    if (prev !== null && sig !== null && prev.dirs.get(dir) === sig) {
      for (const [path, e] of prev.snap) if (e.collection === collection) snap.set(path, e);
      continue;
    }
    // ponytail: a changed directory still stats every file in it; per-file mtimes from readdir would need a native module
    for (const e of await statDir(dir)) snap.set(join(dir, e.name), { collection, id: idOf(e.name), sig: e.sig });
  }
  for (const w of watched) {
    const folders: [string, string][] =
      w.collection === "issue"
        ? [
            ["comments", l.comments(w.id)],
            ["attachments", l.attachments(w.id)],
          ]
        : [["wiki-attachments", l.wikiAttachments(w.id)]];
    for (const [collection, dir] of folders) {
      for (const e of await statDir(dir)) snap.set(join(dir, e.name), { collection, id: w.id, sig: e.sig });
    }
  }
  return { snap, dirs };
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
  /** Whether anyone is working in the app; while false no cycle touches the share. Default: always. */
  active?(): boolean;
  /** The records whose comments and attachments folders are scanned; the open detail screen sets them. Default: none. */
  watched?(): WatchTarget[];
}

export interface Poller {
  stop(): void;
  /** Runs a cycle now: on window focus, on resume from sleep, and when the watched set changes. */
  wake(): void;
}

/** While inactive the poller re-checks `active` this often, with no I/O. */
export const IDLE_RECHECK_MS = 30_000;
/** Every this many cycles the flat directories are listed regardless of their mtimes, for a share that reports them late. */
export const FULL_SCAN_EVERY = 12;

export function startPoller(opts: PollerOptions): Poller {
  const log = opts.log ?? ((m, e) => console.error(m, e));
  const active = opts.active ?? (() => true);
  const watched = opts.watched ?? (() => []);
  let last: Scan | null = null;
  let lastRoot: string | null = null;
  let cycles = 0;
  let stopped = false;
  let running = false;
  let again = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async (): Promise<void> => {
    try {
      const l = opts.getLayout();
      if (l === null) return;
      if (l.root !== lastRoot) {
        lastRoot = l.root;
        last = null;
      }
      cycles += 1;
      const next = await scan(l, watched(), cycles % FULL_SCAN_EVERY === 0 ? null : last);
      if (last !== null) {
        const events = diff(last.snap, next.snap);
        if (events.length > 0) opts.onChange(events);
      }
      last = next;
    } catch (e) {
      log("poller: scan failed, will retry", e);
    }
  };

  // One cycle at a time: the next timer is set only after the scan has finished; a wake during a scan queues one more.
  const cycle = async (): Promise<void> => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    try {
      // The first scan runs even unattended, so the baseline matches what the renderer loaded at start-up.
      if (last === null || active()) await tick();
    } finally {
      running = false;
    }
    if (stopped) return;
    if (again) {
      again = false;
      void cycle();
      return;
    }
    timer = setTimeout(() => void cycle(), active() ? opts.intervalMs() : IDLE_RECHECK_MS);
  };
  void cycle();
  return {
    stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
    },
    wake() {
      if (!stopped) void cycle();
    },
  };
}
