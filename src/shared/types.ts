// Record types stored on the shared folder, and the per-machine config. This file is the schema.

export type ThemeName = "green" | "blue" | "gray" | "dark";
export const THEME_NAMES: ThemeName[] = ["green", "blue", "gray", "dark"];

/** Per-machine preferences in %APPDATA%\request-tracker\config.json; a file written before a field existed gets the default on read. */
export interface LocalSettings {
  theme: ThemeName;
  accent: string | null; // "#rrggbb"; null = the preset's own accent
  dueSoonDays: number; // 0–30
  pollIntervalMs: number; // 2000–60000
}
export interface LocalConfig extends LocalSettings { rootDir: string }

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = { theme: "green", accent: null, dueSoonDays: 3, pollIntervalMs: 5000 };
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export interface Project {
  fiscalYearStartMonth: number; // 1–12, default 4
  createdAt: string;
  categories: string[]; // 種別 choices, in display order; a project.json written before this field gets DEFAULT_CATEGORIES on read
  categoryColors: Record<string, string>; // 種別 name -> "#rrggbb"; {} on files written before this field
  categoryTemplates: Record<string, CategoryTemplate>; // 種別 name -> text preset on the new-issue form; {} on files written before this field
}

/** Text the new-issue form loads when its 種別 is chosen. */
export interface CategoryTemplate { summary: string; body: string }

export const DEFAULT_CATEGORIES: string[] = ["問い合わせ", "不具合", "依頼", "その他"];

export interface User { username: string; displayName: string; createdAt: string }

export type IssueStatus = "open" | "in_progress" | "resolved" | "closed";
export type IssuePriority = "high" | "normal" | "low";

export interface Issue {
  key: string; // "26-0012": fiscal year (two digits) - sequence within that year (four digits)
  summary: string;
  description: string; // Markdown
  category: string; // one of Project.categories; "" on records written before this field
  status: IssueStatus;
  priority: IssuePriority;
  assignee: string | null; // username
  reporter: string; // username
  parentKey: string | null; // one level: a child has no children
  startDate: string | null; // YYYY-MM-DD
  dueDate: string | null; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
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

export const ISSUE_STATUSES: IssueStatus[] = ["open", "in_progress", "resolved", "closed"];
export const ISSUE_PRIORITIES: IssuePriority[] = ["high", "normal", "low"];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const str = (v: unknown): v is string => typeof v === "string";
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
const strOrAbsent = (v: unknown): v is string | undefined => v === undefined || typeof v === "string";
const strArrayOrAbsent = (v: unknown): v is string[] | undefined => v === undefined || (Array.isArray(v) && v.every(str));
const strMapOrAbsent = (v: unknown): v is Record<string, string> | undefined => v === undefined || (isRec(v) && Object.values(v).every(str));
const isTemplate = (v: unknown): v is CategoryTemplate => isRec(v) && str(v.summary) && str(v.body);
const templateMapOrAbsent = (v: unknown): v is Record<string, CategoryTemplate> | undefined =>
  v === undefined || (isRec(v) && Object.values(v).every(isTemplate));

/** Accepts a project.json without `categories`, `categoryColors` or `categoryTemplates`; `readProject` fills the defaults. */
export function isProject(v: unknown): v is Project {
  return (
    isRec(v) &&
    Number.isInteger(v.fiscalYearStartMonth) &&
    str(v.createdAt) &&
    strArrayOrAbsent(v.categories) &&
    strMapOrAbsent(v.categoryColors) &&
    templateMapOrAbsent(v.categoryTemplates)
  );
}

const intIn = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Throws on a value outside the documented ranges; the settings screen shows the message. */
export function assertLocalSettings(s: LocalSettings): void {
  if (!THEME_NAMES.includes(s.theme)) throw new Error(`unknown theme: ${String(s.theme)}`);
  if (s.accent !== null && !(str(s.accent) && HEX_COLOR.test(s.accent))) throw new Error(`accent must be #rrggbb: ${String(s.accent)}`);
  if (!intIn(s.dueSoonDays, 0, 30)) throw new Error(`dueSoonDays out of range: ${String(s.dueSoonDays)}`);
  if (!intIn(s.pollIntervalMs, 2000, 60000)) throw new Error(`pollIntervalMs out of range: ${String(s.pollIntervalMs)}`);
}

/** Each optional field of config.json is taken when valid and otherwise falls back to its default, so an old or hand-edited file still loads. */
export function localSettingsFrom(v: Record<string, unknown>): LocalSettings {
  const d = DEFAULT_LOCAL_SETTINGS;
  return {
    theme: THEME_NAMES.includes(v.theme as ThemeName) ? (v.theme as ThemeName) : d.theme,
    accent: str(v.accent) && HEX_COLOR.test(v.accent) ? v.accent : d.accent,
    dueSoonDays: intIn(v.dueSoonDays, 0, 30) ? v.dueSoonDays : d.dueSoonDays,
    pollIntervalMs: intIn(v.pollIntervalMs, 2000, 60000) ? v.pollIntervalMs : d.pollIntervalMs,
  };
}

export function isUser(v: unknown): v is User {
  return isRec(v) && str(v.username) && str(v.displayName) && str(v.createdAt);
}

export const ISSUE_KEY = /^\d{2}-\d{4,}$/;
export const STAMP_ID = /^\d{8}T\d{9}Z$/;

/** Accepts a record without `category` (written before the field existed); the store fills "" on read. */
export function isIssue(v: unknown): v is Issue {
  return (
    isRec(v) &&
    str(v.key) &&
    ISSUE_KEY.test(v.key) &&
    str(v.summary) &&
    str(v.description) &&
    strOrAbsent(v.category) &&
    ISSUE_STATUSES.includes(v.status as IssueStatus) &&
    ISSUE_PRIORITIES.includes(v.priority as IssuePriority) &&
    strOrNull(v.assignee) &&
    str(v.reporter) &&
    strOrNull(v.parentKey) &&
    strOrNull(v.startDate) &&
    strOrNull(v.dueDate) &&
    str(v.createdAt) &&
    str(v.updatedAt) &&
    str(v.updatedBy)
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
