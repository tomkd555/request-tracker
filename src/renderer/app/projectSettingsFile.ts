import { HEX_COLOR, isCustomField, isLabel, isMilestone, isStatusDef, isCategoryTemplate, isYmd, type CategoryTemplate, type CustomField, type Label, type Milestone, type Project, type StatusDef } from "../../shared/types";

const SETTINGS_FORMAT = "request-tracker-project-settings";
const SETTINGS_VERSION = 1;

/** The part of a settings file that failed validation, named as the screen shows it. */
export type SettingsPart = "形式" | "バージョン" | "種別" | "状態" | "ラベル" | "汎用列" | "マイルストーン";

interface ProjectSettingsData {
  categories: string[];
  categoryColors: Record<string, string>;
  categoryTemplates: Record<string, CategoryTemplate>;
  statuses: StatusDef[];
  labels: Label[];
  fields: CustomField[];
  milestones: Milestone[];
}

export type SettingsParse = { ok: true; settings: ProjectSettingsData } | { ok: false; part: SettingsPart };

/** The text of a settings file holding the project's team settings. */
export function exportProjectSettings(p: Project): string {
  const file = {
    format: SETTINGS_FORMAT,
    version: SETTINGS_VERSION,
    categories: p.categories,
    categoryColors: p.categoryColors,
    categoryTemplates: p.categoryTemplates,
    statuses: p.statuses,
    labels: p.labels,
    fields: p.fields,
    milestones: p.milestones ?? [],
  };
  return JSON.stringify(file, null, 2) + "\n";
}

type PlainObject = Record<string, unknown>;
const isPlainObject = (v: unknown): v is PlainObject => typeof v === "object" && v !== null && !Array.isArray(v);
const isListOf = <T>(v: unknown, is: (x: unknown) => x is T): v is T[] => Array.isArray(v) && v.every(is);
const isFilled = (s: string): boolean => s.trim() !== "";

// Each check holds what the matching project.put* method accepts, so no put of a file that passes here is refused; the put methods drop blank and repeated rows.
const validCategories = (f: PlainObject): boolean =>
  isListOf(f.categories, (x): x is string => typeof x === "string") &&
  f.categories.some(isFilled) &&
  isPlainObject(f.categoryColors) &&
  Object.values(f.categoryColors).every((c) => typeof c === "string" && HEX_COLOR.test(c)) &&
  isPlainObject(f.categoryTemplates) &&
  Object.values(f.categoryTemplates).every(isCategoryTemplate);
const validStatuses = (f: PlainObject): boolean =>
  isListOf(f.statuses, isStatusDef) && f.statuses.some((s) => isFilled(s.name) && s.id !== "") && f.statuses.every((s) => HEX_COLOR.test(s.color));
const validLabels = (f: PlainObject): boolean => isListOf(f.labels, isLabel) && f.labels.every((l) => HEX_COLOR.test(l.color));
const validFields = (f: PlainObject): boolean => isListOf(f.fields, isCustomField);
const validMilestones = (f: PlainObject): boolean =>
  isListOf(f.milestones, isMilestone) &&
  f.milestones.every((m) => [m.startDate, m.dueDate].every((d) => d === null || isYmd(d)) && (m.startDate === null || m.dueDate === null || m.startDate <= m.dueDate));

/** Validates a whole settings file; the first part that fails, in the order 形式, バージョン, 種別, 状態, ラベル, 汎用列, マイルストーン, is named. */
export function parseProjectSettings(text: string): SettingsParse {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, part: "形式" };
  }
  if (!isPlainObject(file) || file.format !== SETTINGS_FORMAT) return { ok: false, part: "形式" };
  if (file.version !== SETTINGS_VERSION) return { ok: false, part: "バージョン" };
  const checks: [SettingsPart, (f: PlainObject) => boolean][] = [
    ["種別", validCategories],
    ["状態", validStatuses],
    ["ラベル", validLabels],
    ["汎用列", validFields],
    ["マイルストーン", validMilestones],
  ];
  for (const [part, valid] of checks) if (!valid(file)) return { ok: false, part };
  return {
    ok: true,
    settings: {
      categories: file.categories as string[],
      categoryColors: file.categoryColors as Record<string, string>,
      categoryTemplates: file.categoryTemplates as Record<string, CategoryTemplate>,
      statuses: file.statuses as StatusDef[],
      labels: file.labels as Label[],
      fields: file.fields as CustomField[],
      milestones: file.milestones as Milestone[],
    },
  };
}
