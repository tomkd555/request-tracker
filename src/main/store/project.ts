import { promises as fsp } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_STATUSES,
  HEX_COLOR,
  isProject,
  STATUS_KINDS,
  type CategoryTemplate,
  type CustomField,
  type Label,
  type Project,
  type StatusDef,
} from "../../shared/types";
import { SHARE_UNREACHABLE } from "./attachments";
import { mkdirp, readRecord, writeAtomic } from "./collection";
import { fileStamp } from "./fileStamp";
import { collectionDirs, type Layout } from "./paths";

const serialize = (p: Project): string => JSON.stringify(p, null, 2) + "\n";

/** project.json exists but fails to parse or validate. */
export const PROJECT_INVALID = "project-invalid";

/** Grey, for a stage whose stored colour is unreadable. */
const FALLBACK_COLOR = "#6c7a87";

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
  // project.json is read from the share, so a colour edited by hand is dropped here the way putCategories and putLabels would refuse it.
  const colors = Object.fromEntries(Object.entries(p.categoryColors ?? {}).filter(([, c]) => HEX_COLOR.test(c)));
  // A stage is the key issues are stored under, so a hand-edited colour is replaced, never dropped; an empty list falls back to the defaults
  // because the screens index statuses[0] and derive the default filter from the list.
  const statuses = (p.statuses ?? []).map((s) => (HEX_COLOR.test(s.color) ? s : { ...s, color: FALLBACK_COLOR }));
  return {
    ...p,
    categoryColors: colors,
    labels: (p.labels ?? []).filter((l) => HEX_COLOR.test(l.color)),
    statuses: statuses.length === 0 ? DEFAULT_STATUSES : statuses,
    categories: p.categories ?? DEFAULT_CATEGORIES,
    categoryTemplates: p.categoryTemplates ?? {},
    fields: p.fields ?? [],
  };
}

export async function initProject(l: Layout, fiscalYearStartMonth: number): Promise<Project> {
  if (!Number.isInteger(fiscalYearStartMonth) || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) {
    throw new Error(`fiscal year start month out of range: ${fiscalYearStartMonth}`);
  }
  const project: Project = {
    fiscalYearStartMonth,
    createdAt: new Date().toISOString(),
    categories: DEFAULT_CATEGORIES,
    categoryColors: {},
    categoryTemplates: {},
    fields: [],
    labels: [],
    statuses: DEFAULT_STATUSES,
  };
  for (const dir of collectionDirs(l)) await mkdirp(dir);
  await fsp.writeFile(l.projectFile, serialize(project), { encoding: "utf8", flag: "wx" }); // exclusive: a file that appeared meanwhile stays
  return project;
}

// ponytail: no stale-write guard here (and none on putFields below) — re-read-and-replace of one section already limits the damage a race can do,
// and a real guard would need a Project.updatedAt that serves only the guard, since categories/fields have no updatedAt of their own. Add one if a race here starts to hurt.
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
  return writeProject(l, { ...current, categories: cleaned, categoryColors: colors, categoryTemplates: templates });
}

/** Replaces the 汎用列 definitions only: a row with an empty name is dropped, a repeated id keeps its first row, options are trimmed and deduplicated. */
export async function putFields(l: Layout, fields: CustomField[]): Promise<Project> {
  const current = await readProject(l);
  if (current === null) throw new Error("project.json is missing");
  const seen = new Set<string>();
  const cleaned: CustomField[] = [];
  for (const f of fields) {
    const name = f.name.trim();
    if (name === "" || f.id === "" || seen.has(f.id)) continue;
    seen.add(f.id);
    cleaned.push({ id: f.id, name, options: [...new Set(f.options.map((o) => o.trim()).filter((o) => o !== ""))] });
  }
  return writeProject(l, { ...current, fields: cleaned });
}

// ponytail: removing a label leaves the name on existing issues, shown grey; a sweep over issues/ if orphans become a nuisance.
/** Replaces the ラベル definitions only: a row with a blank name is dropped, a repeated name keeps its first row, colours must be #rrggbb. */
export async function putLabels(l: Layout, labels: Label[]): Promise<Project> {
  const current = await readProject(l);
  if (current === null) throw new Error("project.json is missing");
  const seen = new Set<string>();
  const cleaned: Label[] = [];
  for (const label of labels) {
    const name = label.name.trim();
    if (name === "" || seen.has(name)) continue;
    if (!HEX_COLOR.test(label.color)) throw new Error(`colour must be #rrggbb: ${label.color}`);
    seen.add(name);
    cleaned.push({ name, color: label.color.toLowerCase() });
  }
  return writeProject(l, { ...current, labels: cleaned });
}

// ponytail: removing a stage leaves its id on existing issues; the renderer reads those as the first stage and writes it back on their next save.
/** Replaces the 状態 stages only: a row with a blank name is dropped, a repeated id keeps its first row, colours must be #rrggbb, kinds must be known, at least one row stays. */
export async function putStatuses(l: Layout, statuses: StatusDef[]): Promise<Project> {
  const current = await readProject(l);
  if (current === null) throw new Error("project.json is missing");
  const seen = new Set<string>();
  const cleaned: StatusDef[] = [];
  for (const s of statuses) {
    const name = s.name.trim();
    if (name === "" || s.id === "" || seen.has(s.id)) continue;
    if (!HEX_COLOR.test(s.color)) throw new Error(`colour must be #rrggbb: ${s.color}`);
    if (!STATUS_KINDS.includes(s.kind)) throw new Error(`unknown status kind: ${String(s.kind)}`);
    seen.add(s.id);
    cleaned.push({ id: s.id, name, color: s.color.toLowerCase(), kind: s.kind });
  }
  if (cleaned.length === 0) throw new Error("statuses must not be empty");
  return writeProject(l, { ...current, statuses: cleaned });
}

/** The previous file goes to history/project/ before the atomic overwrite. */
async function writeProject(l: Layout, project: Project): Promise<Project> {
  await mkdirp(l.historyProject);
  await fsp.copyFile(l.projectFile, join(l.historyProject, `${fileStamp(new Date().toISOString())}.json`));
  await writeAtomic(l.projectFile, serialize(project));
  return project;
}
