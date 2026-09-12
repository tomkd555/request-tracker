import { useState } from "react";
import { displayNameOf, useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { formatDateTime } from "../issues/labels";
import { useWiki } from "./useWiki";

export function WikiList(): React.JSX.Element {
  const { users } = useSession();
  const { pages, loaded } = useWiki();
  const [keyword, setKeyword] = useState("");
  const kw = keyword.trim().toLowerCase();
  const rows = pages.filter((p) => kw === "" || p.title.toLowerCase().includes(kw)).sort((a, b) => a.title.localeCompare(b.title, "ja"));

  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">Wiki</h1>
        <a className="link-button" href="#/wiki/new">
          新規ページ
        </a>
      </header>
      <div className="filter-bar">
        <input
          type="search"
          className="filter-bar__search"
          placeholder="タイトル"
          aria-label="タイトル"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>
      <table className="issue-table">
        <thead>
          <tr>
            <th className="issue-table__header">タイトル</th>
            <th className="issue-table__header">更新日</th>
            <th className="issue-table__header">更新者</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="issue-table__row" onClick={() => navigate(`/wiki/${p.id}`)}>
              <td className="issue-table__cell issue-table__cell--key">{p.title}</td>
              <td className="issue-table__cell">{formatDateTime(p.updatedAt)}</td>
              <td className="issue-table__cell">{displayNameOf(users, p.updatedBy)}</td>
            </tr>
          ))}
          {loaded && rows.length === 0 && (
            <tr className="issue-table__row">
              <td colSpan={3} className="issue-table__cell text--muted">
                ページはありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
