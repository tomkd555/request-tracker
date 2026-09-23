import { useEffect, useState } from "react";
import type { WikiPage } from "../../shared/types";
import type { Route } from "../app/useHashRoute";
import { useWiki } from "./useWiki";
import { WikiEdit } from "./WikiEdit";
import { WikiIndex } from "./WikiIndex";
import { childrenMap, pathIds, searchPages } from "./wikiTree";
import { WikiView } from "./WikiView";
import "./wiki.css";
import { M } from "../messages";

/** The wiki screens share one frame: the page tree on the left, the index, a page or the editor on the right. */
export function WikiScreen({ route }: { route: Route }): React.JSX.Element {
  const { path, query } = route;
  const m = /^\/wiki\/([^/]+)(\/edit)?$/.exec(path);
  const isNew = path === "/wiki/new";
  const currentId = m && !isNew ? m[1] : null;
  let screen: React.JSX.Element;
  if (isNew) screen = <WikiEdit key="new" id={null} presetTitle={query.get("title") ?? ""} presetParent={query.get("parent")} />;
  else if (m) screen = m[2] ? <WikiEdit key={m[1]} id={m[1]} presetTitle="" presetParent={null} /> : <WikiView key={m[1]} id={m[1]} />;
  else screen = <WikiIndex />;
  return (
    <div className="wiki-frame">
      <Sidebar currentId={currentId} />
      <div className="wiki-frame__main">{screen}</div>
    </div>
  );
}

function Sidebar({ currentId }: { currentId: string | null }): React.JSX.Element {
  const { pages, loaded } = useWiki();
  const [keyword, setKeyword] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Opening a page opens the path down to it; what the user folded or unfolded elsewhere stays.
  useEffect(() => {
    if (currentId !== null) setOpen((o) => new Set([...o, ...pathIds(pages, currentId)]));
  }, [currentId, pages]);

  const children = childrenMap(pages);
  const toggle = (id: string): void =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const node = (p: WikiPage, depth: number): React.JSX.Element => {
    const kids = children.get(p.id) ?? [];
    const isOpen = open.has(p.id);
    return (
      <li key={p.id} className="wiki-tree__item">
        <div className={`wiki-tree__row${p.id === currentId ? " wiki-tree__row--current" : ""}`} style={{ paddingLeft: depth * 16 }}>
          {kids.length > 0 ? (
            <button type="button" className="wiki-tree__toggle" aria-label={isOpen ? "折りたたむ" : "開く"} aria-expanded={isOpen} onClick={() => toggle(p.id)}>
              {isOpen ? "▾" : "▸"}
            </button>
          ) : (
            <span className="wiki-tree__toggle" />
          )}
          <a className="wiki-tree__link" href={`#/wiki/${p.id}`} aria-current={p.id === currentId ? "page" : undefined}>
            {p.title}
          </a>
        </div>
        {kids.length > 0 && isOpen && <ul className="wiki-tree__list">{kids.map((k) => node(k, depth + 1))}</ul>}
      </li>
    );
  };

  const kw = keyword.trim();
  const hits = kw === "" ? [] : searchPages(pages, kw);

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
      {kw !== "" ? (
        <ul className="wiki-tree__list">
          {hits.map((p) => (
            <li key={p.id} className="wiki-tree__item">
              <div className={`wiki-tree__row${p.id === currentId ? " wiki-tree__row--current" : ""}`}>
                <span className="wiki-tree__toggle" />
                <a className="wiki-tree__link" href={`#/wiki/${p.id}`}>
                  {p.title}
                </a>
              </div>
            </li>
          ))}
          {hits.length === 0 && <li className="text--muted wiki-tree__empty">{M.noPagesMatch}</li>}
        </ul>
      ) : (
        <ul className="wiki-tree__list">
          {(children.get(null) ?? []).map((p) => node(p, 0))}
          {loaded && pages.length === 0 && <li className="text--muted wiki-tree__empty">{M.noPages}</li>}
        </ul>
      )}
    </aside>
  );
}
