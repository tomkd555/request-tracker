import { promises as fsp } from "node:fs";
import { basename, extname, join } from "node:path";
import type { AddAttachmentsResult, AttachmentOwner, AttachmentRefusal } from "../../shared/api";
import type { Attachment } from "../../shared/types";
import { errorCode, mkdirp } from "./collection";
import { fileStamp } from "./fileStamp";
import { SHARE_UNREACHABLE, type Layout } from "./paths";

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
// Extensions Windows hands to an interpreter or installer on open: executables, script hosts, shortcuts, help files,
// ClickOnce launchers. Shared by the add path and the open path. Extend when a new runnable type turns up.
const REFUSED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".ps1", ".psc1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".hta", ".msi", ".msp", ".scr", ".pif", ".lnk", ".url", ".scf", ".reg", ".msc", ".cpl", ".jar",
  ".chm", ".application", ".appref-ms", ".settingcontent-ms",
]);

/** How many numbered names ("report (2).xlsx", …) are tried before an add gives up. */
const MAX_NAME_ATTEMPTS = 1000;

let tempCopySeq = 0; // distinguishes concurrent copies of the same name within one process

/** An attachment name is one path segment chosen by another user; it never walks out of the issue folder. */
export function assertName(name: string): string {
  if (name === "" || name === "." || name === ".." || /[\\/]/.test(name) || name.startsWith(".")) {
    throw new Error(`invalid attachment name: ${name}`);
  }
  return name;
}

export const isRefusedExtension = (name: string): boolean => REFUSED_EXTENSIONS.has(extname(name).toLowerCase());

export const attachmentDir = (layout: Layout, owner: AttachmentOwner): string => (owner.kind === "issue" ? layout.attachments(owner.id) : layout.wikiAttachments(owner.id));
const attachmentTrashDir = (layout: Layout, owner: AttachmentOwner): string => (owner.kind === "issue" ? layout.trashAttachments(owner.id) : layout.trashWikiAttachments(owner.id));

/** Folders first, then by name in Japanese collation. */
function compareAttachments(a: Attachment, b: Attachment): number {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
  return a.name.localeCompare(b.name, "ja");
}

export async function listAttachments(layout: Layout, owner: AttachmentOwner): Promise<Attachment[]> {
  const dir = attachmentDir(layout, owner);
  let names: string[];
  try {
    names = await fsp.readdir(dir);
  } catch (e) {
    if (errorCode(e) === "ENOENT") return [];
    throw e;
  }
  const attachments: Attachment[] = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    try {
      const stats = await fsp.stat(join(dir, name));
      attachments.push({
        name,
        kind: stats.isDirectory() ? "folder" : "file",
        size: stats.isDirectory() ? null : stats.size,
        addedAt: new Date(stats.birthtimeMs || stats.mtimeMs).toISOString(),
      });
    } catch {
      // vanished mid-listing
    }
  }
  return attachments.sort(compareAttachments);
}

/** The name for the `copyNumber`-th item of that name: "report.xlsx" -> "report (2).xlsx"; "photos" (folder) -> "photos (2)". The first keeps its name. */
export function suffixed(name: string, copyNumber: number, isFolder: boolean): string {
  if (copyNumber === 1) return name;
  if (isFolder) return `${name} (${copyNumber})`;
  const ext = extname(name);
  return `${name.slice(0, name.length - ext.length)} (${copyNumber})${ext}`;
}

function refusalOf(path: string, sizeBytes: number): AttachmentRefusal | null {
  if (isRefusedExtension(path)) return { path, reason: "extension" };
  if (sizeBytes > MAX_ATTACHMENT_BYTES) return { path, reason: "size" };
  return null;
}

/** Claims a final file name with an exclusive create, then renames the temp file over the placeholder; resolves to the name taken. */
async function placeFile(dir: string, tempPath: string, name: string): Promise<string> {
  for (let copyNumber = 1; copyNumber < MAX_NAME_ATTEMPTS; copyNumber++) {
    const candidate = suffixed(name, copyNumber, false);
    const target = join(dir, candidate);
    try {
      await (await fsp.open(target, "wx")).close();
    } catch (e) {
      if (errorCode(e) === "EEXIST") continue;
      throw e;
    }
    try {
      await fsp.rename(tempPath, target);
    } catch (e) {
      await fsp.unlink(target).catch(() => {}); // our own empty placeholder, never user data
      throw e;
    }
    return candidate;
  }
  throw new Error(`no free name for ${name}`);
}

