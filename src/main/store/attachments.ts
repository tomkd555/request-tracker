import { promises as fsp } from "node:fs";
import { basename, extname, join } from "node:path";
import type { AddAttachmentsResult, AttachmentOwner, AttachmentRefusal } from "../../shared/api";
import type { Attachment } from "../../shared/types";
import { mkdirp } from "./collection";
import { fileStamp } from "./fileStamp";
import type { Layout } from "./paths";

export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
// Everything Windows runs on open, including script hosts and shortcuts; shared by the add path and the open path.
export const REFUSED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".ps1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".hta", ".msi", ".msp", ".scr", ".pif", ".lnk", ".url", ".scf", ".reg", ".msc", ".cpl", ".jar",
]);

/** Error messages are stable tokens; the renderer turns them into Japanese. */
export const SHARE_UNREACHABLE = "share-unreachable";

const code = (e: unknown): string | undefined => (e as NodeJS.ErrnoException).code;
let tmpSeq = 0; // distinguishes concurrent copies of the same name within one process

/** An attachment name is one path segment chosen by another user; it never walks out of the issue folder. */
export function assertName(name: string): string {
  if (name === "" || name === "." || name === ".." || /[\\/]/.test(name) || name.startsWith(".")) {
    throw new Error(`invalid attachment name: ${name}`);
  }
  return name;
}

export const isRefusedExtension = (name: string): boolean => REFUSED_EXTENSIONS.has(extname(name).toLowerCase());

export const attachmentDir = (l: Layout, o: AttachmentOwner): string => (o.kind === "issue" ? l.attachments(o.id) : l.wikiAttachments(o.id));
const trashDir = (l: Layout, o: AttachmentOwner): string => (o.kind === "issue" ? l.trashAttachments(o.id) : l.trashWikiAttachments(o.id));

export async function listAttachments(l: Layout, owner: AttachmentOwner): Promise<Attachment[]> {
  const dir = attachmentDir(l, owner);
  let names: string[];
  try {
    names = await fsp.readdir(dir);
  } catch (e) {
    if (code(e) === "ENOENT") return [];
    throw e;
  }
  const out: Attachment[] = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    try {
      const s = await fsp.stat(join(dir, name));
      out.push({
        name,
        kind: s.isDirectory() ? "folder" : "file",
        size: s.isDirectory() ? null : s.size,
        addedAt: new Date(s.birthtimeMs || s.mtimeMs).toISOString(),
      });
    } catch {
      // vanished mid-listing
    }
  }
  return out.sort((a, b) => (a.kind !== b.kind ? (a.kind === "folder" ? -1 : 1) : a.name.localeCompare(b.name, "ja")));
}

/** "report.xlsx" -> "report (2).xlsx"; "photos" (folder) -> "photos (2)". */
export function suffixed(name: string, n: number, isFolder: boolean): string {
  if (n === 1) return name;
  if (isFolder) return `${name} (${n})`;
  const ext = extname(name);
  return `${name.slice(0, name.length - ext.length)} (${n})${ext}`;
}

function refusalOf(path: string, size: number): AttachmentRefusal | null {
  if (isRefusedExtension(path)) return { path, reason: "extension" };
  if (size > MAX_ATTACHMENT_BYTES) return { path, reason: "size" };
  return null;
}

/** Claims a final file name with an exclusive create, then renames the temp file over the placeholder. */
async function placeFile(dir: string, tmp: string, name: string): Promise<string> {
  for (let n = 1; n < 1000; n++) {
    const candidate = suffixed(name, n, false);
    const target = join(dir, candidate);
    try {
      await (await fsp.open(target, "wx")).close();
    } catch (e) {
      if (code(e) === "EEXIST") continue;
      throw e;
    }
    try {
      await fsp.rename(tmp, target);
    } catch (e) {
      await fsp.unlink(target).catch(() => {}); // our own empty placeholder, never user data
      throw e;
    }
    return candidate;
  }
  throw new Error(`no free name for ${name}`);
}

/** Renames the temp folder to a free final name; rename onto an existing directory fails, which is the claim. */
async function placeFolder(dir: string, tmp: string, name: string): Promise<string> {
  for (let n = 1; n < 1000; n++) {
    const candidate = suffixed(name, n, true);
    try {
      await fsp.access(join(dir, candidate));
      continue;
    } catch {
      // free so far
    }
    try {
      await fsp.rename(tmp, join(dir, candidate));
      return candidate;
    } catch (e) {
      if (["EEXIST", "ENOTEMPTY", "EPERM"].includes(code(e) ?? "")) continue;
      throw e;
    }
  }
  throw new Error(`no free name for ${name}`);
}

async function copyFolder(src: string, dest: string, refused: AttachmentRefusal[]): Promise<void> {
  await mkdirp(dest);
  for (const entry of await fsp.readdir(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    if (entry.isDirectory()) {
      await copyFolder(from, join(dest, entry.name), refused);
    } else if (entry.isFile()) {
      const r = refusalOf(from, (await fsp.stat(from)).size);
      if (r) refused.push(r);
      else await fsp.copyFile(from, join(dest, entry.name));
    } else {
      refused.push({ path: from, reason: "link" }); // symbolic links and junctions are left out, and said so
    }
  }
}

export async function addAttachments(l: Layout, owner: AttachmentOwner, paths: string[]): Promise<AddAttachmentsResult> {
  const dir = attachmentDir(l, owner);
  try {
    await fsp.access(l.root);
    await mkdirp(dir);
  } catch {
    throw new Error(SHARE_UNREACHABLE);
  }
  const result: AddAttachmentsResult = { added: [], refused: [] };
  for (const src of paths) {
    const name = basename(src);
    const stat = await fsp.stat(src);
    const tmp = join(dir, `.${name}.tmp-${process.pid}-${tmpSeq++}`);
    if (stat.isDirectory()) {
      await copyFolder(src, tmp, result.refused);
      result.added.push(await placeFolder(dir, tmp, name));
      continue;
    }
    const r = refusalOf(src, stat.size);
    if (r) {
      result.refused.push(r);
      continue;
    }
    await fsp.copyFile(src, tmp);
    result.added.push(await placeFile(dir, tmp, name));
  }
  return result;
}

export async function removeAttachment(l: Layout, owner: AttachmentOwner, name: string): Promise<void> {
  assertName(name);
  const trash = trashDir(l, owner);
  await mkdirp(trash);
  let dest = join(trash, name);
  try {
    await fsp.access(dest);
    dest = join(trash, `${name}.${fileStamp(new Date().toISOString())}`);
  } catch {
    // free name
  }
  await fsp.rename(join(attachmentDir(l, owner), name), dest);
}
