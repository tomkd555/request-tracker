import type { Comment, Issue, WikiPage } from "../../shared/types";
import { ISSUE_STATUSES } from "../../shared/types";
import { today } from "../issues/dates";
import { DEFAULT_FILTER, filterIssues } from "../issues/filterIssues";
import { searchPages } from "../wiki/wikiTree";

/** One row of the search screen, grouped by where the keyword was found; `at` carries a comment's `createdAt`. */
export interface Hit { kind: "issue" | "comment" | "wiki"; id: string; title: string; snippet: string; at?: string }

const RADIUS = 40;

/** A window of `text` around the first case-folded match of `keyword`, `radius` characters either side; newlines collapse to spaces, and a cut edge gets `…`. The head of the text when the keyword is absent. */
export function snippet(text: string, keyword: string, radius = RADIUS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const idx = keyword === "" ? -1 : flat.toLocaleLowerCase().indexOf(keyword.toLocaleLowerCase());
  if (idx === -1) {
    const head = flat.slice(0, radius * 2);
    return head.length < flat.length ? `${head}…` : head;
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(flat.length, idx + keyword.length + radius);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

/** Issues, then their comments, then wiki pages holding `keyword`. Blank keyword finds nothing. */
export function searchAll(keyword: string, issues: Issue[], comments: Comment[], pages: WikiPage[]): Hit[] {
  const kw = keyword.trim();
  if (kw === "") return [];
  const kwFold = kw.toLocaleLowerCase();

  const issueHits: Hit[] = filterIssues(issues, { ...DEFAULT_FILTER, statuses: ISSUE_STATUSES, keyword: kw }, today(), "").map((i) => ({
    kind: "issue",
    id: i.key,
    title: `${i.key} ${i.summary}`,
    snippet: snippet(i.description, kw),
  }));

  const commentHits: Hit[] = comments
    .filter((c) => c.body.toLocaleLowerCase().includes(kwFold))
    .map((c) => ({ kind: "comment", id: c.issueKey, title: c.issueKey, snippet: snippet(c.body, kw), at: c.createdAt }));

  const wikiHits: Hit[] = searchPages(pages, kw).map((p) => ({ kind: "wiki", id: p.id, title: p.title, snippet: snippet(p.body, kw) }));

  return [...issueHits, ...commentHits, ...wikiHits];
}
