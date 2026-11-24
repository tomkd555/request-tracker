import { useEffect, useState } from "react";
import type { IssueFilter } from "../../shared/types";
import { textOn } from "../app/theme";
import { displayNameOf, useSession } from "../app/SessionContext";
import { navigate } from "../app/useHashRoute";
import { MAX_BULK_ROWS, bulkChanges, keepVisible, toggleAllSelection, type BulkPatch, type BulkResult } from "./bulkEdit";
import { BulkBar, BulkResultView } from "./BulkBar";
import { dateRefusal, todayYmd } from "./dates";
import { dueTone } from "./dueTone";
import { FilterBar } from "./FilterBar";
import { defaultFilter, filterIssues } from "./filterIssues";
import { descendantCounts, rootedChildrenMap, withAncestors } from "../../shared/issueTree";
import { toggled, useCollapsed } from "./collapsed";
import { allTreeRows, treeKeyAction, treeRows, type TreeRow } from "./groupByParent";
import { issuesToCsv } from "./issuesToCsv";
import { milestoneName } from "./milestones";
import { categoryColor, formatDate, formatTimestampDate, isDoneStatus, labelColor, PRIORITY_LABEL, statusName, statusStyle } from "./labels";
import { ProgressCount, TreeKeyCell } from "./TreeCells";
import { markOwnSave, isUnseen } from "./seen";
import { SavedFilters } from "./SavedFilters";
import { DEFAULT_SORT, fieldSortKey, issueComparator, nextSort, type IssueSort, type SortKey } from "./sortIssues";
import { useIssues } from "./useIssues";
import { errorMessage, M } from "../messages";

// The body cells of a row are written out in this order below; a change here needs the same change there.
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

function ariaSort(sort: IssueSort, key: SortKey): "ascending" | "descending" | "none" {
  if (sort.key !== key) return "none";
  return sort.dir === "asc" ? "ascending" : "descending";
}

