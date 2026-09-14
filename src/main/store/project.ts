import { promises as fsp } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CATEGORIES, HEX_COLOR, isProject, type CategoryTemplate, type Project } from "../../shared/types";
import { SHARE_UNREACHABLE } from "./attachments";
import { mkdirp, readRecord, writeAtomic } from "./collection";
import { fileStamp } from "./fileStamp";
import { collectionDirs, type Layout } from "./paths";

const serialize = (p: Project): string => JSON.stringify(p, null, 2) + "\n";

/** project.json exists but fails to parse or validate. */
export const PROJECT_INVALID = "project-invalid";

/**
 * A project.json written before `categories` or `categoryColors` existed comes back with the defaults.
 * null means a folder with no project yet; a root that cannot be reached (drive offline) throws SHARE_UNREACHABLE instead,
 * so the first-launch screen never offers to create a project on a dead share.
 */
export async function readProject(l: Layout): Promise<Project | null> {
  const p = await readRecord(l.projectFile, isProject);
  if (p === null) {
    await fsp.access(l.root).catch(() => {
      throw new Error(SHARE_UNREACHABLE);
    });
    // The file is there but unreadable (truncated by a sync, edited by hand): the first-launch screen must never offer to recreate it.
    const exists = await fsp.access(l.projectFile).then(() => true, () => false);
    if (exists) throw new Error(PROJECT_INVALID);
    return null;
  }
  return { ...p, categories: p.categories ?? DEFAULT_CATEGORIES, categoryColors: p.categoryColors ?? {}, categoryTemplates: p.categoryTemplates ?? {} };
}

export async function initProject(l: Layout, fiscalYearStartMonth: number): Promise<Project> {
  if (!Number.isInteger(fiscalYearStartMonth) || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) {
    throw new Error(`fiscal year start month out of range: ${fiscalYearStartMonth}`);
  }
  const project: Project = { fiscalYearStartMonth, createdAt: new Date().toISOString(), categories: DEFAULT_CATEGORIES, categoryColors: {}, categoryTemplates: {} };
  for (const dir of collectionDirs(l)) await mkdirp(dir);
  await fsp.writeFile(l.projectFile, serialize(project), { encoding: "utf8", flag: "wx" }); // exclusive: a file that appeared meanwhile stays
  return project;
}

/** Replaces the 種別 fields only, re-reading the file first so the other fields stay as they are on disk; the previous file goes to history/project/. */
export async function putCategories(
  l: Layout,
  categories: string[],
  categoryColors: Record<string, string>,
  categoryTemplates: Record<string, CategoryTemplate> = {},
): Promise<Project> {
  const current = await readProject(l);
  if (current === null) throw new Error("project.json is missing");
  const cleaned = [...new Set(categories.map((c) => c.trim()).filter((c) => c !== ""))];
  if (cleaned.length === 0) throw new Error("categories must not be empty");
  const colors: Record<string, string> = {};
  for (const name of cleaned) {
    const color = categoryColors[name];
    if (color === undefined) continue;
    if (!HEX_COLOR.test(color)) throw new Error(`colour must be #rrggbb: ${color}`);
    colors[name] = color.toLowerCase();
  }
  const templates: Record<string, CategoryTemplate> = {};
  for (const name of cleaned) {
    const t = categoryTemplates[name];
    if (t !== undefined && (t.summary.trim() !== "" || t.body.trim() !== "")) templates[name] = { summary: t.summary, body: t.body };
  }
  await mkdirp(l.historyProject);
  await fsp.copyFile(l.projectFile, join(l.historyProject, `${fileStamp(new Date().toISOString())}.json`));
  const project: Project = { ...current, categories: cleaned, categoryColors: colors, categoryTemplates: templates };
  await writeAtomic(l.projectFile, serialize(project));
  return project;
}
