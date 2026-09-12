import { useState } from "react";
import { displayNameOf, useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { FilterBar } from "./FilterBar";
import { DEFAULT_FILTER, filterIssues, type IssueFilter } from "./filterIssues";
import { groupByParent } from "./groupByParent";
import { formatDate, PRIORITY_LABEL, STATUS_LABEL } from "./labels";
import { useIssues } from "./useIssues";

export function IssueList(): React.JSX.Element {
  const { users } = useSession();
  const { issues, loaded } = useIssues();
  const [filter, setFilter] = useState<IssueFilter>(DEFAULT_FILTER);
  const rows = groupByParent(filterIssues(issues, filter));

  return (
    <div>
      <div className="toolbar">
        <h1>課題</h1>
        <a className="button" href="#/issues/new">
          課題を追加
        </a>
      </div>
      <FilterBar filter={filter} users={users} onChange={setFilter} />
      <table className="issue-table">
        <thead>
          <tr>
            <th>キー</th>
            <th>件名</th>
            <th>担当者</th>
            <th>状態</th>
            <th>優先度</th>
            <th>期限日</th>
            <th>更新日</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ issue: i, depth }) => (
            <tr key={i.key} className={depth === 1 ? "child" : ""} onClick={() => navigate(`/issues/${i.key}`)}>
              <td className="col-key">{i.key}</td>
              <td>{i.summary}</td>
              <td>{displayNameOf(users, i.assignee)}</td>
              <td>
                <span className={`pill status-${i.status}`}>{STATUS_LABEL[i.status]}</span>
              </td>
              <td className={`priority-${i.priority}`}>{PRIORITY_LABEL[i.priority]}</td>
              <td>{formatDate(i.dueDate)}</td>
              <td>{formatDate(i.updatedAt)}</td>
            </tr>
          ))}
          {loaded && rows.length === 0 && (
            <tr>
              <td colSpan={7} className="empty">
                該当する課題はありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
