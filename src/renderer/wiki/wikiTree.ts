import type { WikiPage } from "../../shared/types";

export interface TreeRow { page: WikiPage; depth: number }

const byTitle = (a: WikiPage, b: WikiPage): number => a.title.localeCompare(b.title, "ja");

/** Titles compare trimmed and case-folded, so `[[運用手順]]` finds "運用手順 " and "Home" finds "home". */
export const normalizeTitle = (t: string): string => t.trim().toLocaleLowerCase();

/** Children per parent id, each list sorted by title; a page whose parent is absent counts as a root. */
export function childrenMap(pages: WikiPage[]): Map<string | null, WikiPage[]> {
  const ids = new Set(pages.map((p) => p.id));
  const out = new Map<string | null, WikiPage[]>();
  for (const p of pages) {
    const key = p.parentId !== null && ids.has(p.parentId) ? p.parentId : null;
    out.set(key, [...(out.get(key) ?? []), p]);
  }
  for (const list of out.values()) list.sort(byTitle);
  return out;
}

/** Depth-first rows of the whole tree, roots sorted by title. */
export function flattenTree(pages: WikiPage[]): TreeRow[] {
  const children = childrenMap(pages);
  const out: TreeRow[] = [];
  const walk = (parent: string | null, depth: number): void => {
    for (const p of children.get(parent) ?? []) {
      out.push({ page: p, depth });
      walk(p.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Root first, down to the page's parent; empty for a root page. Stops at a missing parent or a cycle. */
export function ancestorsOf(pages: WikiPage[], id: string): WikiPage[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const out: WikiPage[] = [];
  let cur = byId.get(id)?.parentId ?? null;
  const seen = new Set<string>([id]);
  while (cur !== null && !seen.has(cur)) {
    const p = byId.get(cur);
    if (!p) break;
    seen.add(cur);
    out.unshift(p);
    cur = p.parentId;
  }
  return out;
}

/** The page and everything under it. */
export function descendantIdsOf(pages: WikiPage[], id: string): Set<string> {
  const children = childrenMap(pages);
  const out = new Set<string>();
  const walk = (cur: string): void => {
    out.add(cur);
    for (const c of children.get(cur) ?? []) if (!out.has(c.id)) walk(c.id);
  };
  walk(id);
  return out;
}

/** Ids of the page's ancestors, so a sidebar can open the path to it. */
export const pathIds = (pages: WikiPage[], id: string): Set<string> => new Set(ancestorsOf(pages, id).map((p) => p.id));

/** Lowercased title -> id; on duplicate titles the first page by id (creation order) wins. */
export function titleIndex(pages: WikiPage[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of [...pages].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const key = normalizeTitle(p.title);
    if (!out.has(key)) out.set(key, p.id);
  }
  return out;
}

/** Pages whose title or body holds the keyword, case-folded; every page when the keyword is blank. */
export function searchPages(pages: WikiPage[], keyword: string): WikiPage[] {
  const kw = normalizeTitle(keyword);
  if (kw === "") return [...pages].sort(byTitle);
  return pages.filter((p) => normalizeTitle(p.title).includes(kw) || p.body.toLocaleLowerCase().includes(kw)).sort(byTitle);
}
