import { isWikiPage, type WikiPage } from "../../shared/types";
import { collection, type Collection } from "./collection";
import { fileStamp } from "./fileStamp";
import type { Layout } from "./paths";

export const wikiCollection = (l: Layout): Collection<WikiPage> =>
  collection<WikiPage>({ dir: l.wiki, guard: isWikiPage, historyDir: l.historyWiki, trashDir: l.trashWiki });

/** The id is the creation stamp; a collision (same millisecond on two clients) retries with the next millisecond. */
export async function createPage(l: Layout, page: WikiPage): Promise<void> {
  const c = wikiCollection(l);
  let at = new Date(page.createdAt).getTime();
  for (let attempt = 0; attempt < 50; attempt++) {
    const createdAt = new Date(at).toISOString();
    const id = fileStamp(createdAt);
    try {
      await c.create(id, { ...page, id, createdAt });
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      at += 1;
    }
  }
  throw new Error("could not allocate a wiki page id");
}
