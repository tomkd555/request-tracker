// Record types stored on the shared folder. This file is the schema.

export interface Project {
  fiscalYearStartMonth: number; // 1–12, default 4
  createdAt: string;
  categories: string[]; // 種別 choices, in display order; a project.json written before this field gets DEFAULT_CATEGORIES on read
}

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

/** Accepts a project.json without `categories`; `readProject` fills the default list. */
export function isProject(v: unknown): v is Project {
  return isRec(v) && Number.isInteger(v.fiscalYearStartMonth) && str(v.createdAt) && strArrayOrAbsent(v.categories);
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

export function isWikiPage(v: unknown): v is WikiPage {
  return (
    isRec(v) &&
    str(v.id) &&
    STAMP_ID.test(v.id) &&
    str(v.title) &&
    str(v.body) &&
    str(v.createdAt) &&
    str(v.createdBy) &&
    str(v.updatedAt) &&
    str(v.updatedBy)
  );
}
