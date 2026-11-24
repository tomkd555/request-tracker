// Record types stored on the shared folder, and the per-machine config. This file is the schema.

export type ThemeName = "green" | "blue" | "gray" | "dark";
export const THEME_NAMES: ThemeName[] = ["green", "blue", "gray", "dark"];
/** The status message after a save that moved to another screen: shown with motion, shown without motion, or never shown. */
export type NoticeMode = "motion" | "still" | "off";
export const NOTICE_MODES: NoticeMode[] = ["motion", "still", "off"];

/** Per-machine preferences in %APPDATA%\request-tracker\config.json; a file written before a field existed gets the default on read. */
export interface LocalSettings {
  theme: ThemeName;
  accent: string | null; // "#rrggbb"; null = the preset's own accent
  notice: NoticeMode;
  dueSoonDays: number; // 0–30
  // ponytail: saved views live per machine; move the array to project.json with its own project:putViews if the team asks for shared views
  savedFilters: SavedFilter[]; // named filters shared by the list, kanban and gantt screens; [] on files written before this field
}
export interface LocalConfig extends LocalSettings { rootDir: string }

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = { theme: "green", accent: null, notice: "motion", dueSoonDays: 3, savedFilters: [] };
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
  // Optional in the type so records built without it still compile; readProject always fills [] on read.
  milestones?: Milestone[]; // マイルストーン definitions, in display order; [] on files written before this field
}

/** A named target a group of issues works toward; Issue.milestone holds the id, so a rename never orphans an issue. Dates are YYYY-MM-DD. */
export interface Milestone { id: string; name: string; startDate: string | null; dueDate: string | null; closed: boolean }

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
  /** "" keeps unassigned issues; null keeps every issue. */
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
  /** A Milestone.id to keep; "" keeps the issues without one; null (or absent, in a filter saved before this field) keeps every issue. */
  milestone?: string | null;
}

/** A named filter bookmarked on the issue list, kanban or gantt screen. */
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
  parentKey: string | null; // a chain spans at most MAX_DEPTH levels (see issueTree)
  startDate: string | null; // YYYY-MM-DD
  dueDate: string | null; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  fields: Record<string, string>; // CustomField id -> value; {} on records written before this field
  labels: string[]; // Label.name values, the way category names Project.categories; [] on records written before this field
  relations: Relation[]; // typed links this issue names; [] on records written before this field
  // Optional in the type so records built without them still compile; the store fills null on read.
  milestone?: string | null; // a Milestone.id; an id the project no longer lists reads as no milestone; null on records written before this field
  estimatedHours?: number | null; // see isHours; null on records written before this field
  actualHours?: number | null; // see isHours; null on records written before this field
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

/** Report-only wording for one issue: a 件名 for the report and a one-line 補足; "" keeps the issue's own text. */
export interface IssueNote { summary: string; note: string }

/**
 * A report for people outside the team: Markdown with `::issues`, `::summary` and `::gantt` block lines that render from the
 * issues as they stand when the report is opened or exported (see renderer/reports/blocks.ts). `terms` maps a name the
 * screens show (a stage, a 種別, a ラベル, a member, a column heading) to the word the report uses; `issueNotes` is keyed by issue key.
 */
