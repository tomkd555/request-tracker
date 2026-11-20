import { randomUUID } from "node:crypto";
import { constants, promises as fsp } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileStamp } from "./fileStamp";

export type Collection<T> = {
  /** A record file that cannot be read (held open by another program) is left out; with `strict` it rejects the call, for a caller that takes a missing record as an absent one. */
  list(strict?: boolean): Promise<T[]>;
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

/** The records of a directory, and the error of the first record file that could not be read (held open by another program, or closed to this user); undefined when every file was read. */
interface Listing<T> { records: T[]; unreadable: unknown }

/** The valid records of `dir` in file-name order; a directory that does not exist yet holds no records. */
async function readListing<T>(dir: string, guard: (v: unknown) => v is T, idOf?: (record: T) => string): Promise<Listing<T>> {
  let names: string[];
  try {
    names = await fsp.readdir(dir);
  } catch (e) {
    if (errorCode(e) === "ENOENT") return { records: [], unreadable: undefined };
    throw e;
  }
  const fileNames = names.filter((name) => name.endsWith(".json") && !name.startsWith(".")).sort();
  let unreadable: unknown;
  let readCount = 0;
  const records = await mapLimit(fileNames, async (fileName) => {
    let record: T | null;
    try {
      record = await readRecord(join(dir, fileName), guard);
    } catch (e) {
      // One record that cannot be read must not hide every other one; any other failure (the share dropped) still rejects the listing.
      const code = errorCode(e) ?? "";
      if (code !== "EISDIR" && !HELD_OPEN.has(code)) throw e;
      console.error(`store: record cannot be read, skipped: ${join(dir, fileName)}`, e);
      if (code !== "EISDIR") unreadable ??= e; // a folder under a record's name is no record
      return null;
    }
    readCount++;
    if (record === null || idOf === undefined) return record;
    // Compared as Windows compares file names: a login stored in another letter case is the same member, and a conflict copy still differs.
    const idInFileName = fileName.slice(0, -".json".length);
    if (idOf(record).toLowerCase() !== idInFileName.toLowerCase()) {
      console.error(`store: file name differs from the record id, skipped: ${join(dir, fileName)}`);
      return null;
    }
    return record;
  });
  if (unreadable !== undefined && readCount === 0) throw unreadable; // a folder this user may not read must not pass for an empty one
  return { records: records.filter((record): record is T => record !== null), unreadable };
}

/**
 * Every valid record of `dir` in file-name order, read from disk on each call. A record file that cannot be read is left out;
 * with `strict` it rejects the call, for a check that guards a write and must see every record.
 */
export async function readRecords<T>(dir: string, guard: (v: unknown) => v is T, idOf?: (record: T) => string, strict = false): Promise<T[]> {
  const listing = await readListing(dir, guard, idOf);
  if (strict && listing.unreadable !== undefined) throw listing.unreadable;
  return listing.records;
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

/** A temp name beside `target` that no other save uses, on this machine or on another one writing the same share; the leading dot keeps it out of every listing. */
const tempPathFor = (target: string): string => join(dirname(target), `.${basename(target)}.tmp-${randomUUID()}`);

/** Codes Windows gives a rename, a delete or a read while another program (a virus scanner, a sync client, the indexer) holds the file open, or when the file is closed to this user. */
const HELD_OPEN = new Set(["EPERM", "EACCES", "EBUSY"]);
const HELD_OPEN_RETRY_DELAYS_MS = [25, 50, 100, 200, 400, 800];

/** `operation`, tried again while a file it needs is held open for a moment; any other failure, and one that outlasts the delays, rejects. */
async function whenFree<T>(operation: () => Promise<T>): Promise<T> {
  for (const delayMs of HELD_OPEN_RETRY_DELAYS_MS) {
    try {
      return await operation();
    } catch (e) {
      if (!HELD_OPEN.has(errorCode(e) ?? "")) throw e;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return operation();
}

/** fs.rename that waits out a file another program holds open for a moment. */
export const renameWhenFree = (from: string, to: string): Promise<void> => whenFree(() => fsp.rename(from, to));

/** Write to a temp file in the same directory, then rename over the target. */
export async function writeAtomic(target: string, text: string): Promise<void> {
  const tempPath = tempPathFor(target);
  await mkdirp(dirname(target));
  try {
    await fsp.writeFile(tempPath, text, "utf8");
    await renameWhenFree(tempPath, target);
  } catch (e) {
    await fsp.unlink(tempPath).catch(() => undefined); // after a full disk or a failed rename the temp file goes; a share that dropped keeps it
    throw e;
  }
}

/**
 * Writes `text` to `target` only while that name is free; rejects with code EEXIST when it is taken.
 * The text is complete under a temp name before a hard link gives it the final name, so an instance that stops mid-write,
 * or a write that fails, leaves no half-written record. Where the link fails for another reason (a file system without
 * hard links: exFAT, some NAS shares), the text goes to the final name with a plain exclusive write.
 */
export async function createExclusive(target: string, text: string): Promise<void> {
  const tempPath = tempPathFor(target);
  try {
    await fsp.writeFile(tempPath, text, "utf8");
    try {
      await fsp.link(tempPath, target);
    } catch (e) {
      if (errorCode(e) === "EEXIST") throw e;
      await fsp.writeFile(target, text, { encoding: "utf8", flag: "wx" });
    }
  } finally {
    // After the link the temp name is a second name of the record, and a scanner that opened the record holds it too.
    await whenFree(() => fsp.unlink(tempPath)).catch(() => undefined);
  }
}

/** Copies the record file `source` into `versionsDir` under `stamp`. Another version already kept under that stamp stays: the copy takes the next free suffix (`_001`, `_002`), which sorts after it. */
export async function keepVersion(source: string, versionsDir: string, stamp: string): Promise<void> {
  for (let copy = 0; ; copy++) {
    const target = join(versionsDir, copy === 0 ? `${stamp}.json` : `${stamp}_${String(copy).padStart(3, "0")}.json`);
    try {
      await fsp.copyFile(source, target, constants.COPYFILE_EXCL);
      return;
    } catch (e) {
      if (errorCode(e) !== "EEXIST") throw e;
    }
    if ((await fsp.readFile(target, "utf8")) === (await fsp.readFile(source, "utf8"))) return; // this version is kept already: a save retried after its history copy
  }
}

/** The ISO time of the version a record holds: updatedAt, then createdAt. `put` compares it with `expectedUpdatedAt`, and it names the history copy. */
const versionTimeOf = (record: unknown): string => {
  const { updatedAt, createdAt } = record as { updatedAt?: unknown; createdAt?: unknown };
  const iso = typeof updatedAt === "string" ? updatedAt : createdAt;
  return typeof iso === "string" ? iso : new Date().toISOString();
};

/** The file stamp of an ISO time, or null when `iso` is no time. */
const stampOf = (iso: unknown): string | null => {
  try {
    return typeof iso === "string" ? fileStamp(iso) : null;
  } catch {
    return null;
  }
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
const pendingReads = new Map<string, Promise<Listing<unknown>>>();

/** Forgets the listing of `dir`; called after every write of this process, so its own change is visible at once. A read in flight still resolves for its callers, but its result is never cached. */
const forgetListing = (dir: string): void => {
  listings.delete(dir);
  pendingReads.delete(dir);
};

/** One stat per call while nothing changed; a full read otherwise. The age bound covers a share that reports directory mtimes late. */
// ponytail: a file system with coarse mtimes (2 s on exFAT) can hide another client's write for that long; lower LIST_TTL_MS if it bites
async function readRecordsCached<T>(dir: string, guard: (v: unknown) => v is T, idOf?: (record: T) => string, strict = false): Promise<T[]> {
  const signature = await dirSignature(dir);
  const nowMs = Date.now();
  const cached = listings.get(dir);
  if (cached !== undefined && cached.signature === signature && nowMs - cached.readAtMs < LIST_TTL_MS) return cached.records.slice() as T[]; // a copy, so a caller's sort never reaches the cache
  for (const [listedDir, listing] of listings) if (nowMs - listing.readAtMs >= LIST_TTL_MS) listings.delete(listedDir); // expired listings go, so the map holds the directories in use alone
  let pendingRead = pendingReads.get(dir);
  if (pendingRead === undefined) {
    const read: Promise<Listing<unknown>> = readListing(dir, guard, idOf).then(
      (listing) => {
        if (pendingReads.get(dir) === read) {
          // A listing that left a record out is served to this call alone: the next call reads the directory again.
          if (listing.unreadable === undefined) listings.set(dir, { signature, readAtMs: nowMs, records: listing.records });
          pendingReads.delete(dir);
        }
        return listing;
      },
      (e: unknown) => {
        if (pendingReads.get(dir) === read) pendingReads.delete(dir); // the next call reads again
        throw e;
      },
    );
    pendingReads.set(dir, read);
    pendingRead = read;
  }
  const listing = await pendingRead;
  if (strict && listing.unreadable !== undefined) throw listing.unreadable;
  return listing.records.slice() as T[];
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
    // A time that does not parse must not block the save: updatedAt, then createdAt, then now.
    const stamp = stampOf(versionTimeOf(current)) ?? stampOf((current as { createdAt?: unknown }).createdAt) ?? fileStamp(new Date().toISOString());
    await keepVersion(recordPath(dir, id), versionsDir, stamp);
  }

  return {
    list: (strict) => readRecordsCached(dir, guard, idOf, strict),
    get: (id) => readRecord(recordPath(dir, id), guard),
    async create(id, record) {
      assertValid(record);
      await mkdirp(dir);
      await createExclusive(recordPath(dir, id), toJsonText(record));
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
      await renameWhenFree(recordPath(dir, id), trashPath);
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
