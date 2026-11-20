import { promises as fsp } from "node:fs";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_STATUSES,
  HEX_COLOR,
  isProject,
  isYmd,
  STATUS_KINDS,
  type CategoryTemplate,
  type CustomField,
  type Label,
  type Milestone,
  type Project,
  type StatusDef,
} from "../../shared/types";
import { createExclusive, errorCode, keepVersion, mkdirp, readRecord, toJsonText, writeAtomic } from "./collection";
import { fileStamp } from "./fileStamp";
import { assertShareReachable, collectionDirs, type Layout } from "./paths";

/** project.json exists but fails to parse or validate. */
const PROJECT_INVALID = "project-invalid";

/** Grey, for a stage whose stored colour is unreadable. */
const FALLBACK_COLOR = "#6c7a87";

/**
 * A project.json written before `categories` or `categoryColors` existed comes back with the defaults.
 * null means a folder with no project yet; a root that cannot be reached (drive offline) throws SHARE_UNREACHABLE instead,
 * so the first-launch screen never offers to create a project on a dead share.
 */
export async function readProject(layout: Layout): Promise<Project | null> {
  const stored = await readRecord(layout.projectFile, isProject);
  if (stored === null) {
    await assertShareReachable(layout.root);
    // The file is there but unreadable (truncated by a sync, edited by hand): the first-launch screen must never offer to recreate it.
    const fileExists = await fsp.access(layout.projectFile).then(() => true, () => false);
    if (fileExists) throw new Error(PROJECT_INVALID);
    return null;
  }
  // project.json is read from the share, so a colour edited by hand is dropped here the way putCategories and putLabels would refuse it.
  const categoryColors = Object.fromEntries(Object.entries(stored.categoryColors ?? {}).filter(([, color]) => HEX_COLOR.test(color)));
  // A stage is the key issues are stored under, so a hand-edited colour is replaced, never dropped; an empty list falls back to the defaults
  // because the screens index statuses[0] and derive the default filter from the list.
  const statuses = (stored.statuses ?? []).map((status) => (HEX_COLOR.test(status.color) ? status : { ...status, color: FALLBACK_COLOR }));
  return {
    ...stored,
    categoryColors,
    labels: (stored.labels ?? []).filter((label) => HEX_COLOR.test(label.color)),
    statuses: statuses.length === 0 ? DEFAULT_STATUSES : statuses,
    categories: stored.categories ?? DEFAULT_CATEGORIES,
    categoryTemplates: stored.categoryTemplates ?? {},
    fields: stored.fields ?? [],
    // A date edited by hand into another form reads as no date, the form putMilestones would refuse; the .ics export and the burndown read these dates.
    milestones: (stored.milestones ?? []).map((milestone) => ({
      ...milestone,
      startDate: isYmd(milestone.startDate) ? milestone.startDate : null,
      dueDate: isYmd(milestone.dueDate) ? milestone.dueDate : null,
    })),
  };
}

/** The project every write starts from; rejects when the folder holds no project.json. */
export async function requireProject(layout: Layout): Promise<Project> {
  const project = await readProject(layout);
  if (project === null) throw new Error("project.json is missing");
  return project;
}

export async function initProject(layout: Layout, fiscalYearStartMonth: number): Promise<Project> {
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
    milestones: [],
  };
  for (const dir of collectionDirs(layout)) await mkdirp(dir);
  try {
    await createExclusive(layout.projectFile, toJsonText(project)); // exclusive: a file that appeared meanwhile stays
  } catch (e) {
    if (errorCode(e) !== "EEXIST") throw e;
    return requireProject(layout); // another instance created the project first: this one carries on with that project
  }
  return project;
}

const trimmedNonEmptyUnique = (values: string[]): string[] => [...new Set(values.map((value) => value.trim()).filter((value) => value !== ""))];

// ponytail: no stale-write guard here (and none on putFields below) — re-read-and-replace of one section already limits the damage a race can do,
// and a real guard would need a Project.updatedAt that serves only the guard, since categories/fields have no updatedAt of their own. Add one if a race here starts to hurt.
/** Replaces the 種別 fields only, re-reading the file first so the other fields stay as they are on disk; the previous file goes to history/project/. */
export async function putCategories(
  layout: Layout,
  categories: string[],
  categoryColors: Record<string, string>,
  categoryTemplates: Record<string, CategoryTemplate> = {},
): Promise<Project> {
  const current = await requireProject(layout);
  const names = trimmedNonEmptyUnique(categories);
  if (names.length === 0) throw new Error("categories must not be empty");
  // Built from entries: an assignment to a 種別 named `__proto__` would set the prototype and store nothing.
  const colorEntries: [string, string][] = [];
  for (const name of names) {
    if (!Object.hasOwn(categoryColors, name)) continue;
    const color = categoryColors[name];
    if (!HEX_COLOR.test(color)) throw new Error(`colour must be #rrggbb: ${color}`);
    colorEntries.push([name, color.toLowerCase()]);
  }
  const templateEntries: [string, CategoryTemplate][] = [];
  for (const name of names) {
    const template = Object.hasOwn(categoryTemplates, name) ? categoryTemplates[name] : undefined;
    const hasText = template !== undefined && (template.summary.trim() !== "" || template.body.trim() !== "");
    if (hasText) templateEntries.push([name, { summary: template.summary, body: template.body }]);
  }
  return writeProject(layout, { ...current, categories: names, categoryColors: Object.fromEntries(colorEntries), categoryTemplates: Object.fromEntries(templateEntries) });
}