export interface Report {
  id: string; // file stamp at creation
  title: string;
  body: string; // Markdown plus block lines
  isTemplate: boolean; // offered as the starting point of a new report
  terms: Record<string, string>;
  issueNotes: Record<string, IssueNote>;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

// Derived from stat, never stored; size is null for a folder.
export interface Attachment { name: string; kind: "file" | "folder"; size: number | null; addedAt: string }

export const ISSUE_PRIORITIES: IssuePriority[] = ["high", "normal", "low"];

// Type guards for values parsed from JSON. The record guards below are built from these.
type JsonObject = Record<string, unknown>;
type Guard<T> = (v: unknown) => v is T;
const isObject = (v: unknown): v is JsonObject => typeof v === "object" && v !== null;
const isString = (v: unknown): v is string => typeof v === "string";
const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";
const isStringOrNull = (v: unknown): v is string | null => v === null || isString(v);
const isIntegerIn = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isArrayOf = <T>(isItem: Guard<T>): Guard<T[]> => (v): v is T[] => Array.isArray(v) && v.every((item) => isItem(item));
const isMapOf = <T>(isValue: Guard<T>): Guard<Record<string, T>> => (v): v is Record<string, T> => isObject(v) && Object.values(v).every((value) => isValue(value));
/** For a field added after the first records were written: the guard also accepts a record without the field. */
const isAbsentOr = <T>(guard: Guard<T>): Guard<T | undefined> => (v): v is T | undefined => v === undefined || guard(v);

const isStringArray = isArrayOf(isString);
const isStringMap = isMapOf(isString);
const isStringOrAbsent = isAbsentOr(isString);
const isStringOrNullOrAbsent = isAbsentOr(isStringOrNull);
const isStringArrayOrAbsent = isAbsentOr(isStringArray);
const isStringMapOrAbsent = isAbsentOr(isStringMap);

export const DUE_FILTERS: DueFilter[] = ["all", "overdue", "week", "none"];
export const isCategoryTemplate = (v: unknown): v is CategoryTemplate => isObject(v) && isString(v.summary) && isString(v.body);
const isCategoryTemplateMapOrAbsent = isAbsentOr(isMapOf(isCategoryTemplate));
export const isCustomField = (v: unknown): v is CustomField => isObject(v) && isString(v.id) && isString(v.name) && isStringArray(v.options);
const isFieldsOrAbsent = isAbsentOr(isArrayOf(isCustomField));
export const isLabel = (v: unknown): v is Label => isObject(v) && isString(v.name) && isString(v.color);
const isLabelsOrAbsent = isAbsentOr(isArrayOf(isLabel));
/** 予定時間 and 実績時間: a finite number, 0 or more, with at most 2 decimal places. */
export const isHours = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && Math.round(v * 100) / 100 === v;
const isHoursOrNullOrAbsent = (v: unknown): v is number | null | undefined => v === undefined || v === null || isHours(v);
/** True for a YYYY-MM-DD that names a real calendar day. */
export function isYmd(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const date = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(v);
}
export const isMilestone = (v: unknown): v is Milestone => isObject(v) && isString(v.id) && isString(v.name) && isStringOrNull(v.startDate) && isStringOrNull(v.dueDate) && isBoolean(v.closed);
const isMilestonesOrAbsent = isAbsentOr(isArrayOf(isMilestone));
export const isStatusDef = (v: unknown): v is StatusDef => isObject(v) && isString(v.id) && isString(v.name) && isString(v.color) && STATUS_KINDS.includes(v.kind as StatusKind);
const isStatusesOrAbsent = isAbsentOr(isArrayOf(isStatusDef));

/** Accepts a project.json without `categories`, `categoryColors`, `categoryTemplates`, `fields`, `labels`, `statuses` or `milestones`; `readProject` fills the defaults. */
export function isProject(v: unknown): v is Project {
  return (
    isObject(v) &&
    isIntegerIn(v.fiscalYearStartMonth, 1, 12) &&
    isString(v.createdAt) &&
    isStringArrayOrAbsent(v.categories) &&
    isStringMapOrAbsent(v.categoryColors) &&
    isCategoryTemplateMapOrAbsent(v.categoryTemplates) &&
    isFieldsOrAbsent(v.fields) &&
    isLabelsOrAbsent(v.labels) &&
    isStatusesOrAbsent(v.statuses) &&
    isMilestonesOrAbsent(v.milestones)
  );
}

export function isIssueFilter(v: unknown): v is IssueFilter {
  return (
    isObject(v) &&
    isStringArray(v.statuses) &&
    isStringOrNull(v.assignee) &&
    isStringOrNull(v.reporter) &&
    isString(v.keyword) &&
    DUE_FILTERS.includes(v.due as DueFilter) &&
    isStringOrNull(v.category) &&
    isBoolean(v.awaitingConfirmation) &&
    isStringArrayOrAbsent(v.labels) &&
    isStringMap(v.fields) &&
    isStringOrNullOrAbsent(v.milestone)
  );
}

export function isSavedFilter(v: unknown): v is SavedFilter {
  return isObject(v) && isString(v.name) && isIssueFilter(v.filter);
}

/** Throws on a value outside the documented ranges; the settings screen shows the message. */
export function assertLocalSettings(s: LocalSettings): void {
  if (!THEME_NAMES.includes(s.theme)) throw new Error(`unknown theme: ${String(s.theme)}`);
  if (s.accent !== null && !(isString(s.accent) && HEX_COLOR.test(s.accent))) throw new Error(`accent must be #rrggbb: ${String(s.accent)}`);
  if (!NOTICE_MODES.includes(s.notice)) throw new Error(`unknown notice: ${String(s.notice)}`);
  if (!isIntegerIn(s.dueSoonDays, 0, 30)) throw new Error(`dueSoonDays out of range: ${String(s.dueSoonDays)}`);
  if (!Array.isArray(s.savedFilters) || !s.savedFilters.every(isSavedFilter)) throw new Error("savedFilters is malformed");
}

/** Each optional field of config.json is taken when valid and otherwise falls back to its default, so an old or hand-edited file still loads. */
export function localSettingsFrom(v: Record<string, unknown>): LocalSettings {
  const defaults = DEFAULT_LOCAL_SETTINGS;
  return {
    theme: THEME_NAMES.includes(v.theme as ThemeName) ? (v.theme as ThemeName) : defaults.theme,
    accent: isString(v.accent) && HEX_COLOR.test(v.accent) ? v.accent : defaults.accent,
    notice: NOTICE_MODES.includes(v.notice as NoticeMode) ? (v.notice as NoticeMode) : defaults.notice,
    dueSoonDays: isIntegerIn(v.dueSoonDays, 0, 30) ? v.dueSoonDays : defaults.dueSoonDays,
    savedFilters: Array.isArray(v.savedFilters) ? v.savedFilters.filter(isSavedFilter) : defaults.savedFilters,
  };
}

export function isUser(v: unknown): v is User {
  return isObject(v) && isString(v.username) && isString(v.displayName) && isString(v.createdAt) && isStringOrAbsent(v.login);
}

export const ISSUE_KEY = /^\d{2}-\d{4,}$/;
export const STAMP_ID = /^\d{8}T\d{9}Z$/;

/** Accepts a record without `category`, `fields`, `labels`, `relations`, `milestone`, `estimatedHours` or `actualHours` (written before those fields existed); the store fills "", {}, [] and null on read. */
export function isIssue(v: unknown): v is Issue {
  return (
    isObject(v) &&
    isString(v.key) &&
    ISSUE_KEY.test(v.key) &&
    isString(v.summary) &&
    isString(v.description) &&
    isStringOrAbsent(v.category) &&
    isStringMapOrAbsent(v.fields) &&
    isStringArrayOrAbsent(v.labels) &&
    isString(v.status) &&
    ISSUE_PRIORITIES.includes(v.priority as IssuePriority) &&
    isStringOrNull(v.assignee) &&
    isString(v.reporter) &&
    isStringOrNull(v.parentKey) &&
    isStringOrNull(v.startDate) &&
    isStringOrNull(v.dueDate) &&
    isString(v.createdAt) &&
    isString(v.updatedAt) &&
    isString(v.updatedBy) &&
    isRelationsOrAbsent(v.relations) &&
    isStringOrNullOrAbsent(v.milestone) &&
    isHoursOrNullOrAbsent(v.estimatedHours) &&
    isHoursOrNullOrAbsent(v.actualHours)
  );
}

export function isComment(v: unknown): v is Comment {
  return isObject(v) && isString(v.id) && isString(v.issueKey) && isString(v.author) && isString(v.body) && isString(v.createdAt);
}

/** Accepts a page without `parentId` or `note` (written before the fields existed); the store fills null and "" on read. */
export function isWikiPage(v: unknown): v is WikiPage {
  return (
    isObject(v) &&
    isString(v.id) &&
    STAMP_ID.test(v.id) &&
    isString(v.title) &&
    isString(v.body) &&
    isStringOrNullOrAbsent(v.parentId) &&
    isStringOrAbsent(v.note) &&
    isString(v.createdAt) &&
    isString(v.createdBy) &&
    isString(v.updatedAt) &&
    isString(v.updatedBy)
  );
}

const isIssueNote = (v: unknown): v is IssueNote => isObject(v) && isString(v.summary) && isString(v.note);

export function isReport(v: unknown): v is Report {
  return (
    isObject(v) &&
    isString(v.id) &&
    STAMP_ID.test(v.id) &&
    isString(v.title) &&
    isString(v.body) &&
    isBoolean(v.isTemplate) &&
    isStringMap(v.terms) &&
    isMapOf(isIssueNote)(v.issueNotes) &&
    isString(v.createdAt) &&
    isString(v.createdBy) &&
    isString(v.updatedAt) &&
    isString(v.updatedBy)
  );
}

export type RelationType = "relates" | "duplicates" | "precedes";
export const RELATION_TYPES: RelationType[] = ["relates", "duplicates", "precedes"];

/** One side of a link between issues; the store writes only this side and derives the inverse on read. */
export interface Relation { type: RelationType; key: string }

function isRelation(v: unknown): v is Relation {
  return isObject(v) && RELATION_TYPES.includes(v.type as RelationType) && isString(v.key) && ISSUE_KEY.test(v.key);
}

/** Accepts a record without `relations` (written before the field existed); the store fills [] on read. */
const isRelationsOrAbsent = isAbsentOr(isArrayOf(isRelation));
