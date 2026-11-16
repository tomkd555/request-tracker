import type { Comment, Issue, StatusDef, WikiPage } from "../../shared/types";
import { todayYmd } from "../issues/dates";
import { EMPTY_FILTER, filterIssues } from "../issues/filterIssues";
import { errorMessage } from "../messages";
import { searchPages } from "../wiki/wikiTree";

/** One row of the search screen, grouped by where the keyword was found; `at` carries a comment's `createdAt`. */
export interface Hit { kind: "issue" | "comment" | "wiki"; id: string; title: string; snippet: string; at?: string }

const SNIPPET_RADIUS_CHARS = 40;

/** A window of `text` around the first case-folded match of `keyword`, `radius` characters either side; newlines collapse to spaces, and a cut edge gets `…`. The head of the text when the keyword is absent. */
export function snippet(text: string, keyword: string, radius = SNIPPET_RADIUS_CHARS): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  const matchAt = keyword === "" ? -1 : oneLine.toLocaleLowerCase().indexOf(keyword.toLocaleLowerCase());
  if (matchAt === -1) {
    const head = oneLine.slice(0, radius * 2);
    return head.length < oneLine.length ? `${head}…` : head;
  }
  const start = Math.max(0, matchAt - radius);
  const end = Math.min(oneLine.length, matchAt + keyword.length + radius);
  return `${start > 0 ? "…" : ""}${oneLine.slice(start, end)}${end < oneLine.length ? "…" : ""}`;
}

/** Issues of every stage, then their comments, then wiki pages holding `keyword`. Blank keyword finds nothing. */
export function searchAll(keyword: string, issues: Issue[], comments: Comment[], pages: WikiPage[], statuses: StatusDef[]): Hit[] {
  const kw = keyword.trim();
  if (kw === "") return [];
  const foldedKeyword = kw.toLocaleLowerCase();

  const issueHits: Hit[] = filterIssues(issues, { ...EMPTY_FILTER, statuses: statuses.map((s) => s.id), keyword: kw }, todayYmd(), "", statuses).map((i) => ({
    kind: "issue",
    id: i.key,
    title: `${i.key} ${i.summary}`,
    snippet: snippet(i.description, kw),
  }));

  const commentHits: Hit[] = comments
    .filter((c) => c.body.toLocaleLowerCase().includes(foldedKeyword))
    .map((c) => ({ kind: "comment", id: c.issueKey, title: c.issueKey, snippet: snippet(c.body, kw), at: c.createdAt }));

  const wikiHits: Hit[] = searchPages(pages, kw).map((p) => ({ kind: "wiki", id: p.id, title: p.title, snippet: snippet(p.body, kw) }));

  return [...issueHits, ...commentHits, ...wikiHits];
}

/** The hits for `keyword` after reading the comments; a failed read gives no hits and the message to show. */
export async function searchOutcome(
  keyword: string,
  issues: Issue[],
  loadComments: () => Promise<Comment[]>,
  pages: WikiPage[],
  statuses: StatusDef[],
): Promise<{ hits: Hit[]; error: string | null }> {
  try {
    const keys = new Set(issues.map((i) => i.key));
    const comments = (await loadComments()).filter((c) => keys.has(c.issueKey)); // a comment of a deleted issue has no screen to open
    return { hits: searchAll(keyword, issues, comments, pages, statuses), error: null };
  } catch (e) {
    return { hits: [], error: errorMessage(e) };
  }
}
