// `[[タイトル]]` and `[[タイトル|表示文字]]` in Markdown become links to the wiki page of that title.

const LINK = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g;

/** Splits on backtick runs so fenced blocks and inline code spans stay untouched; odd segments are code. */
const splitCode = (src: string): string[] => src.split(/(`+[\s\S]*?`+)/);

export const MISSING_PAGE_PATH = "#/wiki/new";

/** Where a missing title leads: the new-page form with the title filled in, under `parentId` when given. */
export function missingPageHref(title: string, parentId: string | null): string {
  const q = new URLSearchParams({ title });
  if (parentId !== null) q.set("parent", parentId);
  return `${MISSING_PAGE_PATH}?${q.toString()}`;
}

/**
 * Rewrites wiki links outside code as Markdown links. `resolve` returns the page id for a title, or null when no page has it,
 * in which case the link opens the new-page form so a click creates the page.
 */
export function linkWikiPages(src: string, resolve: (title: string) => string | null, parentId: string | null = null): string {
  return splitCode(src)
    .map((seg, i) =>
      i % 2 === 1
        ? seg
        : seg.replace(LINK, (_m, title: string, label?: string) => {
            const text = (label ?? title).trim();
            const id = resolve(title.trim());
            const href = id !== null ? `#/wiki/${id}` : missingPageHref(title.trim(), parentId);
            return `[${text}](${href})`;
          }),
    )
    .join("");
}

/** Distinct titles linked outside code, in order of first appearance. */
export function linkedTitles(src: string): string[] {
  const out: string[] = [];
  for (const [i, seg] of splitCode(src).entries()) {
    if (i % 2 === 1) continue;
    for (const m of seg.matchAll(LINK)) {
      const t = m[1].trim();
      if (!out.includes(t)) out.push(t);
    }
  }
  return out;
}
