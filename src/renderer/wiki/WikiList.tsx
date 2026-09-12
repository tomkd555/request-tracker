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
      <div className="toolbar">
        <h1>Wiki</h1>
        <a className="button" href="#/wiki/new">
          新規ページ
        </a>
      </div>
      <div className="filter-bar">
        <input type="search" placeholder="タイトル" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
      </div>
      <table className="issue-table">
        <thead>
          <tr>
            <th>タイトル</th>
            <th>更新日</th>
            <th>更新者</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} onClick={() => navigate(`/wiki/${p.id}`)}>
              <td className="col-key">{p.title}</td>
              <td>{formatDateTime(p.updatedAt)}</td>
              <td>{displayNameOf(users, p.updatedBy)}</td>
            </tr>
          ))}
          {loaded && rows.length === 0 && (
            <tr>
              <td colSpan={3} className="empty">
                ページはありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
