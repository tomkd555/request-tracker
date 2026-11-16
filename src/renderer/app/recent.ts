import type { Comment, Issue, WikiPage } from "../../shared/types";
import { compareKeys, compareText } from "../issues/compareKeys";

export const RECENT_LIMIT = 100;

export type RecentKind = "created" | "updated" | "comment" | "wiki";

export interface RecentEntry {
  kind: RecentKind;
  at: string;
  /** Username of the member who did it. */
  by: string;
  /** The issue key, the comment id or the wiki page id. */
  id: string;
  /** Issue key of an issue entry or a comment. */
  key?: string;
  /** 件名 of that issue, when it is listed. */
  summary?: string;
  /** Wiki page title. */
  title?: string;
}

const time = (iso: string): number => Date.parse(iso) || 0;

/** Issues sort before comments, comments before wiki pages. */
const GROUP: Record<RecentKind, number> = { created: 0, updated: 0, comment: 1, wiki: 2 };

const compareIds = (a: RecentEntry, b: RecentEntry): number => (GROUP[a.kind] === 0 ? compareKeys(a.id, b.id) : compareText(a.id, b.id));

/** Issue creations and saves, comments and wiki page saves, newest first and at most RECENT_LIMIT. */
export function recentUpdates(issues: Issue[], comments: Comment[], pages: WikiPage[]): RecentEntry[] {
  const summaryOf = new Map(issues.map((i) => [i.key, i.summary]));
  const entries: RecentEntry[] = [];
  for (const i of issues) {
    entries.push({ kind: "created", at: i.createdAt, by: i.reporter, id: i.key, key: i.key, summary: i.summary });
    if (time(i.updatedAt) > time(i.createdAt)) entries.push({ kind: "updated", at: i.updatedAt, by: i.updatedBy, id: i.key, key: i.key, summary: i.summary });
  }
  for (const c of comments) entries.push({ kind: "comment", at: c.createdAt, by: c.author, id: c.id, key: c.issueKey, summary: summaryOf.get(c.issueKey) });
  for (const p of pages) entries.push({ kind: "wiki", at: p.updatedAt, by: p.updatedBy, id: p.id, title: p.title });
  return entries
    .sort((a, b) => time(b.at) - time(a.at) || GROUP[a.kind] - GROUP[b.kind] || compareIds(a, b))
    .slice(0, RECENT_LIMIT);
}
