import { promises as fsp } from "node:fs";
import { dirname, join } from "node:path";
import { fileStamp } from "./fileStamp";

export type Collection<T> = {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  /** Exclusive create: rejects with code EEXIST when the id is taken. */
  create(id: string, record: T): Promise<void>;
  /**
   * Atomic overwrite; copies the previous version to history first.
   * When `expectedUpdatedAt` is given, rejects with `Error("stale")` and writes nothing (no history entry either)
   * if the record on disk has moved on since, or vanished, since that read.
   */
  put(id: string, record: T, expectedUpdatedAt?: string): Promise<void>;
  /** Moves the file to trash. Nothing is unlinked. */
  remove(id: string): Promise<void>;
  history(id: string): Promise<T[]>;
};

export type CollectionOptions<T> = {
  dir: string;
  guard: (v: unknown) => v is T;
  /** Directory receiving `<id>/<stamp>.json` copies before each overwrite. */
  historyDir?: string;
  /** Directory receiving removed files. */
  trashDir?: string;
  /** ISO timestamp that names the history copy of a record; default: updatedAt, then createdAt. */
  stampOf?: (record: T) => string;
};

/** fs.mkdir with recursive: true never returns when a folder refuses new entries with ENOENT (seen on a cloud-synced folder), so parents are created one level at a time and the refusal surfaces as an error. */
export async function mkdirp(dir: string): Promise<void> {
  try {
    await fsp.mkdir(dir);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return;
    const parent = dirname(dir);
    if (code !== "ENOENT" || parent === dir) throw e;
    await mkdirp(parent);
    await fsp.mkdir(dir).catch((e2: NodeJS.ErrnoException) => {
      if (e2.code !== "EEXIST") throw e2;
    });
  }
}

