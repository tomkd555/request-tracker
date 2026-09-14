import { useState } from "react";
import { textOn, TYPE_PILL_DEFAULT } from "../app/theme";
import { displayNameOf, useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { today } from "./dates";
import { dueTone } from "./dueTone";
import { FilterBar } from "./FilterBar";
import { DEFAULT_FILTER, filterIssues, type IssueFilter } from "./filterIssues";
import { groupByParent } from "./groupByParent";
import { defaultStatusName, issuesToCsv } from "./issuesToCsv";
import { formatDate, PRIORITY_LABEL, STATUS_LABEL, statusClass } from "./labels";
import { isUnseen } from "./seen";
import { DEFAULT_SORT, fieldSortKey, issueComparator, nextSort, type IssueSort, type SortKey } from "./sortIssues";
import { useIssues } from "./useIssues";

const FIXED_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "key", label: "キー" },
  { key: "summary", label: "件名" },
  { key: "category", label: "種別" },
  { key: "assignee", label: "担当者" },
  { key: "status", label: "状態" },
  { key: "priority", label: "優先度" },
  { key: "dueDate", label: "期限日" },
  { key: "updatedAt", label: "更新日" },
];

export function IssueList(): React.JSX.Element {
  const { me, users, project, config } = useSession();
  const { issues, loaded } = useIssues();
  const [filter, setFilter] = useState<IssueFilter>(DEFAULT_FILTER);
  const [sort, setSort] = useState<IssueSort>(DEFAULT_SORT);
  const [message, setMessage] = useState<string | null>(null);
  const day = today();
  const nameOf = (u: string | null): string => displayNameOf(users, u);
  const rows = groupByParent(filterIssues(issues, filter, day, me.username), issueComparator(sort, nameOf));
  const columns = [...FIXED_COLUMNS, ...project.fields.map((f) => ({ key: fieldSortKey(f.id), label: f.name }))];

  const exportCsv = async (): Promise<void> => {
    setMessage(null);
    try {
      const saved = await window.api.summary.exportCsv(issuesToCsv(rows, { user: nameOf, status: defaultStatusName }, project.fields), `issues-${day}.csv`);
      setMessage(saved ? "CSVを保存しました" : null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">課題</h1>
        <div className="form-actions">
          <button type="button" onClick={() => void exportCsv()}>
            CSVに出力
          </button>
          <a className="link-button" href="#/issues/new">
            課題を追加
          </a>
        </div>
      </header>
      {message && <p className="text--muted">{message}</p>}
      <FilterBar filter={filter} users={users} onChange={setFilter} />
      <table className="issue-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="issue-table__header" aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                <button type="button" className="issue-table__sort" onClick={() => setSort((s) => nextSort(s, c.key))}>
                  {c.label}
                  {sort.key === c.key && <span className="issue-table__sort-mark">{sort.dir === "asc" ? "▲" : "▼"}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ issue: i, depth }) => {
            const tone = dueTone(i, day, config.dueSoonDays);
            const categoryColor = project.categoryColors[i.category] ?? TYPE_PILL_DEFAULT;
            return (
              <tr
                key={i.key}
                className={`issue-table__row${depth === 1 ? " issue-table__row--child" : ""}`}
                onClick={() => navigate(`/issues/${i.key}`)}
              >
                <td className="issue-table__cell issue-table__cell--key">
                  {isUnseen(i, me.username) && <span className="issue-table__unseen" role="img" aria-label="更新あり" />}
                  {i.key}
                </td>
                <td className="issue-table__cell">{i.summary}</td>
                <td className="issue-table__cell">
                  {i.category !== "" && (
                    <span className="pill" style={{ background: categoryColor, color: textOn(categoryColor) }}>
                      {i.category}
                    </span>
                  )}
                </td>
                <td className="issue-table__cell">{nameOf(i.assignee)}</td>
                <td className="issue-table__cell">
                  <span className={statusClass(i.status)}>{STATUS_LABEL[i.status]}</span>
                </td>
                <td className={`issue-table__cell priority--${i.priority}`}>{PRIORITY_LABEL[i.priority]}</td>
                <td className={`issue-table__cell${tone === "none" ? "" : ` issue-table__cell--${tone}`}`}>{formatDate(i.dueDate)}</td>
                <td className="issue-table__cell">{formatDate(i.updatedAt)}</td>
                {project.fields.map((f) => (
                  <td key={f.id} className="issue-table__cell">
                    {i.fields[f.id] ?? ""}
                  </td>
                ))}
              </tr>
            );
          })}
          {loaded && rows.length === 0 && (
            <tr className="issue-table__row">
              <td colSpan={columns.length} className="issue-table__cell text--muted">
                該当する課題はありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
