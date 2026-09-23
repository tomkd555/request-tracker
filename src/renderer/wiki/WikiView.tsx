import { useEffect, useRef, useState } from "react";
import type { WikiPage } from "../../shared/types";
import { Markdown } from "../app/Markdown";
import { displayNameOf, useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { Attachments } from "../issues/Attachments";
import { formatDateTime } from "../issues/labels";
import { useWiki } from "./useWiki";
import { WikiHistory } from "./WikiHistory";
import { ancestorsOf, childrenMap } from "./wikiTree";
import { errorMessage, M } from "../messages";

interface Heading { level: number; text: string; id: string }

export function WikiView({ id }: { id: string }): React.JSX.Element {
  const { me, users } = useSession();
  const { pages, byId, loaded, refreshOne } = useWiki();
  const [error, setError] = useState<string | null>(null);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const body = useRef<HTMLDivElement>(null);
  const page = byId.get(id);
  const source = page?.body ?? "";
  // The table of contents reads the headings as rendered, so its ids match whatever inline markup the heading holds.
  useEffect(() => {
    const els = body.current?.querySelectorAll<HTMLElement>("h2, h3, h4, h5, h6") ?? [];
    setHeadings([...els].map((el) => ({ level: Number(el.tagName.slice(1)), text: el.textContent ?? "", id: el.id })));
  }, [source]);
  if (!loaded) return <div className="text--loading">読み込み中</div>;
  if (!page) return <p>ページが見つかりません。</p>;
  const ancestors = ancestorsOf(pages, id);
  const children = childrenMap(pages).get(id) ?? [];
  const minLevel = Math.min(...headings.map((h) => h.level));

  const restore = async (old: WikiPage): Promise<void> => {
    setError(null);
    try {
      await window.api.wiki.put({ ...page, title: old.title, body: old.body, note: `${formatDateTime(old.updatedAt)} の版に戻す`, updatedAt: new Date().toISOString(), updatedBy: me.username }, page.updatedAt);
      await refreshOne(page.id);
    } catch (e) {
      setError(errorMessage(e, "wiki"));
    }
  };

  const remove = async (): Promise<void> => {
    if (children.length > 0) {
      setError(M.pageHasChildren);
      return;
    }
    if (!window.confirm(M.confirmDelete(page.title))) return;
    try {
      await window.api.wiki.remove(page.id);
      await refreshOne(page.id);
      navigate("/wiki");
    } catch (e) {
      setError(errorMessage(e, "wiki"));
    }
  };

  return (
    <article className="wiki-page">
      <nav className="breadcrumb" aria-label="階層">
        <a href="#/wiki">Wiki</a>
        {ancestors.map((a) => (
          <span key={a.id} className="breadcrumb__crumb">
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <a href={`#/wiki/${a.id}`}>{a.title}</a>
          </span>
        ))}
      </nav>
      <div className="section-head">
        <h1 className="wiki-page__title">{page.title}</h1>
        <div className="form-actions">
          <a className="link-button" href={`#/wiki/${page.id}/edit`}>
            編集
          </a>
          <a className="button--quiet" href={`#/wiki/new?parent=${page.id}`}>
            子ページを追加
          </a>
          <button type="button" onClick={() => void remove()}>
            削除
          </button>
        </div>
      </div>
      <p className="text--muted wiki-page__meta">
        更新 {formatDateTime(page.updatedAt)} {displayNameOf(users, page.updatedBy)}
        {page.note !== "" && <span className="wiki-page__note">{page.note}</span>}
      </p>
      {error && <p className="text--error">{error}</p>}
      {headings.length >= 3 && (
        <nav className="wiki-toc" aria-label="目次">
          <div className="wiki-toc__title">目次</div>
          <ul className="wiki-toc__list">
            {headings.map((h, i) => (
              <li key={i} className="wiki-toc__item" style={{ paddingLeft: (h.level - minLevel) * 12 }}>
                <a href={`#/wiki/${page.id}`} onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(h.id)?.scrollIntoView({ block: "start" });
                }}>
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div ref={body}>
        <Markdown source={page.body} demote={1} wikiParentId={page.id} />
      </div>
      <Attachments owner={{ kind: "wiki", id: page.id }} />
      {children.length > 0 && (
        <section>
          <h2>子ページ</h2>
          <ul className="related">
            {children.map((c) => (
              <li key={c.id} className="related__item">
                <a href={`#/wiki/${c.id}`}>{c.title}</a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h2>履歴</h2>
        <WikiHistory page={page} onRestore={(old) => void restore(old)} />
      </section>
    </article>
  );
}