// Any name Windows accepts: no path separators, no drive or wildcard characters, no control characters. A login with a space or Japanese is a user id.
const ID = /^[^\\/:*?"<>|\x00-\x1f]{1,64}$/;

/** Record ids and attachment names come from files other people wrote; they never carry path separators. */
export function assertId(id: string): string {
  if (!ID.test(id) || id === "." || id === "..") throw new Error(`invalid id: ${id}`);
  return id;
}

const file = (dir: string, id: string): string => join(dir, `${assertId(id)}.json`);
const serialize = (record: unknown): string => JSON.stringify(record, null, 2) + "\n";

export async function readRecord<T>(path: string, guard: (v: unknown) => v is T): Promise<T | null> {
  let text: string;
  try {
    text = await fsp.readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  try {
    const value: unknown = JSON.parse(text);
    if (guard(value)) return value;
    console.error(`store: record failed validation, skipped: ${path}`);
  } catch {
    console.error(`store: record is not JSON, skipped: ${path}`);
  }
  return null;
}

export async function readDir<T>(dir: string, guard: (v: unknown) => v is T): Promise<T[]> {
  let names: string[];
  try {
    names = await fsp.readdir(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const files = names.filter((n) => n.endsWith(".json") && !n.startsWith(".")).sort();
  const records = await mapLimit(files, (name) => readRecord(join(dir, name), guard));
  return records.filter((r): r is T => r !== null);
}

export const READ_CONCURRENCY = 16;

/** `fn` over `items` in order, at most `limit` in flight: readFile opens and reads as separate pool jobs, so an unbounded fan-out holds every descriptor open at once. */
export async function mapLimit<A, B>(items: A[], fn: (item: A) => Promise<B>, limit = READ_CONCURRENCY): Promise<B[]> {
  const out: B[] = new Array<B>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Write to a temp file in the same directory, then rename over the target. */
let tmpSeq = 0; // two overlapping saves of the same record in one process get distinct temp names

export async function writeAtomic(target: string, text: string): Promise<void> {
  const dir = join(target, "..");
  const tmp = join(dir, `.${target.slice(dir.length + 1)}.tmp-${process.pid}-${tmpSeq++}`);
  await mkdirp(dir);
  await fsp.writeFile(tmp, text, "utf8");
  try {
    await fsp.rename(tmp, target);
  } catch (e) {
    await fsp.unlink(tmp).catch(() => undefined); // a share that dropped between the two calls leaves no temp file behind
    throw e;
  }
}

const defaultStamp = (r: unknown): string => {
  const rec = r as { updatedAt?: unknown; createdAt?: unknown };
  const iso = typeof rec.updatedAt === "string" ? rec.updatedAt : rec.createdAt;
  return typeof iso === "string" ? iso : new Date().toISOString();
};

/** A listing is served from memory while the directory's mtime is unchanged and the listing is younger than this. */
export const LIST_TTL_MS = 60_000;
const listings = new Map<string, { sig: string | null; at: number; records: unknown[] }>();

/** mtime and size of the directory; null when it does not exist yet. Every write here is a temp file plus a rename inside the directory, so the mtime moves. */
async function dirSig(dir: string): Promise<string | null> {
  try {
    const s = await fsp.stat(dir);
    return `${s.mtimeMs}:${s.size}`;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** Reads under way, so the launch warm-up and the renderer's first list share one pass over the directory. */
const pending = new Map<string, Promise<unknown[]>>();

/** Forgets the listing of `dir`; called after every write of this process, so its own change is visible at once. A read in flight still resolves for its callers, but its result is never cached. */
export const forgetListing = (dir: string): void => {
  listings.delete(dir);
  pending.delete(dir);
};

/** One stat per call while nothing changed; a full read otherwise. The age bound covers a share that reports directory mtimes late. */
// ponytail: a file system with coarse mtimes (2 s on exFAT) can hide another client's write for that long; lower LIST_TTL_MS if it bites
export async function readDirCached<T>(dir: string, guard: (v: unknown) => v is T): Promise<T[]> {
  const sig = await dirSig(dir);
  const now = Date.now();
  const hit = listings.get(dir);
  if (hit !== undefined && hit.sig === sig && now - hit.at < LIST_TTL_MS) return hit.records.slice() as T[]; // a copy, so a caller's sort never reaches the cache
  for (const [d, v] of listings) if (now - v.at >= LIST_TTL_MS) listings.delete(d); // expired listings go, so the map holds the directories in use alone
  let p = pending.get(dir);
  if (p === undefined) {
    const read: Promise<unknown[]> = readDir(dir, guard).then(
      (records) => {
        if (pending.get(dir) === read) {
          listings.set(dir, { sig, at: now, records });
          pending.delete(dir);
        }
        return records;
      },
      (e: unknown) => {
        if (pending.get(dir) === read) pending.delete(dir); // the next call reads again
        throw e;
      },
    );
    pending.set(dir, read);
    p = read;
  }
  return (await p).slice() as T[];
}

export function collection<T>(opts: CollectionOptions<T>): Collection<T> {
  const { dir, guard, historyDir, trashDir } = opts;
  const stampOf = opts.stampOf ?? defaultStamp;

  async function archive(id: string): Promise<void> {
    if (!historyDir) return;
    const current = await readRecord(file(dir, id), guard);
    if (current === null) return;
    const dest = join(historyDir, id);
    await mkdirp(dest);
    await fsp.copyFile(file(dir, id), join(dest, `${fileStamp(stampOf(current))}.json`));
  }

  return {
    list: () => readDirCached(dir, guard),
    get: (id) => readRecord(file(dir, id), guard),
    async create(id, record) {
      await mkdirp(dir);
      await fsp.writeFile(file(dir, id), serialize(record), { encoding: "utf8", flag: "wx" });
      forgetListing(dir);
    },
    async put(id, record, expectedUpdatedAt) {
      // ponytail: check-then-write leaves a window between this read and the rename; a lock file per record if two clients start colliding in practice
      if (expectedUpdatedAt !== undefined) {
        const current = await readRecord(file(dir, id), guard);
        if (current === null || stampOf(current) !== expectedUpdatedAt) throw new Error("stale");
      }
      await archive(id);
      await writeAtomic(file(dir, id), serialize(record));
      forgetListing(dir);
    },
    async remove(id) {
      if (!trashDir) throw new Error(`collection ${dir} keeps no trash`);
      await mkdirp(trashDir);
      let dest = file(trashDir, id);
      try {
        await fsp.access(dest);
        dest = join(trashDir, `${id}.${fileStamp(new Date().toISOString())}.json`);
      } catch {
        // free name
      }
      await fsp.rename(file(dir, id), dest);
      forgetListing(dir);
    },
    async history(id) {
      if (!historyDir) return [];
      return readDir(join(historyDir, id), guard);
    },
  };
}
