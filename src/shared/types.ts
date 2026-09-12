// Record types stored on the shared folder. This file is the schema.

export type Project = { fiscalYearStartMonth: number; createdAt: string }; // 1–12, default 4

export type User = { username: string; displayName: string; createdAt: string };

export type IssueStatus = "open" | "in_progress" | "resolved" | "closed";
export type IssuePriority = "high" | "normal" | "low";

export type Issue = {
  key: string; // "26-0012": fiscal year (two digits) - sequence within that year (four digits)
  summary: string;
  description: string; // Markdown
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
};

export type Comment = {
  id: string; // `${createdAt file stamp}-${author}`
  issueKey: string;
  author: string;
  body: string; // Markdown
  createdAt: string;
};

export type WikiPage = {
  id: string; // file stamp at creation
  title: string;
  body: string; // Markdown
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

// Derived from stat, never stored; size is null for a folder.
export type Attachment = { name: string; kind: "file" | "folder"; size: number | null; addedAt: string };

export const ISSUE_STATUSES: IssueStatus[] = ["open", "in_progress", "resolved", "closed"];
export const ISSUE_PRIORITIES: IssuePriority[] = ["high", "normal", "low"];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const str = (v: unknown): v is string => typeof v === "string";
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";

export function isProject(v: unknown): v is Project {
  return isRec(v) && Number.isInteger(v.fiscalYearStartMonth) && str(v.createdAt);
}

export function isUser(v: unknown): v is User {
  return isRec(v) && str(v.username) && str(v.displayName) && str(v.createdAt);
}

export function isIssue(v: unknown): v is Issue {
  return (
    isRec(v) &&
    str(v.key) &&
    str(v.summary) &&
    str(v.description) &&
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
    str(v.title) &&
    str(v.body) &&
    str(v.createdAt) &&
    str(v.createdBy) &&
    str(v.updatedAt) &&
    str(v.updatedBy)
  );
}
