import { useState } from "react";
import { textOn, TYPE_PILL_DEFAULT } from "../app/theme";
import { displayNameOf, useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { BULK_MAX, bulkApply, type BulkPatch, type BulkResult } from "./bulkEdit";
import { BulkBar } from "./BulkBar";
import { today } from "./dates";
import { dueTone } from "./dueTone";
import { FilterBar } from "./FilterBar";
import { DEFAULT_FILTER, filterIssues, type IssueFilter } from "./filterIssues";
import { groupByParent } from "./groupByParent";
import { defaultStatusName, issuesToCsv } from "./issuesToCsv";
import { formatDate, labelColor, PRIORITY_LABEL, STATUS_LABEL, statusClass } from "./labels";
import { staleMessage } from "./saveError";
import { isUnseen } from "./seen";
import { SavedFilters } from "./SavedFilters";
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
  const { issues, byKey, loaded, reload } = useIssues();
  const [filter, setFilter] = useState<IssueFilter>(DEFAULT_FILTER);
  const [sort, setSort] = useState<IssueSort>(DEFAULT_SORT);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const day = today();
  const nameOf = (u: string | null): string => displayNameOf(users, u);
  const rows = groupByParent(filterIssues(issues, filter, day, me.username), issueComparator(sort, nameOf));
  const columns = [...FIXED_COLUMNS, ...project.fields.map((f) => ({ key: fieldSortKey(f.id), label: f.name }))];
  const visibleKeys = rows.map((r) => r.issue.key);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));

  const toggleAll = (): void => setSelected(allVisibleSelected ? new Set() : new Set(visibleKeys.slice(0, BULK_MAX)));
  const toggleRow = (key: string): void =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const runBulk = async (patch: BulkPatch): Promise<BulkResult[]> => {
    const results: BulkResult[] = [];
    for (const key of selected) {
      const issue = byKey.get(key);
      if (!issue) continue;
      const change = bulkApply(issue, patch);
      if (change === null) continue;
      try {
        await window.api.issues.put({ ...issue, ...change, updatedAt: new Date().toISOString(), updatedBy: me.username }, issue.updatedAt);
        results.push({ key, ok: true, message: "" });
      } catch (e) {
        // ponytail: one issues:put per selected issue, no batch IPC; add one if a hundred writes over the share gets slow
        results.push({ key, ok: false, message: staleMessage(e) });
      }
    }
    await reload();
    return results;
  };

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
      <SavedFilters filter={filter} onChange={setFilter} />
      {selected.size > 0 && (
        <BulkBar count={selected.size} users={users} project={project} onExecute={runBulk} onClear={() => setSelected(new Set())} />
      )}
      <table className="issue-table">
        <thead>
          <tr>
            <th className="issue-table__header issue-table__header--check">
              <input type="checkbox" aria-label="すべて選択" checked={allVisibleSelected} onChange={toggleAll} />
            </th>
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
                <td className="issue-table__cell issue-table__cell--check" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`${i.key} を選択`} checked={selected.has(i.key)} onChange={() => toggleRow(i.key)} />
                </td>
                <td className="issue-table__cell issue-table__cell--key">
                  {isUnseen(i, me.username) && <span className="issue-table__unseen" role="img" aria-label="更新あり" />}
                  {i.key}
                </td>
                <td className="issue-table__cell">
                  {i.summary}
                  {i.labels.map((name) => {
                    const color = labelColor(project, name);
                    return (
                      <span key={name} className="pill issue-table__label" style={{ background: color, color: textOn(color) }}>
                        {name}
                      </span>
                    );
                  })}
                </td>
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
              <td colSpan={columns.length + 1} className="issue-table__cell text--muted">
                該当する課題はありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
