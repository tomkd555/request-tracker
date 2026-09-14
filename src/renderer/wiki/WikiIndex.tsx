import { displayNameOf, useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { formatDateTime } from "../issues/labels";
import { useWiki } from "./useWiki";
import { flattenTree } from "./wikiTree";

/** Every page as a tree, with who touched it last. */
export function WikiIndex(): React.JSX.Element {
  const { users } = useSession();
  const { pages, loaded } = useWiki();
  const rows = flattenTree(pages);
  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">Wiki</h1>
      </header>
      <table className="issue-table">
        <thead>
          <tr>
            <th className="issue-table__header">タイトル</th>
            <th className="issue-table__header">更新日</th>
            <th className="issue-table__header">更新者</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ page: p, depth }) => (
            <tr key={p.id} className="issue-table__row" onClick={() => navigate(`/wiki/${p.id}`)}>
              <td className="issue-table__cell issue-table__cell--key" style={{ paddingLeft: `calc(var(--space-3) + ${depth * 24}px)` }}>
                {p.title}
              </td>
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
