import { promises as fsp } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CATEGORIES, HEX_COLOR, isProject, type Project } from "../../shared/types";
import { readRecord, writeAtomic } from "./collection";
import { fileStamp } from "./fileStamp";
import { collectionDirs, type Layout } from "./paths";

const serialize = (p: Project): string => JSON.stringify(p, null, 2) + "\n";

/** A project.json written before `categories` or `categoryColors` existed comes back with the defaults. */
export async function readProject(l: Layout): Promise<Project | null> {
  const p = await readRecord(l.projectFile, isProject);
  if (p === null) return null;
  return { ...p, categories: p.categories ?? DEFAULT_CATEGORIES, categoryColors: p.categoryColors ?? {} };
}

export async function initProject(l: Layout, fiscalYearStartMonth: number): Promise<Project> {
  if (!Number.isInteger(fiscalYearStartMonth) || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) {
    throw new Error(`fiscal year start month out of range: ${fiscalYearStartMonth}`);
  }
  const project: Project = { fiscalYearStartMonth, createdAt: new Date().toISOString(), categories: DEFAULT_CATEGORIES, categoryColors: {} };
  for (const dir of collectionDirs(l)) await fsp.mkdir(dir, { recursive: true });
  await writeAtomic(l.projectFile, serialize(project));
  return project;
}

/** Replaces `categories` and `categoryColors` only, re-reading the file first so the other fields stay as they are on disk; the previous file goes to history/project/. */
export async function putCategories(l: Layout, categories: string[], categoryColors: Record<string, string>): Promise<Project> {
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
  await fsp.mkdir(l.historyProject, { recursive: true });
  await fsp.copyFile(l.projectFile, join(l.historyProject, `${fileStamp(new Date().toISOString())}.json`));
  const project: Project = { ...current, categories: cleaned, categoryColors: colors };
  await writeAtomic(l.projectFile, serialize(project));
  return project;
}
