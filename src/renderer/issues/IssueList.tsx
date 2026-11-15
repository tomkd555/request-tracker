import { useEffect, useState } from "react";
import { textOn } from "../app/theme";
import { displayNameOf, useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { BULK_MAX, bulkApply, keepVisible, toggleAllSelection, type BulkPatch, type BulkResult } from "./bulkEdit";
import { BulkBar } from "./BulkBar";
import { dateRefusal, today } from "./dates";
import { dueTone } from "./dueTone";
import { FilterBar } from "./FilterBar";
import { defaultFilter, filterIssues, type IssueFilter } from "./filterIssues";
import { descendantCounts, withAncestors } from "../../shared/issueTree";
import { toggled, useCollapsed } from "./collapsed";
import { groupByParent, treeKeyAction, treeRows, type TreeRow } from "./groupByParent";
import { issuesToCsv } from "./issuesToCsv";
import { milestoneName } from "./milestones";
import { categoryColor as categoryColorOf, formatDate, formatTimestampDate, isDoneStatus, labelColor, PRIORITY_LABEL, statusName, statusStyle } from "./labels";
import { ProgressCount, TreeKeyCell } from "./TreeCells";
import { carrySeen, isUnseen } from "./seen";
import { SavedFilters } from "./SavedFilters";
import { DEFAULT_SORT, fieldSortKey, issueComparator, nextSort, type IssueSort, type SortKey } from "./sortIssues";
import { useIssues } from "./useIssues";
import { errorMessage, M } from "../messages";

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

const MILESTONE_COLUMN: { key: SortKey; label: string } = { key: "milestone", label: "マイルストーン" };

export function IssueList(): React.JSX.Element {
  const { me, users, project, config } = useSession();
  const { issues, byKey, loaded, reload } = useIssues();
  const [filter, setFilter] = useState<IssueFilter>(() => defaultFilter(project.statuses));
  const [sort, setSort] = useState<IssueSort>(DEFAULT_SORT);
  const [message, setMessage] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const day = today();
  const nameOf = (u: string | null): string => displayNameOf(users, u);
  const [collapsed, toggleCollapsed] = useCollapsed();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const milestones = project.milestones ?? [];
  const matches = filterIssues(issues, filter, day, me.username, project.statuses, milestones);
  const compare = issueComparator(sort, nameOf, project.statuses, milestones);
  // A match keeps its ancestors as context rows, so its level stays readable under a filter.
  const { issues: shown, context } = withAncestors(issues, matches);
  const rows = treeRows(shown, compare, collapsed);
  const counts = descendantCounts(issues, (i) => isDoneStatus(project.statuses, i.status));
  // The マイルストーン column sits after 期限日 and shows only while the project has a milestone.
  const afterDue = FIXED_COLUMNS.findIndex((c) => c.key === "dueDate") + 1;
  const fixedColumns = milestones.length > 0 ? [...FIXED_COLUMNS.slice(0, afterDue), MILESTONE_COLUMN, ...FIXED_COLUMNS.slice(afterDue)] : FIXED_COLUMNS;
  const columns = [...fixedColumns, ...project.fields.map((f) => ({ key: fieldSortKey(f.id), label: f.name }))];
  const visibleKeys = rows.filter((r) => !context.has(r.issue.key)).map((r) => r.issue.key);
  const tabKey = rows.some((r) => r.issue.key === activeKey) ? activeKey : (rows[0]?.issue.key ?? null);
  // A row a later filter hides leaves the selection, so bulk edit acts on the rows on screen.
  const selected = keepVisible(chosen, visibleKeys);
  useEffect(() => {
    if (selected.size !== chosen.size) setChosen(selected);
  }, [selected.size, chosen.size]);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.slice(0, BULK_MAX).every((k) => selected.has(k));

  const toggleAll = (): void => setChosen(toggleAllSelection(selected, visibleKeys));
  const toggleRow = (key: string): void => setChosen(toggled(selected, key));

  const runBulk = async (patch: BulkPatch): Promise<BulkResult[]> => {
    const results: BulkResult[] = [];
    for (const key of selected) {
      const issue = byKey.get(key);
      if (!issue) continue;
      const change = bulkApply(issue, patch);
      if (change === null) continue;
      const refusal = dateRefusal(issue, change);
      if (refusal !== null) {
        results.push({ key, ok: false, message: refusal });
        continue;
      }
      try {
        const next = { ...issue, ...change, updatedAt: new Date().toISOString(), updatedBy: me.username };
        await window.api.issues.put(next, issue.updatedAt);
        carrySeen(issue, next, me.username);
        results.push({ key, ok: true, message: "" });
      } catch (e) {
        // ponytail: one issues:put per selected issue, no batch IPC; add one if a hundred writes over the share gets slow
        results.push({ key, ok: false, message: errorMessage(e) });
      }
    }
    await reload();
    return results;
  };

  const onRowKey = (e: React.KeyboardEvent<HTMLTableRowElement>, row: TreeRow): void => {
    if (e.target !== e.currentTarget) return; // a control inside the row keeps its own keys
    const action = treeKeyAction(e.key, row);
    if (action === null) return;
    e.preventDefault();
    if (action === "toggle") toggleCollapsed(row.issue.key);
    else if (action === "open") navigate(`/issues/${row.issue.key}`);
    else {
      const to = action === "next" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling;
      if (to instanceof HTMLElement) to.focus();
    }
  };

  const exportCsv = async (): Promise<void> => {
    setMessage(null);
    try {
      // The filtered issues, whatever is folded on screen; context rows stay out.
      const saved = await window.api.summary.exportCsv(issuesToCsv(groupByParent(matches, compare), { user: nameOf, status: (s) => statusName(project.statuses, s) }, project.fields), `issues-${day}.csv`);
      setMessage(saved ? M.csvSaved : null);
    } catch (e) {
      setMessage(errorMessage(e));
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
          <button type="button" onClick={() => navigate("/issues/import")}>
            CSVから登録
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
        <BulkBar count={selected.size} users={users} project={project} onExecute={runBulk} onClear={() => setChosen(new Set())} />
      )}
      <table className="issue-table issue-table--tree" role="treegrid" aria-label="課題">
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
          {rows.map((row) => {
            const { issue: i, depth } = row;
            const tone = dueTone(i, day, config.dueSoonDays, project.statuses);
            const categoryColor = categoryColorOf(project, i.category);
            const isContext = context.has(i.key);
            return (
              <tr
                key={i.key}
                className={`issue-table__row${depth > 0 ? " issue-table__row--child" : ""}${isContext ? " issue-table__row--context" : ""}`}
                aria-level={depth + 1}
                aria-expanded={row.hasChildren ? !row.collapsed : undefined}
                tabIndex={i.key === tabKey ? 0 : -1}
                onFocus={() => setActiveKey(i.key)}
                onKeyDown={(e) => onRowKey(e, row)}
                onClick={() => navigate(`/issues/${i.key}`)}
              >
                <td className="issue-table__cell issue-table__cell--check" onClick={(e) => e.stopPropagation()}>
                  {!isContext && <input type="checkbox" aria-label={`${i.key} を選択`} checked={selected.has(i.key)} onChange={() => toggleRow(i.key)} />}
                </td>
                <TreeKeyCell row={row} onToggle={toggleCollapsed}>
                  {isUnseen(i, me.username) && <span className="issue-table__unseen" role="img" aria-label="更新あり" />}
                  {i.key}
                </TreeKeyCell>
                <td className="issue-table__cell issue-table__cell--summary">
                  <div className="issue-table__summary">
                    <span className="issue-table__summary-text" title={i.summary}>
                      {i.summary}
                    </span>
                    <ProgressCount count={counts.get(i.key)} />
                    {i.labels.map((name) => {
                      const color = labelColor(project, name);
                      return (
                        <span key={name} className="pill issue-table__label" style={{ background: color, color: textOn(color) }}>
                          {name}
                        </span>
                      );
                    })}
                  </div>
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
                  <span className="pill" style={statusStyle(project.statuses, i.status)}>{statusName(project.statuses, i.status)}</span>
                </td>
                <td className={`issue-table__cell priority--${i.priority}`}>{PRIORITY_LABEL[i.priority]}</td>
                <td className={`issue-table__cell${tone === "none" ? "" : ` issue-table__cell--${tone}`}`}>{formatDate(i.dueDate)}</td>
                {milestones.length > 0 && <td className="issue-table__cell">{milestoneName(milestones, i.milestone)}</td>}
                <td className="issue-table__cell">{formatTimestampDate(i.updatedAt)}</td>
                {project.fields.map((f) => (
                  <td key={f.id} className="issue-table__cell issue-table__cell--field" title={i.fields[f.id] ?? ""}>
                    {i.fields[f.id] ?? ""}
                  </td>
                ))}
              </tr>
            );
          })}
          {loaded && rows.length === 0 && (
            <tr className="issue-table__row">
              <td colSpan={columns.length + 1} className="issue-table__cell text--muted">
                {M.noIssues}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
