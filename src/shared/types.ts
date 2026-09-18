// Record types stored on the shared folder, and the per-machine config. This file is the schema.

export type ThemeName = "green" | "blue" | "gray" | "dark";
export const THEME_NAMES: ThemeName[] = ["green", "blue", "gray", "dark"];

/** Per-machine preferences in %APPDATA%\request-tracker\config.json; a file written before a field existed gets the default on read. */
export interface LocalSettings {
  theme: ThemeName;
  accent: string | null; // "#rrggbb"; null = the preset's own accent
  dueSoonDays: number; // 0–30
  // ponytail: saved views live per machine; move the array to project.json with its own project:putViews if the team asks for shared views
  savedFilters: SavedFilter[]; // named issue-list/gantt filters; [] on files written before this field
}
export interface LocalConfig extends LocalSettings { rootDir: string }

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = { theme: "green", accent: null, dueSoonDays: 3, savedFilters: [] };
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export interface Project {
  fiscalYearStartMonth: number; // 1–12, default 4
  createdAt: string;
  categories: string[]; // 種別 choices, in display order; a project.json written before this field gets DEFAULT_CATEGORIES on read
  categoryColors: Record<string, string>; // 種別 name -> "#rrggbb"; {} on files written before this field
  categoryTemplates: Record<string, CategoryTemplate>; // 種別 name -> text preset on the new-issue form; {} on files written before this field
  fields: CustomField[]; // 汎用列 definitions, in display order; [] on files written before this field
  labels: Label[]; // ラベル definitions, in display order; [] on files written before this field
  statuses: StatusDef[]; // 状態 stages, in display order; DEFAULT_STATUSES on files written before this field
}

/** A named ラベル with its pill colour; Issue.labels matches one by name, the way 種別 matches Project.categories by name. */
export interface Label { name: string; color: string }

/** What a stage means to the screens: active issues carry due-date tones, a review stage awaits the reporter's 確認, a done stage counts as 完了. */
export type StatusKind = "active" | "review" | "done";
export const STATUS_KINDS: StatusKind[] = ["active", "review", "done"];

/** One stage of the per-project 状態 list; Issue.status holds the id, so a rename never orphans an issue. */
export interface StatusDef { id: string; name: string; color: string; kind: StatusKind }

export const DEFAULT_STATUSES: StatusDef[] = [
  { id: "open", name: "未対応", color: "#ed8276", kind: "active" },
  { id: "in_progress", name: "処理中", color: "#4488c5", kind: "active" },
  { id: "resolved", name: "処理済み", color: "#5fb5a6", kind: "review" },
  { id: "closed", name: "完了", color: "#a1af2f", kind: "done" },
];

/** Text the new-issue form loads when its 種別 is chosen. */
export interface CategoryTemplate { summary: string; body: string }

/** A per-project column on every issue: free text when `options` is empty, otherwise one of the options. Never required. */
export interface CustomField { id: string; name: string; options: string[] }

export const DEFAULT_CATEGORIES: string[] = ["問い合わせ", "不具合", "依頼", "その他"];

/**
 * username is the OS login for a user who registered on first launch, or a file stamp for a member added by name in
 * project settings; `login` is the OS login bound to such a member once that person picks the name on first launch.
 */
export interface User { username: string; displayName: string; createdAt: string; login?: string }

export type IssueStatus = string; // a StatusDef.id of the project
export type IssuePriority = "high" | "normal" | "low";

export type DueFilter = "all" | "overdue" | "week" | "none";

export interface IssueFilter {
  statuses: IssueStatus[];
  assignee: string | null;
  reporter: string | null;
  keyword: string;
  due: DueFilter;
  /** 種別; null means every category. */
  category: string | null;
  /** Only issues 処理済み that `me` reported and has yet to confirm. */
  awaitingConfirmation: boolean;
  /** ラベル names to keep, OR'd like `statuses`; an empty list matches every issue. */
  labels: string[];
  /** 汎用列 id -> the one value to keep; an id absent here matches every value. */
  fields: Record<string, string>;
}

/** A named filter bookmarked on the issue list or gantt screen. */
export interface SavedFilter { name: string; filter: IssueFilter }