/** Renames the temp folder to a free final name; rename onto an existing directory fails, which is the claim. Resolves to the name taken. */
async function placeFolder(dir: string, tempPath: string, name: string): Promise<string> {
  for (let copyNumber = 1; copyNumber < MAX_NAME_ATTEMPTS; copyNumber++) {
    const candidate = suffixed(name, copyNumber, true);
    try {
      await fsp.access(join(dir, candidate));
      continue;
    } catch {
      // free so far
    }
    try {
      await fsp.rename(tempPath, join(dir, candidate));
      return candidate;
    } catch (e) {
      if (["EEXIST", "ENOTEMPTY", "EPERM"].includes(errorCode(e) ?? "")) continue;
      throw e;
    }
  }
  throw new Error(`no free name for ${name}`);
}

/** Copies the files of `sourceDir` into `destDir`, folder by folder; a file or link left out is added to `refused`. */
async function copyFolder(sourceDir: string, destDir: string, refused: AttachmentRefusal[]): Promise<void> {
  await mkdirp(destDir);
  for (const entry of await fsp.readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name);
    if (entry.isDirectory()) {
      await copyFolder(sourcePath, join(destDir, entry.name), refused);
    } else if (entry.isFile()) {
      const refusal = refusalOf(sourcePath, (await fsp.stat(sourcePath)).size);
      if (refusal) refused.push(refusal);
      else await fsp.copyFile(sourcePath, join(destDir, entry.name));
    } else {
      refused.push({ path: sourcePath, reason: "link" }); // symbolic links and junctions are left out, and said so
    }
  }
}

export async function addAttachments(layout: Layout, owner: AttachmentOwner, paths: string[]): Promise<AddAttachmentsResult> {
  const dir = attachmentDir(layout, owner);
  try {
    await fsp.access(layout.root);
    await mkdirp(dir);
  } catch {
    throw new Error(SHARE_UNREACHABLE);
  }
  const result: AddAttachmentsResult = { added: [], refused: [] };
  for (const sourcePath of paths) {
    const name = basename(sourcePath);
    if (name === "") {
      result.refused.push({ path: sourcePath, reason: "failed" }); // a drive root has no name to store it under
      continue;
    }
    if (name.startsWith(".")) {
      result.refused.push({ path: sourcePath, reason: "name" }); // the listing hides dot names and assertName refuses them, so a copy could never be opened or removed
      continue;
    }
    const tempPath = join(dir, `.${name}.tmp-${process.pid}-${tempCopySeq++}`);
    // One path that fails (source gone, share dropped mid-copy) is reported with the refusals, and the rest are still added.
    try {
      const stats = await fsp.lstat(sourcePath);
      if (stats.isSymbolicLink()) {
        result.refused.push({ path: sourcePath, reason: "link" }); // a link or junction would copy whatever it points at
        continue;
      }
      if (stats.isDirectory()) {
        await copyFolder(sourcePath, tempPath, result.refused);
        result.added.push(await placeFolder(dir, tempPath, name));
        continue;
      }
      const refusal = refusalOf(sourcePath, stats.size);
      if (refusal) {
        result.refused.push(refusal);
        continue;
      }
      await fsp.copyFile(sourcePath, tempPath);
      result.added.push(await placeFile(dir, tempPath, name));
    } catch (e) {
      console.error(`store: attachment not added: ${sourcePath}`, e);
      await fsp.rm(tempPath, { recursive: true, force: true }).catch(() => undefined);
      result.refused.push({ path: sourcePath, reason: "failed" });
    }
  }
  return result;
}

export async function removeAttachment(layout: Layout, owner: AttachmentOwner, name: string): Promise<void> {
  assertName(name);
  const trashDir = attachmentTrashDir(layout, owner);
  await mkdirp(trashDir);
  let trashPath = join(trashDir, name);
  try {
    await fsp.access(trashPath);
    trashPath = join(trashDir, `${name}.${fileStamp(new Date().toISOString())}`);
  } catch {
    // free name
  }
  await fsp.rename(join(attachmentDir(layout, owner), name), trashPath);
}
