import { promises as fsp } from "node:fs";
import { basename, dirname, join } from "node:path";
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
  /** The id a record is stored under; `list` skips a file whose name differs, such as a sync conflict copy `26-0005 (1).json`. */
  idOf?: (record: T) => string;
};

/** The `code` of a Node file-system error ("ENOENT", "EEXIST", …); undefined for any other value. */
export const errorCode = (e: unknown): string | undefined => (e as NodeJS.ErrnoException).code;

/** fs.mkdir with recursive: true never returns when a folder refuses new entries with ENOENT (seen on a cloud-synced folder), so parents are created one level at a time and the refusal surfaces as an error. */
export async function mkdirp(dir: string): Promise<void> {
  try {
    await fsp.mkdir(dir);
  } catch (e) {
    const code = errorCode(e);
    if (code === "EEXIST") return;
    const parent = dirname(dir);
    if (code !== "ENOENT" || parent === dir) throw e;
    await mkdirp(parent);
    await fsp.mkdir(dir).catch((retryError: unknown) => {
      if (errorCode(retryError) !== "EEXIST") throw retryError;
    });
  }
}

// Any name Windows accepts: no path separators, no drive or wildcard characters, no control characters. A login with a space or Japanese is a user id.
const WINDOWS_FILE_NAME = /^[^\\/:*?"<>|\x00-\x1f]{1,64}$/;
// Windows opens these names as devices, with or without an extension, and drops a trailing dot or space from a file name.
const DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Record ids and attachment names come from files other people wrote; they never carry path separators. */
export function assertId(id: string): string {
  if (!WINDOWS_FILE_NAME.test(id) || id === "." || id === ".." || DEVICE_NAME.test(id) || /[. ]$/.test(id)) throw new Error(`invalid id: ${id}`);
  return id;
}

const recordPath = (dir: string, id: string): string => join(dir, `${assertId(id)}.json`);

/** The text of a record file: indented JSON with a final newline. */
export const toJsonText = (record: unknown): string => JSON.stringify(record, null, 2) + "\n";

export async function readRecord<T>(path: string, guard: (v: unknown) => v is T): Promise<T | null> {
  let text: string;
  try {
    text = await fsp.readFile(path, "utf8");
  } catch (e) {
    if (errorCode(e) === "ENOENT") return null;
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

/** Every valid record of `dir` in file-name order, read from disk on each call; a directory that does not exist yet holds no records. */
export async function readRecords<T>(dir: string, guard: (v: unknown) => v is T, idOf?: (record: T) => string): Promise<T[]> {
  let names: string[];
  try {
    names = await fsp.readdir(dir);
  } catch (e) {
    if (errorCode(e) === "ENOENT") return [];
    throw e;
  }
  const fileNames = names.filter((name) => name.endsWith(".json") && !name.startsWith(".")).sort();
  const records = await mapLimit(fileNames, async (fileName) => {
    const record = await readRecord(join(dir, fileName), guard);
    if (record === null || idOf === undefined) return record;
    // Compared as Windows compares file names: a login stored in another letter case is the same member, and a conflict copy still differs.
    const idInFileName = fileName.slice(0, -".json".length);
    if (idOf(record).toLowerCase() !== idInFileName.toLowerCase()) {
      console.error(`store: file name differs from the record id, skipped: ${join(dir, fileName)}`);
      return null;
    }
    return record;
  });
  return records.filter((record): record is T => record !== null);
}

const READ_CONCURRENCY = 16;

/** `fn` over `items` in order, at most `limit` in flight: readFile opens and reads as separate pool jobs, so an unbounded fan-out holds every descriptor open at once. */
export async function mapLimit<A, B>(items: A[], fn: (item: A) => Promise<B>, limit = READ_CONCURRENCY): Promise<B[]> {
  const results: B[] = new Array<B>(items.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

let tempFileSeq = 0; // two overlapping saves of the same record in one process get distinct temp names

/** Write to a temp file in the same directory, then rename over the target. */
export async function writeAtomic(target: string, text: string): Promise<void> {
  const dir = dirname(target);
  const tempPath = join(dir, `.${basename(target)}.tmp-${process.pid}-${tempFileSeq++}`);
  await mkdirp(dir);
  await fsp.writeFile(tempPath, text, "utf8");
  try {
    await fsp.rename(tempPath, target);
  } catch (e) {
    await fsp.unlink(tempPath).catch(() => undefined); // a share that dropped between the two calls leaves no temp file behind
    throw e;
  }
}

/** The ISO time of the version a record holds: updatedAt, then createdAt. `put` compares it with `expectedUpdatedAt`, and it names the history copy. */
const versionTimeOf = (record: unknown): string => {
  const { updatedAt, createdAt } = record as { updatedAt?: unknown; createdAt?: unknown };
  const iso = typeof updatedAt === "string" ? updatedAt : createdAt;
  return typeof iso === "string" ? iso : new Date().toISOString();
};

/** A listing is served from memory while the directory's mtime is unchanged and the listing is younger than this. */
export const LIST_TTL_MS = 60_000;
const listings = new Map<string, { signature: string | null; readAtMs: number; records: unknown[] }>();

/** mtime and size of the directory; null when it does not exist yet. Every write here is a temp file plus a rename inside the directory, so the mtime moves. */
async function dirSignature(dir: string): Promise<string | null> {
  try {
    const stats = await fsp.stat(dir);
    return `${stats.mtimeMs}:${stats.size}`;
  } catch (e) {
    if (errorCode(e) === "ENOENT") return null;
    throw e;
  }
}

/** Reads under way, so the launch warm-up and the renderer's first list share one pass over the directory. */
const pendingReads = new Map<string, Promise<unknown[]>>();

/** Forgets the listing of `dir`; called after every write of this process, so its own change is visible at once. A read in flight still resolves for its callers, but its result is never cached. */
const forgetListing = (dir: string): void => {
  listings.delete(dir);
  pendingReads.delete(dir);
};

/** One stat per call while nothing changed; a full read otherwise. The age bound covers a share that reports directory mtimes late. */
// ponytail: a file system with coarse mtimes (2 s on exFAT) can hide another client's write for that long; lower LIST_TTL_MS if it bites
async function readRecordsCached<T>(dir: string, guard: (v: unknown) => v is T, idOf?: (record: T) => string): Promise<T[]> {
  const signature = await dirSignature(dir);
  const nowMs = Date.now();
  const cached = listings.get(dir);
  if (cached !== undefined && cached.signature === signature && nowMs - cached.readAtMs < LIST_TTL_MS) return cached.records.slice() as T[]; // a copy, so a caller's sort never reaches the cache
  for (const [listedDir, listing] of listings) if (nowMs - listing.readAtMs >= LIST_TTL_MS) listings.delete(listedDir); // expired listings go, so the map holds the directories in use alone
  let pendingRead = pendingReads.get(dir);
  if (pendingRead === undefined) {
    const read: Promise<unknown[]> = readRecords(dir, guard, idOf).then(
      (records) => {
        if (pendingReads.get(dir) === read) {
          listings.set(dir, { signature, readAtMs: nowMs, records });
          pendingReads.delete(dir);
        }
        return records;
      },
      (e: unknown) => {
        if (pendingReads.get(dir) === read) pendingReads.delete(dir); // the next call reads again
        throw e;
      },
    );
    pendingReads.set(dir, read);
    pendingRead = read;
  }
  return (await pendingRead).slice() as T[];
}

export function collection<T>({ dir, guard, historyDir, trashDir, idOf }: CollectionOptions<T>): Collection<T> {
  /** A writer never produces a file that every reader rejects. */
  function assertValid(record: T): void {
    if (!guard(record)) throw new Error("invalid record");
  }

  async function archive(id: string): Promise<void> {
    if (!historyDir) return;
    const current = await readRecord(recordPath(dir, id), guard);
    if (current === null) return;
    const versionsDir = join(historyDir, id);
    await mkdirp(versionsDir);
    let stamp: string;
    try {
      stamp = fileStamp(versionTimeOf(current));
    } catch {
      stamp = fileStamp((current as { createdAt: string }).createdAt); // an updatedAt that does not parse must not block the save
    }
    await fsp.copyFile(recordPath(dir, id), join(versionsDir, `${stamp}.json`));
  }

  return {
    list: () => readRecordsCached(dir, guard, idOf),
    get: (id) => readRecord(recordPath(dir, id), guard),
    async create(id, record) {
      assertValid(record);
      await mkdirp(dir);
      await fsp.writeFile(recordPath(dir, id), toJsonText(record), { encoding: "utf8", flag: "wx" });
      forgetListing(dir);
    },
    async put(id, record, expectedUpdatedAt) {
      assertValid(record);
      // ponytail: check-then-write leaves a window between this read and the rename; a lock file per record if two clients start colliding in practice
      if (expectedUpdatedAt !== undefined) {
        const current = await readRecord(recordPath(dir, id), guard);
        if (current === null || versionTimeOf(current) !== expectedUpdatedAt) throw new Error("stale");
      }
      await archive(id);
      await writeAtomic(recordPath(dir, id), toJsonText(record));
      forgetListing(dir);
    },
    async remove(id) {
      if (!trashDir) throw new Error(`collection ${dir} keeps no trash`);
      await mkdirp(trashDir);
      let trashPath = recordPath(trashDir, id);
      try {
        await fsp.access(trashPath);
        trashPath = join(trashDir, `${id}.${fileStamp(new Date().toISOString())}.json`);
      } catch {
        // free name
      }
      await fsp.rename(recordPath(dir, id), trashPath);
      forgetListing(dir);
    },
    async history(id) {
      if (!historyDir) return [];
      return readRecords(join(historyDir, assertId(id)), guard);
    },
  };
}

/**
 * Creates the record `build` returns under an id that is the file stamp of its creation time, starting at `firstCreatedAtMs`;
 * a collision (the same millisecond on two clients) retries with the next millisecond. `noun` names the record in the error.
 */
export async function createWithStampId<T>(records: Collection<T>, firstCreatedAtMs: number, build: (id: string, createdAt: string) => T, noun: string): Promise<T> {
  let createdAtMs = firstCreatedAtMs;
  for (let attempt = 0; attempt < 50; attempt++) {
    const createdAt = new Date(createdAtMs).toISOString();
    const id = fileStamp(createdAt);
    const record = build(id, createdAt);
    try {
      await records.create(id, record);
      return record;
    } catch (e) {
      if (errorCode(e) !== "EEXIST") throw e;
      createdAtMs += 1;
    }
  }
  throw new Error(`could not allocate a ${noun} id`);
}