export function IssueList(): React.JSX.Element {
  const { me, users, project, config } = useSession();
  const { issues, byKey, isLoaded, reload } = useIssues();
  const [filter, setFilter] = useState<IssueFilter>(() => defaultFilter(project.statuses));
  const [sort, setSort] = useState<IssueSort>(DEFAULT_SORT);
  const [message, setMessage] = useState<string | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<BulkResult[] | null>(null);
  const today = todayYmd();
  const nameOf = (u: string | null): string => displayNameOf(users, u);
  const [collapsed, toggleCollapsed, setAllCollapsed] = useCollapsed();
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const milestones = project.milestones ?? [];
  const matches = filterIssues(issues, filter, today, me.username, project.statuses, milestones);
  const compare = issueComparator(sort, nameOf, project.statuses, milestones);
  // A match keeps its ancestors as context rows, so its level stays readable under a filter.
  const { issues: shown, context } = withAncestors(issues, matches);
  const rows = treeRows(shown, compare, collapsed);
  // Parents on screen, for 全て折りたたむ / 全て展開.
  const parentKeys = [...rootedChildrenMap(shown).keys()].filter((k): k is string => k !== null);
  const isAllCollapsed = parentKeys.length > 0 && parentKeys.every((k) => collapsed.has(k));
  const isAllExpanded = parentKeys.every((k) => !collapsed.has(k));
  const progressByKey = descendantCounts(issues, (i) => isDoneStatus(project.statuses, i.status));
  // The マイルストーン column sits after 期限日 and shows only while the project has a milestone.
  const afterDue = FIXED_COLUMNS.findIndex((c) => c.key === "dueDate") + 1;
  const fixedColumns = milestones.length > 0 ? [...FIXED_COLUMNS.slice(0, afterDue), MILESTONE_COLUMN, ...FIXED_COLUMNS.slice(afterDue)] : FIXED_COLUMNS;
  const columns = [...fixedColumns, ...project.fields.map((f) => ({ key: fieldSortKey(f.id), label: f.name }))];
  const visibleKeys = rows.filter((r) => !context.has(r.issue.key)).map((r) => r.issue.key);
  const tabStopKey = rows.some((r) => r.issue.key === focusedKey) ? focusedKey : (rows[0]?.issue.key ?? null);
  // A row a later filter hides leaves the selection, so bulk edit acts on the rows on screen.
  const visibleCheckedKeys = keepVisible(checkedKeys, visibleKeys);
  useEffect(() => {
    if (visibleCheckedKeys.size !== checkedKeys.size) setCheckedKeys(visibleCheckedKeys);
    // The sizes suffice: visibleCheckedKeys is a subset of checkedKeys, so equal sizes mean equal sets.
  }, [visibleCheckedKeys.size, checkedKeys.size]);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.slice(0, MAX_BULK_ROWS).every((k) => visibleCheckedKeys.has(k));

  // A new selection replaces the last result.
  const select = (keys: Set<string>): void => {
    setBulkResult(null);
    setCheckedKeys(keys);
  };
  const toggleAll = (): void => select(toggleAllSelection(visibleCheckedKeys, visibleKeys));
  const toggleRow = (key: string): void => select(toggled(visibleCheckedKeys, key));

  const runBulk = async (patch: BulkPatch): Promise<void> => {
    setBulkResult(null);
    const results: BulkResult[] = [];
    for (const key of visibleCheckedKeys) {
      const issue = byKey.get(key);
      if (!issue) continue;
      const change = bulkChanges(issue, patch);
      if (change === null) continue;
      const refusal = dateRefusal(issue, change);
      if (refusal !== null) {
        results.push({ key, ok: false, message: refusal });
        continue;
      }
      try {
        const next = { ...issue, ...change, updatedAt: new Date().toISOString(), updatedBy: me.username };
        await window.api.issues.put(next, issue.updatedAt);
        markOwnSave(issue, next, me.username);
        results.push({ key, ok: true, message: "" });
      } catch (e) {
        // ponytail: one issues:put per selected issue, no batch IPC; add one if a hundred writes over the share gets slow
        results.push({ key, ok: false, message: errorMessage(e) });
      }
    }
    // Kept here and set before the reload: when every written row leaves the filter the bar unmounts, and the result stays on screen.
    setBulkResult(results);
    try {
      await reload();
    } catch (e) {
      setMessage(errorMessage(e)); // the writes above are done; the results stay on screen
    }
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
      const saved = await window.api.summary.exportCsv(issuesToCsv(allTreeRows(matches, compare), { user: nameOf, status: (s) => statusName(project.statuses, s) }, project.fields, milestones), `issues-${today}.csv`);
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
      <FilterBar filter={filter} onChange={setFilter} />
      <SavedFilters filter={filter} onChange={setFilter} />
      {visibleCheckedKeys.size > 0 ? (
        <BulkBar count={visibleCheckedKeys.size} project={project} result={bulkResult} onExecute={runBulk} onClear={() => select(new Set())} />
      ) : (
        bulkResult !== null && (
          <div className="bulk-bar">
            <BulkResultView result={bulkResult} />
          </div>
        )
      )}
      <div className="form-actions issue-table__fold-actions">
        <button type="button" disabled={isAllCollapsed} onClick={() => setAllCollapsed(parentKeys, true)}>
          全て折りたたむ
        </button>
        <button type="button" disabled={isAllExpanded} onClick={() => setAllCollapsed(parentKeys, false)}>
          全て展開
        </button>
      </div>
      <table className="issue-table issue-table--tree" role="treegrid" aria-label="課題">
        <thead>
          <tr>
            <th className="issue-table__header issue-table__header--check">
              <input type="checkbox" aria-label="すべて選択" checked={allVisibleSelected} onChange={toggleAll} />
            </th>
            {columns.map((c) => (
              <th key={c.key} className="issue-table__header" aria-sort={ariaSort(sort, c.key)}>
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
            const { issue, depth } = row;
            const tone = dueTone(issue, today, config.dueSoonDays, project.statuses);
            const categoryPillColor = categoryColor(project, issue.category);
            const isContext = context.has(issue.key);
            return (
              <tr
                key={issue.key}
                className={`issue-table__row${depth > 0 ? " issue-table__row--child" : ""}${isContext ? " issue-table__row--context" : ""}`}
                aria-level={depth + 1}
                aria-expanded={row.hasChildren ? !row.collapsed : undefined}
                tabIndex={issue.key === tabStopKey ? 0 : -1}
                onFocus={() => setFocusedKey(issue.key)}
                onKeyDown={(e) => onRowKey(e, row)}
                onClick={() => navigate(`/issues/${issue.key}`)}
              >
                <td className="issue-table__cell issue-table__cell--check" onClick={(e) => e.stopPropagation()}>
                  {!isContext && <input type="checkbox" aria-label={`${issue.key} を選択`} checked={visibleCheckedKeys.has(issue.key)} onChange={() => toggleRow(issue.key)} />}
                </td>
                <TreeKeyCell row={row} onToggle={toggleCollapsed}>
                  {isUnseen(issue, me.username) && <span className="issue-table__unseen" role="img" aria-label="更新あり" />}
                  {issue.key}
                </TreeKeyCell>
                <td className="issue-table__cell issue-table__cell--summary">
                  <div className="issue-table__summary">
                    <span className="issue-table__summary-text" title={issue.summary}>
                      {issue.summary}
                    </span>
                    <ProgressCount count={progressByKey.get(issue.key)} />
                    {issue.labels.map((name) => {
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
                  {issue.category !== "" && (
                    <span className="pill" style={{ background: categoryPillColor, color: textOn(categoryPillColor) }}>
                      {issue.category}
                    </span>
                  )}
                </td>
                <td className="issue-table__cell">{nameOf(issue.assignee)}</td>
                <td className="issue-table__cell">
                  <span className="pill" style={statusStyle(project.statuses, issue.status)}>{statusName(project.statuses, issue.status)}</span>
                </td>
                <td className={`issue-table__cell priority--${issue.priority}`}>{PRIORITY_LABEL[issue.priority]}</td>
                <td className={`issue-table__cell${tone === "none" ? "" : ` issue-table__cell--${tone}`}`}>{formatDate(issue.dueDate)}</td>
                {milestones.length > 0 && <td className="issue-table__cell">{milestoneName(milestones, issue.milestone)}</td>}
                <td className="issue-table__cell">{formatTimestampDate(issue.updatedAt)}</td>
                {project.fields.map((f) => (
                  <td key={f.id} className="issue-table__cell issue-table__cell--field" title={issue.fields[f.id] ?? ""}>
                    {issue.fields[f.id] ?? ""}
                  </td>
                ))}
              </tr>
            );
          })}
          {isLoaded && rows.length === 0 && (
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
