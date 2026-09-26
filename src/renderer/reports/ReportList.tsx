import { displayNameOf, useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { formatDateTime } from "../issues/labels";
import { M } from "../messages";
import { useReports } from "./useReports";
import "./reports.css";

/** Every report and template, the last edited first. */
export function ReportList(): React.JSX.Element {
  const { users } = useSession();
  const { reports, loaded } = useReports();
  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">レポート</h1>
        <a className="link-button" href="#/reports/new">
          レポートを追加
        </a>
      </header>
      <table className="issue-table">
        <thead>
          <tr>
            <th className="issue-table__header">タイトル</th>
            <th className="issue-table__header">区分</th>
            <th className="issue-table__header">更新日</th>
            <th className="issue-table__header">更新者</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id} className="issue-table__row" onClick={() => navigate(`/reports/${r.id}`)}>
              <td className="issue-table__cell issue-table__cell--key">
                <a href={`#/reports/${r.id}`}>{r.title}</a>
              </td>
              <td className="issue-table__cell">{r.isTemplate ? "テンプレート" : "レポート"}</td>
              <td className="issue-table__cell">{formatDateTime(r.updatedAt)}</td>
              <td className="issue-table__cell">{displayNameOf(users, r.updatedBy)}</td>
            </tr>
          ))}
          {loaded && reports.length === 0 && (
            <tr className="issue-table__row">
              <td colSpan={4} className="issue-table__cell text--muted">
                {M.noReports}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
