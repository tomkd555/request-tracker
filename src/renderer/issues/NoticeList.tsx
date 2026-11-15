import { navigate } from "../app/useHashRoute";
import { displayNameOf, useSession } from "../app/UserContext";
import { M } from "../messages";
import { formatDateTime } from "./labels";
import { noticesOf } from "./notices";
import { markSeen, seenStamp } from "./seen";
import { useIssues } from "./useIssues";

export function NoticeList(): React.JSX.Element {
  const { me, users, project } = useSession();
  const { issues, watched, bumpSeen } = useIssues();
  const list = noticesOf(issues, watched, me.username, project.statuses, seenStamp);

  const markAll = (): void => {
    list.forEach(markSeen);
    bumpSeen();
  };

  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">お知らせ</h1>
        <div className="form-actions">
          <button type="button" disabled={list.length === 0} onClick={markAll}>
            すべて既読にする
          </button>
        </div>
      </header>
      {list.length === 0 ? (
        <p className="text--muted">{M.noNotices}</p>
      ) : (
        <table className="issue-table" aria-label="お知らせ">
          <thead>
            <tr>
              <th className="issue-table__header">キー</th>
              <th className="issue-table__header">件名</th>
              <th className="issue-table__header">更新者</th>
              <th className="issue-table__header">更新日時</th>
            </tr>
          </thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.key} className="issue-table__row" onClick={() => navigate(`/issues/${i.key}`)}>
                <td className="issue-table__cell issue-table__cell--key">
                  <a href={`#/issues/${i.key}`}>{i.key}</a>
                </td>
                <td className="issue-table__cell">{i.summary}</td>
                <td className="issue-table__cell">{displayNameOf(users, i.updatedBy)}</td>
                <td className="issue-table__cell">{formatDateTime(i.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
