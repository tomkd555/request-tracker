import { useState } from "react";
import type { Comment } from "../../shared/types";
import { useIssues } from "../issues/useIssues";
import { useWiki } from "../wiki/useWiki";
import { searchAll, type Hit } from "./searchAll";
import "./search.css";

const SECTIONS: { kind: Hit["kind"]; label: string }[] = [
  { kind: "issue", label: "課題" },
  { kind: "comment", label: "コメント" },
  { kind: "wiki", label: "Wiki" },
];

const hrefFor = (h: Hit): string => (h.kind === "wiki" ? `#/wiki/${h.id}` : `#/issues/${h.id}`);

/** Submit-driven: a keyword search reads issues and wiki pages already held by the shell, and pulls every comment fresh from the share. */
export function Search(): React.JSX.Element {
  const { issues } = useIssues();
  const { pages } = useWiki();
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const kw = keyword.trim();
    setQuery(kw);
    if (kw === "") {
      setHits([]);
      return;
    }
    // ponytail: one full pass over comments/ per search; cache it in the renderer and drop it on 更新 if a search starts to feel slow
    try {
      const comments: Comment[] = await window.api.comments.listAll();
      setHits(searchAll(kw, issues, comments, pages));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">検索</h1>
      </header>
      <form className="search-form" onSubmit={(e) => void run(e)}>
        <input
          type="search"
          className="search-form__input"
          aria-label="検索キーワード"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button type="submit">検索</button>
      </form>
      {error && <p className="text--error">{error}</p>}
      {query === "" && <p className="text--muted">キーワードを入力してください</p>}
      {query !== null && query !== "" && hits.length === 0 && <p className="text--muted">該当はありません</p>}
      {SECTIONS.map(({ kind, label }) => {
        const rows = hits.filter((h) => h.kind === kind);
        if (rows.length === 0) return null;
        return (
          <section key={kind} className="search-section">
            <h2 className="search-section__heading">
              {label}（{rows.length}）
            </h2>
            <ul className="search-section__list">
              {rows.map((h, i) => (
                <li key={`${h.kind}-${h.id}-${i}`} className="search-section__row">
                  <a className="search-section__link" href={hrefFor(h)}>
                    {h.title}
                  </a>
                  <p className="search-section__snippet text--muted">{h.snippet}</p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
