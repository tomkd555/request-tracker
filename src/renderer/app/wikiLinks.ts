// `[[タイトル]]` and `[[タイトル|表示文字]]` in Markdown become links to the wiki page of that title.

import { mapOutsideCode, splitCode } from "./markdownCode";

const WIKI_LINK = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g;

/** Backslash-escapes what would turn link text into other Markdown. */
const escapeLinkText = (t: string): string => t.replace(/[\\`*_[\]]/g, "\\$&");


export const MISSING_PAGE_PATH = "#/wiki/new";

/** Where a missing title leads: the new-page form with the title filled in, under `parentId` when given. */
function missingPageHref(title: string, parentId: string | null): string {
  const q = new URLSearchParams({ title });
  if (parentId !== null) q.set("parent", parentId);
  return `${MISSING_PAGE_PATH}?${q.toString()}`;
}

/**
 * Rewrites wiki links outside code as Markdown links. `resolve` returns the page id for a title, or null when no page has it,
 * in which case the link opens the new-page form so a click creates the page.
 */
export function linkWikiPages(src: string, resolve: (title: string) => string | null, parentId: string | null = null): string {
  return mapOutsideCode(src, (text) =>
    text.replace(WIKI_LINK, (_m, title: string, label?: string) => {
      const target = title.trim();
      const id = resolve(target);
      const href = id !== null ? `#/wiki/${id}` : missingPageHref(target, parentId);
      return `[${escapeLinkText((label ?? title).trim())}](${href})`;
    }),
  );
}

/** Distinct titles linked outside code, in order of first appearance. */
export function linkedTitles(src: string): string[] {
  const out: string[] = [];
  for (const [i, seg] of splitCode(src).entries()) {
    if (i % 2 === 1) continue;
    for (const m of seg.matchAll(WIKI_LINK)) {
      const t = m[1].trim();
      if (!out.includes(t)) out.push(t);
    }
  }
  return out;
}
