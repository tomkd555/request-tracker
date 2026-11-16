import { useRef, useState } from "react";
import { useSession } from "../app/SessionContext";
import { useIssues } from "../issues/useIssues";
import { useWiki } from "../wiki/useWiki";
import { searchOutcome, type Hit } from "./searchAll";
import "./search.css";
import { M } from "../messages";

const SECTIONS: { kind: Hit["kind"]; label: string }[] = [
  { kind: "issue", label: "課題" },
  { kind: "comment", label: "コメント" },
  { kind: "wiki", label: "Wiki" },
];

const hrefFor = (h: Hit): string => (h.kind === "wiki" ? `#/wiki/${h.id}` : `#/issues/${h.id}`);

/** Submit-driven: a keyword search reads issues and wiki pages already held by the shell, and pulls every comment fresh from the share. */
export function Search(): React.JSX.Element {
  const { project } = useSession();
  const { issues } = useIssues();
  const { pages } = useWiki();
  const [keyword, setKeyword] = useState("");
  const [searchedKeyword, setSearchedKeyword] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Counts the submits, so a slow comment read that ends after a later submit leaves that submit's result alone.
  const latestSearch = useRef(0);

  const submitSearch = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const searchId = ++latestSearch.current;
    const trimmedKeyword = keyword.trim();
    setSearchedKeyword(trimmedKeyword);
    if (trimmedKeyword === "") {
      setHits([]);
      setError(null);
      return;
    }
    // ponytail: one full pass over comments/ per search; cache it in the renderer and drop it on 更新 if a search starts to feel slow
    const outcome = await searchOutcome(trimmedKeyword, issues, () => window.api.comments.listAll(), pages, project.statuses);
    if (searchId !== latestSearch.current) return;
    setHits(outcome.hits);
    setError(outcome.error);
  };

  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">検索</h1>
      </header>
      <form className="search-form" onSubmit={(e) => void submitSearch(e)}>
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
      {searchedKeyword === "" && <p className="text--muted">{M.keywordPrompt}</p>}
      {searchedKeyword !== null && searchedKeyword !== "" && error === null && hits.length === 0 && <p className="text--muted">{M.noHits}</p>}
      {SECTIONS.map(({ kind, label }) => {
        const sectionHits = hits.filter((h) => h.kind === kind);
        if (sectionHits.length === 0) return null;
        return (
          <section key={kind} className="search-section">
            <h2 className="search-section__heading">
              {label}（{sectionHits.length}）
            </h2>
            <ul className="search-section__list">
              {sectionHits.map((h, i) => (
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
