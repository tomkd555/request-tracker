import { useEffect, useState } from "react";
import type { WikiPage } from "../../shared/types";
import type { Route } from "../app/useHashRoute";
import { toggled } from "../issues/collapsed";
import { useWiki } from "./useWiki";
import { WikiEdit } from "./WikiEdit";
import { WikiIndex } from "./WikiIndex";
import { ancestorIdsOf, childrenMap, newPageKey, searchPages } from "./wikiTree";
import { WikiView } from "./WikiView";
import "./wiki.css";
import { M } from "../messages";

/** The wiki screens share one frame: the page tree on the left, the index, a page or the editor on the right. */
export function WikiFrame({ route }: { route: Route }): React.JSX.Element {
  const { path, query } = route;
  const match = /^\/wiki\/([^/]+)(\/edit)?$/.exec(path);
  const isNew = path === "/wiki/new";
  const pageId = match && !isNew ? match[1] : null;
  const isEdit = match?.[2] !== undefined;
  let screen: React.JSX.Element;
  if (isNew) {
    const presetTitle = query.get("title") ?? "";
    const presetParent = query.get("parent");
    screen = <WikiEdit key={newPageKey(presetTitle, presetParent)} id={null} presetTitle={presetTitle} presetParent={presetParent} />;
  } else if (pageId !== null) screen = isEdit ? <WikiEdit key={pageId} id={pageId} presetTitle="" presetParent={null} /> : <WikiView key={pageId} id={pageId} />;
  else screen = <WikiIndex />;
  return (
    <div className="wiki-frame">
      <WikiSidebar currentId={pageId} />
      <div className="wiki-frame__main">{screen}</div>
    </div>
  );
}

function WikiSidebar({ currentId }: { currentId: string | null }): React.JSX.Element {
  const { pages, isLoaded } = useWiki();
  const [keyword, setKeyword] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Opening a page opens the path down to it; what the user folded or unfolded elsewhere stays.
  useEffect(() => {
    if (currentId !== null) setExpandedIds((ids) => new Set([...ids, ...ancestorIdsOf(pages, currentId)]));
  }, [currentId, pages]);

  const children = childrenMap(pages);
  const toggle = (id: string): void => setExpandedIds((ids) => toggled(ids, id));

  const renderTreeNode = (page: WikiPage, depth: number): React.JSX.Element => {
    const kids = children.get(page.id) ?? [];
    const isExpanded = expandedIds.has(page.id);
    return (
      <li key={page.id} className="wiki-tree__item">
        <div className={`wiki-tree__row${page.id === currentId ? " wiki-tree__row--current" : ""}`} style={{ paddingLeft: depth * 16 }}>
          {kids.length > 0 ? (
            <button type="button" className="wiki-tree__toggle" aria-label={isExpanded ? "折りたたむ" : "開く"} aria-expanded={isExpanded} onClick={() => toggle(page.id)}>
              {isExpanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="wiki-tree__toggle" />
          )}
          <a className="wiki-tree__link" href={`#/wiki/${page.id}`} aria-current={page.id === currentId ? "page" : undefined}>
            {page.title}
          </a>
        </div>
        {kids.length > 0 && isExpanded && <ul className="wiki-tree__list">{kids.map((kid) => renderTreeNode(kid, depth + 1))}</ul>}
      </li>
    );
  };

  const trimmedKeyword = keyword.trim();
  const hits = trimmedKeyword === "" ? [] : searchPages(pages, trimmedKeyword);

  return (
    <aside className="wiki-side" aria-label="ページ一覧">
      <div className="wiki-side__head">
        <a className="link-button" href={`#/wiki/new${currentId ? `?parent=${currentId}` : ""}`}>
          新規ページ
        </a>
        <a className="wiki-side__index" href="#/wiki">
          索引
        </a>
      </div>
      <input type="search" className="wiki-side__search" placeholder="ページを検索" aria-label="ページを検索" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
      {trimmedKeyword !== "" ? (
        <ul className="wiki-tree__list">
          {hits.map((page) => (
            <li key={page.id} className="wiki-tree__item">
              <div className={`wiki-tree__row${page.id === currentId ? " wiki-tree__row--current" : ""}`}>
                <span className="wiki-tree__toggle" />
                <a className="wiki-tree__link" href={`#/wiki/${page.id}`} aria-current={page.id === currentId ? "page" : undefined}>
                  {page.title}
                </a>
              </div>
            </li>
          ))}
          {hits.length === 0 && <li className="text--muted wiki-tree__empty">{M.noPagesMatch}</li>}
        </ul>
      ) : (
        <ul className="wiki-tree__list">
          {(children.get(null) ?? []).map((page) => renderTreeNode(page, 0))}
          {isLoaded && pages.length === 0 && <li className="text--muted wiki-tree__empty">{M.noPages}</li>}
        </ul>
      )}
    </aside>
  );
}