/** Replaces the 汎用列 definitions only: a row with an empty name is dropped, a repeated id keeps its first row, options are trimmed and deduplicated. */
export async function putFields(layout: Layout, fields: CustomField[]): Promise<Project> {
  const current = await requireProject(layout);
  const seenIds = new Set<string>();
  const cleaned: CustomField[] = [];
  for (const field of fields) {
    const name = field.name.trim();
    if (name === "" || field.id === "" || seenIds.has(field.id)) continue;
    seenIds.add(field.id);
    cleaned.push({ id: field.id, name, options: trimmedNonEmptyUnique(field.options) });
  }
  return writeProject(layout, { ...current, fields: cleaned });
}

// ponytail: removing a label leaves the name on existing issues, shown grey; a sweep over issues/ if orphans become a nuisance.
/** Replaces the ラベル definitions only: a row with a blank name is dropped, a repeated name keeps its first row, colours must be #rrggbb. */
export async function putLabels(layout: Layout, labels: Label[]): Promise<Project> {
  const current = await requireProject(layout);
  const seenNames = new Set<string>();
  const cleaned: Label[] = [];
  for (const label of labels) {
    const name = label.name.trim();
    if (name === "" || seenNames.has(name)) continue;
    if (!HEX_COLOR.test(label.color)) throw new Error(`colour must be #rrggbb: ${label.color}`);
    seenNames.add(name);
    cleaned.push({ name, color: label.color.toLowerCase() });
  }
  return writeProject(layout, { ...current, labels: cleaned });
}

// ponytail: removing a stage leaves its id on existing issues; the renderer reads those as the first stage and writes it back on their next save.
/** Replaces the 状態 stages only: a row with a blank name is dropped, a repeated id keeps its first row, colours must be #rrggbb, kinds must be known, at least one row stays. */
export async function putStatuses(layout: Layout, statuses: StatusDef[]): Promise<Project> {
  const current = await requireProject(layout);
  const seenIds = new Set<string>();
  const cleaned: StatusDef[] = [];
  for (const status of statuses) {
    const name = status.name.trim();
    if (name === "" || status.id === "" || seenIds.has(status.id)) continue;
    if (!HEX_COLOR.test(status.color)) throw new Error(`colour must be #rrggbb: ${status.color}`);
    if (!STATUS_KINDS.includes(status.kind)) throw new Error(`unknown status kind: ${String(status.kind)}`);
    seenIds.add(status.id);
    cleaned.push({ id: status.id, name, color: status.color.toLowerCase(), kind: status.kind });
  }
  if (cleaned.length === 0) throw new Error("statuses must not be empty");
  return writeProject(layout, { ...current, statuses: cleaned });
}

// ponytail: removing a milestone leaves its id on existing issues, which the screens read as no milestone; a sweep over issues/ if orphans become a nuisance.
/** Replaces the マイルストーン list only: a row with an empty name or id is dropped, a repeated id keeps its first row, a date must be YYYY-MM-DD and the due date may not precede the start date. */
export async function putMilestones(layout: Layout, milestones: Milestone[]): Promise<Project> {
  const current = await requireProject(layout);
  const seenIds = new Set<string>();
  const cleaned: Milestone[] = [];
  for (const milestone of milestones) {
    if (typeof milestone !== "object" || milestone === null || typeof milestone.name !== "string" || typeof milestone.id !== "string") throw new Error("invalid record");
    const { id, startDate, dueDate, closed } = milestone;
    const name = milestone.name.trim();
    if (name === "" || id === "" || seenIds.has(id)) continue;
    for (const date of [startDate, dueDate]) if (date !== null && !isYmd(date)) throw new Error(`milestone date must be YYYY-MM-DD: ${String(date)}`);
    if (startDate !== null && dueDate !== null && dueDate < startDate) throw new Error(`milestone due date is before the start date: ${name}`);
    seenIds.add(id);
    cleaned.push({ id, name, startDate, dueDate, closed });
  }
  return writeProject(layout, { ...current, milestones: cleaned });
}

/** The previous file goes to history/project/ before the atomic overwrite. */
async function writeProject(layout: Layout, project: Project): Promise<Project> {
  if (!isProject(project)) throw new Error("invalid record"); // readProject would reject the file this writes
  await mkdirp(layout.historyProject);
  await keepVersion(layout.projectFile, layout.historyProject, fileStamp(new Date().toISOString()));
  await writeAtomic(layout.projectFile, toJsonText(project));
  return project;
}
