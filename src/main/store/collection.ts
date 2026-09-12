import { promises as fsp } from "node:fs";
import { join } from "node:path";
import { fileStamp } from "./fileStamp";

export type Collection<T> = {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  /** Exclusive create: rejects with code EEXIST when the id is taken. */
  create(id: string, record: T): Promise<void>;
  /** Atomic overwrite; copies the previous version to history first. */
  put(id: string, record: T): Promise<void>;
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

const file = (dir: string, id: string): string => join(dir, `${id}.json`);
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
  const records: T[] = [];
  for (const name of names.filter((n) => n.endsWith(".json") && !n.startsWith(".")).sort()) {
    const r = await readRecord(join(dir, name), guard);
    if (r !== null) records.push(r);
  }
  return records;
}

/** Write to a temp file in the same directory, then rename over the target. */
export async function writeAtomic(target: string, text: string): Promise<void> {
  const dir = join(target, "..");
  const tmp = join(dir, `.${target.slice(dir.length + 1)}.tmp-${process.pid}`);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(tmp, text, "utf8");
  await fsp.rename(tmp, target);
}

const defaultStamp = (r: unknown): string => {
  const rec = r as { updatedAt?: unknown; createdAt?: unknown };
  const iso = typeof rec.updatedAt === "string" ? rec.updatedAt : rec.createdAt;
  return typeof iso === "string" ? iso : new Date().toISOString();
};

export function collection<T>(opts: CollectionOptions<T>): Collection<T> {
  const { dir, guard, historyDir, trashDir } = opts;
  const stampOf = opts.stampOf ?? defaultStamp;

  async function archive(id: string): Promise<void> {
    if (!historyDir) return;
    const current = await readRecord(file(dir, id), guard);
    if (current === null) return;
    const dest = join(historyDir, id);
    await fsp.mkdir(dest, { recursive: true });
    await fsp.copyFile(file(dir, id), join(dest, `${fileStamp(stampOf(current))}.json`));
  }

  return {
    list: () => readDir(dir, guard),
    get: (id) => readRecord(file(dir, id), guard),
    async create(id, record) {
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(file(dir, id), serialize(record), { encoding: "utf8", flag: "wx" });
    },
    async put(id, record) {
      await archive(id);
      await writeAtomic(file(dir, id), serialize(record));
    },
    async remove(id) {
      if (!trashDir) throw new Error(`collection ${dir} keeps no trash`);
      await fsp.mkdir(trashDir, { recursive: true });
      let dest = file(trashDir, id);
      try {
        await fsp.access(dest);
        dest = join(trashDir, `${id}.${fileStamp(new Date().toISOString())}.json`);
      } catch {
        // free name
      }
      await fsp.rename(file(dir, id), dest);
    },
    async history(id) {
      if (!historyDir) return [];
      return readDir(join(historyDir, id), guard);
    },
  };
}
