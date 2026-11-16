import type { WikiPage } from "../../shared/types";

interface PageTreeRow { page: WikiPage; depth: number }

const byTitle = (a: WikiPage, b: WikiPage): number => a.title.localeCompare(b.title, "ja");

/** Titles compare trimmed and case-folded, so `[[運用手順]]` finds "運用手順 " and "Home" finds "home". */
export const normalizeTitle = (t: string): string => t.trim().toLocaleLowerCase();

/** True when another page of the wiki (any parent) already has `title`; `selfId` is the page being edited, null for a new page. */
export const hasDuplicateTitle = (pages: WikiPage[], selfId: string | null, title: string): boolean =>
  pages.some((p) => p.id !== selfId && normalizeTitle(p.title) === normalizeTitle(title));

/** The key of the new-page form for one title and parent, so a link to another new page starts a fresh draft. */
export const newPageKey = (title: string, parentId: string | null): string => `new:${parentId ?? ""}:${title}`;

/** Children per parent id, each list sorted by title; a page whose parent is absent, or whose parent chain loops back to it, counts as a root. */
export function childrenMap(pages: WikiPage[]): Map<string | null, WikiPage[]> {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const isOnParentCycle = (page: WikiPage): boolean => {
    const visitedIds = new Set<string>();
    for (let ancestorId = page.parentId; ancestorId !== null && !visitedIds.has(ancestorId); ancestorId = byId.get(ancestorId)?.parentId ?? null) {
      if (ancestorId === page.id) return true;
      visitedIds.add(ancestorId);
    }
    return false;
  };
  const out = new Map<string | null, WikiPage[]>();
  for (const p of pages) {
    const key = p.parentId !== null && byId.has(p.parentId) && !isOnParentCycle(p) ? p.parentId : null;
    out.set(key, [...(out.get(key) ?? []), p]);
  }
  for (const list of out.values()) list.sort(byTitle);
  return out;
}

/** Depth-first rows of the whole tree, roots sorted by title. */
export function flattenTree(pages: WikiPage[]): PageTreeRow[] {
  const children = childrenMap(pages);
  const out: PageTreeRow[] = [];
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
  let parentId = byId.get(id)?.parentId ?? null;
  const seen = new Set<string>([id]);
  while (parentId !== null && !seen.has(parentId)) {
    const p = byId.get(parentId);
    if (!p) break;
    seen.add(parentId);
    out.unshift(p);
    parentId = p.parentId;
  }
  return out;
}

/** The page and everything under it. */
export function subtreeIdsOf(pages: WikiPage[], id: string): Set<string> {
  const children = childrenMap(pages);
  const out = new Set<string>();
  const walk = (pageId: string): void => {
    out.add(pageId);
    for (const child of children.get(pageId) ?? []) if (!out.has(child.id)) walk(child.id);
  };
  walk(id);
  return out;
}

/** Ids of the page's ancestors, so a sidebar can open the path to it. */
export const ancestorIdsOf = (pages: WikiPage[], id: string): Set<string> => new Set(ancestorsOf(pages, id).map((p) => p.id));

/** Normalized title (trimmed, case-folded) -> id; on duplicate titles the first page by id (creation order) wins. */
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
