import { isWikiPage, type WikiPage } from "../../shared/types";
import { collection, readDir, type Collection } from "./collection";
import { fileStamp } from "./fileStamp";
import type { Layout } from "./paths";

export const wikiCollection = (l: Layout): Collection<WikiPage> =>
  collection<WikiPage>({ dir: l.wiki, guard: isWikiPage, historyDir: l.historyWiki, trashDir: l.trashWiki });

/** Pages written before `parentId` and `note` existed come back with null and "" so the renderer always sees the fields. */
export const withWikiDefaults = (p: WikiPage): WikiPage => ({ ...p, parentId: p.parentId ?? null, note: p.note ?? "" });

/** The id is the creation stamp; a collision (same millisecond on two clients) retries with the next millisecond. */
export async function createPage(l: Layout, page: WikiPage): Promise<WikiPage> {
  const c = wikiCollection(l);
  let at = new Date(page.createdAt).getTime();
  for (let attempt = 0; attempt < 50; attempt++) {
    const createdAt = new Date(at).toISOString();
    const id = fileStamp(createdAt);
    const record = { ...page, id, createdAt };
    try {
      await c.create(id, record);
      return record;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      at += 1;
    }
  }
  throw new Error("could not allocate a wiki page id");
}

/** Ids of the page and everything under it, from the list as it stands. */
export function descendantIds(pages: WikiPage[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of pages) {
      if (p.parentId !== null && out.has(p.parentId) && !out.has(p.id)) {
        out.add(p.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Refuses a parent that would make a cycle; a parent that no longer exists is kept (the tree shows the page at the root). */
export async function putPage(l: Layout, page: WikiPage, expectedUpdatedAt?: string): Promise<void> {
  if (page.parentId !== null) {
    const pages = (await readDir(l.wiki, isWikiPage)).map(withWikiDefaults); // uncached: the guard must see the share as it is
    if (descendantIds(pages, page.id).has(page.parentId)) throw new Error("cycle");
  }
  await wikiCollection(l).put(page.id, page, expectedUpdatedAt);
}

export async function removePage(l: Layout, id: string): Promise<void> {
  const pages = (await readDir(l.wiki, isWikiPage)).map(withWikiDefaults); // uncached, as in putPage
  if (pages.some((p) => p.parentId === id)) throw new Error("has-children");
  await wikiCollection(l).remove(id);
}
