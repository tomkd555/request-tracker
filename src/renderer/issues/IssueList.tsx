import { useState } from "react";
import { displayNameOf, useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { FilterBar } from "./FilterBar";
import { DEFAULT_FILTER, filterIssues, type IssueFilter } from "./filterIssues";
import { groupByParent } from "./groupByParent";
import { formatDate, PRIORITY_LABEL, STATUS_LABEL, statusClass } from "./labels";
import { useIssues } from "./useIssues";

export function IssueList(): React.JSX.Element {
  const { users } = useSession();
  const { issues, loaded } = useIssues();
  const [filter, setFilter] = useState<IssueFilter>(DEFAULT_FILTER);
  const rows = groupByParent(filterIssues(issues, filter));

  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">課題</h1>
        <a className="link-button" href="#/issues/new">
          課題を追加
        </a>
      </header>
      <FilterBar filter={filter} users={users} onChange={setFilter} />
      <table className="issue-table">
        <thead>
          <tr>
            <th className="issue-table__header">キー</th>
            <th className="issue-table__header">件名</th>
            <th className="issue-table__header">担当者</th>
            <th className="issue-table__header">状態</th>
            <th className="issue-table__header">優先度</th>
            <th className="issue-table__header">期限日</th>
            <th className="issue-table__header">更新日</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ issue: i, depth }) => (
            <tr
              key={i.key}
              className={`issue-table__row${depth === 1 ? " issue-table__row--child" : ""}`}
              onClick={() => navigate(`/issues/${i.key}`)}
            >
              <td className="issue-table__cell issue-table__cell--key">{i.key}</td>
              <td className="issue-table__cell">{i.summary}</td>
              <td className="issue-table__cell">{displayNameOf(users, i.assignee)}</td>
              <td className="issue-table__cell">
                <span className={statusClass(i.status)}>{STATUS_LABEL[i.status]}</span>
              </td>
              <td className={`issue-table__cell priority--${i.priority}`}>{PRIORITY_LABEL[i.priority]}</td>
              <td className="issue-table__cell">{formatDate(i.dueDate)}</td>
              <td className="issue-table__cell">{formatDate(i.updatedAt)}</td>
            </tr>
          ))}
          {loaded && rows.length === 0 && (
            <tr className="issue-table__row">
              <td colSpan={7} className="issue-table__cell text--muted">
                該当する課題はありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
