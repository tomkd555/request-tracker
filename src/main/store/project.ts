import { promises as fsp } from "node:fs";
import { isProject, type Project } from "../../shared/types";
import { readRecord, writeAtomic } from "./collection";
import { collectionDirs, type Layout } from "./paths";

export function readProject(l: Layout): Promise<Project | null> {
  return readRecord(l.projectFile, isProject);
}

export async function initProject(l: Layout, fiscalYearStartMonth: number): Promise<Project> {
  if (!Number.isInteger(fiscalYearStartMonth) || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) {
    throw new Error(`fiscal year start month out of range: ${fiscalYearStartMonth}`);
  }
  const project: Project = { fiscalYearStartMonth, createdAt: new Date().toISOString() };
  for (const dir of collectionDirs(l)) await fsp.mkdir(dir, { recursive: true });
  await writeAtomic(l.projectFile, JSON.stringify(project, null, 2) + "\n");
  return project;
}
