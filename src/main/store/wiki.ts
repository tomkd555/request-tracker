import { CYCLE } from "../../shared/issueTree";
import { isWikiPage, type WikiPage } from "../../shared/types";
import { collection, createWithStampId, readRecords, type Collection } from "./collection";
import { HAS_CHILDREN } from "./issues";
import type { Layout } from "./paths";

export const wikiCollection = (layout: Layout): Collection<WikiPage> =>
  collection<WikiPage>({ dir: layout.wiki, guard: isWikiPage, historyDir: layout.historyWiki, trashDir: layout.trashWiki, idOf: (page) => page.id });

/** Pages written before `parentId` and `note` existed come back with null and "" so the renderer always sees the fields. */
export const withWikiDefaults = (page: WikiPage): WikiPage => ({ ...page, parentId: page.parentId ?? null, note: page.note ?? "" });

/** The pages as the share holds them now, past the listing cache: a check that guards a write must see the latest files. */
const readPagesUncached = async (layout: Layout): Promise<WikiPage[]> => (await readRecords(layout.wiki, isWikiPage, (page) => page.id)).map(withWikiDefaults);

/** The id is the creation stamp; a collision (same millisecond on two clients) retries with the next millisecond. */
export async function createPage(layout: Layout, page: WikiPage): Promise<WikiPage> {
  return createWithStampId(wikiCollection(layout), new Date(page.createdAt).getTime(), (id, createdAt) => ({ ...page, id, createdAt }), "wiki page");
}

/** Ids of the page and everything under it, from the list as it stands. */
function descendantIds(pages: WikiPage[], id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const page of pages) {
      if (page.parentId !== null && ids.has(page.parentId) && !ids.has(page.id)) {
        ids.add(page.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Refuses a parent that would make a cycle; a parent that no longer exists is kept (the tree shows the page at the root). */
export async function putPage(layout: Layout, page: WikiPage, expectedUpdatedAt?: string): Promise<void> {
  if (page.parentId !== null) {
    const pages = await readPagesUncached(layout);
    if (descendantIds(pages, page.id).has(page.parentId)) throw new Error(CYCLE);
  }
  await wikiCollection(layout).put(page.id, page, expectedUpdatedAt);
}

export async function removePage(layout: Layout, id: string): Promise<void> {
  const hasChildren = (await readPagesUncached(layout)).some((page) => page.parentId === id);
  if (hasChildren) throw new Error(HAS_CHILDREN);
  await wikiCollection(layout).remove(id);
}