export interface Issue {
  key: string; // "26-0012": fiscal year (two digits) - sequence within that year (four digits)
  summary: string;
  description: string; // Markdown
  category: string; // one of Project.categories; "" on records written before this field
  status: IssueStatus; // an id absent from Project.statuses reads as the first stage (see withKnownStatus)
  priority: IssuePriority;
  assignee: string | null; // username
  reporter: string; // username
  parentKey: string | null; // one level: a child has no children
  startDate: string | null; // YYYY-MM-DD
  dueDate: string | null; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  fields: Record<string, string>; // CustomField id -> value; {} on records written before this field
  labels: string[]; // Label.name values, the way category names Project.categories; [] on records written before this field
  relations: Relation[]; // typed links this issue names; [] on records written before this field
}

export interface Comment {
  id: string; // `${createdAt file stamp}-${author}`
  issueKey: string;
  author: string;
  body: string; // Markdown
  createdAt: string;
}

export interface WikiPage {
  id: string; // file stamp at creation
  title: string;
  body: string; // Markdown
  parentId: string | null; // one of the other pages; null at the root, and on records written before this field
  note: string; // what the last save changed, typed by the editor; "" on records written before this field
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

// Derived from stat, never stored; size is null for a folder.
export interface Attachment { name: string; kind: "file" | "folder"; size: number | null; addedAt: string }

export const ISSUE_PRIORITIES: IssuePriority[] = ["high", "normal", "low"];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const str = (v: unknown): v is string => typeof v === "string";
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
const strOrAbsent = (v: unknown): v is string | undefined => v === undefined || typeof v === "string";
const strArrayOrAbsent = (v: unknown): v is string[] | undefined => v === undefined || (Array.isArray(v) && v.every(str));
const strMapOrAbsent = (v: unknown): v is Record<string, string> | undefined => v === undefined || (isRec(v) && Object.values(v).every(str));
const bool = (v: unknown): v is boolean => typeof v === "boolean";
const strMap = (v: unknown): v is Record<string, string> => isRec(v) && Object.values(v).every(str);
const DUE_FILTERS: DueFilter[] = ["all", "overdue", "week", "none"];
const isTemplate = (v: unknown): v is CategoryTemplate => isRec(v) && str(v.summary) && str(v.body);
const templateMapOrAbsent = (v: unknown): v is Record<string, CategoryTemplate> | undefined =>
  v === undefined || (isRec(v) && Object.values(v).every(isTemplate));
const isField = (v: unknown): v is CustomField => isRec(v) && str(v.id) && str(v.name) && Array.isArray(v.options) && v.options.every(str);
const fieldsOrAbsent = (v: unknown): v is CustomField[] | undefined => v === undefined || (Array.isArray(v) && v.every(isField));
const isLabel = (v: unknown): v is Label => isRec(v) && str(v.name) && str(v.color);
const labelsOrAbsent = (v: unknown): v is Label[] | undefined => v === undefined || (Array.isArray(v) && v.every(isLabel));
const isStatusDef = (v: unknown): v is StatusDef => isRec(v) && str(v.id) && str(v.name) && str(v.color) && STATUS_KINDS.includes(v.kind as StatusKind);
const statusesOrAbsent = (v: unknown): v is StatusDef[] | undefined => v === undefined || (Array.isArray(v) && v.every(isStatusDef));

/** Accepts a project.json without `categories`, `categoryColors`, `categoryTemplates`, `fields`, `labels` or `statuses`; `readProject` fills the defaults. */
export function isProject(v: unknown): v is Project {
  return (
    isRec(v) &&
    Number.isInteger(v.fiscalYearStartMonth) &&
    str(v.createdAt) &&
    strArrayOrAbsent(v.categories) &&
    strMapOrAbsent(v.categoryColors) &&
    templateMapOrAbsent(v.categoryTemplates) &&
    fieldsOrAbsent(v.fields) &&
    labelsOrAbsent(v.labels) &&
    statusesOrAbsent(v.statuses)
  );
}

export function isIssueFilter(v: unknown): v is IssueFilter {
  return (
    isRec(v) &&
    Array.isArray(v.statuses) &&
    v.statuses.every(str) &&
    strOrNull(v.assignee) &&
    strOrNull(v.reporter) &&
    str(v.keyword) &&
    DUE_FILTERS.includes(v.due as DueFilter) &&
    strOrNull(v.category) &&
    bool(v.awaitingConfirmation) &&
    strArrayOrAbsent(v.labels) &&
    strMap(v.fields)
  );
}

export function isSavedFilter(v: unknown): v is SavedFilter {
  return isRec(v) && str(v.name) && isIssueFilter(v.filter);
}

const intIn = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Throws on a value outside the documented ranges; the settings screen shows the message. */
export function assertLocalSettings(s: LocalSettings): void {
  if (!THEME_NAMES.includes(s.theme)) throw new Error(`unknown theme: ${String(s.theme)}`);
  if (s.accent !== null && !(str(s.accent) && HEX_COLOR.test(s.accent))) throw new Error(`accent must be #rrggbb: ${String(s.accent)}`);
  if (!intIn(s.dueSoonDays, 0, 30)) throw new Error(`dueSoonDays out of range: ${String(s.dueSoonDays)}`);
}

/** Each optional field of config.json is taken when valid and otherwise falls back to its default, so an old or hand-edited file still loads. */
export function localSettingsFrom(v: Record<string, unknown>): LocalSettings {
  const d = DEFAULT_LOCAL_SETTINGS;
  return {
    theme: THEME_NAMES.includes(v.theme as ThemeName) ? (v.theme as ThemeName) : d.theme,
    accent: str(v.accent) && HEX_COLOR.test(v.accent) ? v.accent : d.accent,
    dueSoonDays: intIn(v.dueSoonDays, 0, 30) ? v.dueSoonDays : d.dueSoonDays,
    savedFilters: Array.isArray(v.savedFilters) ? v.savedFilters.filter(isSavedFilter) : d.savedFilters,
  };
}

export function isUser(v: unknown): v is User {
  return isRec(v) && str(v.username) && str(v.displayName) && str(v.createdAt) && strOrAbsent(v.login);
}

export const ISSUE_KEY = /^\d{2}-\d{4,}$/;
export const STAMP_ID = /^\d{8}T\d{9}Z$/;

/** Accepts a record without `category`, `fields`, `labels` or `relations` (written before those fields existed); the store fills "", {} and [] on read. */
export function isIssue(v: unknown): v is Issue {
  return (
    isRec(v) &&
    str(v.key) &&
    ISSUE_KEY.test(v.key) &&
    str(v.summary) &&
    str(v.description) &&
    strOrAbsent(v.category) &&
    strMapOrAbsent(v.fields) &&
    strArrayOrAbsent(v.labels) &&
    str(v.status) &&
    ISSUE_PRIORITIES.includes(v.priority as IssuePriority) &&
    strOrNull(v.assignee) &&
    str(v.reporter) &&
    strOrNull(v.parentKey) &&
    strOrNull(v.startDate) &&
    strOrNull(v.dueDate) &&
    str(v.createdAt) &&
    str(v.updatedAt) &&
    str(v.updatedBy) &&
    relationsOrAbsent(v.relations)
  );
}

export function isComment(v: unknown): v is Comment {
  return isRec(v) && str(v.id) && str(v.issueKey) && str(v.author) && str(v.body) && str(v.createdAt);
}

/** Accepts a page without `parentId` or `note` (written before the fields existed); the store fills null and "" on read. */
export function isWikiPage(v: unknown): v is WikiPage {
  return (
    isRec(v) &&
    str(v.id) &&
    STAMP_ID.test(v.id) &&
    str(v.title) &&
    str(v.body) &&
    (v.parentId === undefined || strOrNull(v.parentId)) &&
    strOrAbsent(v.note) &&
    str(v.createdAt) &&
    str(v.createdBy) &&
    str(v.updatedAt) &&
    str(v.updatedBy)
  );
}

export type RelationType = "relates" | "duplicates" | "precedes";
export const RELATION_TYPES: RelationType[] = ["relates", "duplicates", "precedes"];

/** One side of a link between issues; the store writes only this side and derives the inverse on read. */
export interface Relation { type: RelationType; key: string }

export function isRelation(v: unknown): v is Relation {
  return isRec(v) && RELATION_TYPES.includes(v.type as RelationType) && str(v.key) && ISSUE_KEY.test(v.key);
}

/** Accepts a record without `relations` (written before the field existed); the store fills [] on read. */
export const relationsOrAbsent = (v: unknown): v is Relation[] | undefined => v === undefined || (Array.isArray(v) && v.every(isRelation));
