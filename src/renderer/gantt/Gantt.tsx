import { useEffect, useRef, useState } from "react";
import type { IssueFilter } from "../../shared/types";
import { useChoiceDialog } from "../app/ChoiceDialog";
import { displayNameOf, useSession } from "../app/SessionContext";
import { navigate } from "../app/useHashRoute";
import { withAncestors } from "../../shared/issueTree";
import { useCollapsed } from "../issues/collapsed";
import { todayYmd } from "../issues/dates";
import { FilterBar } from "../issues/FilterBar";
import { defaultFilter, filterIssues } from "../issues/filterIssues";
import { statusName, statusStyle } from "../issues/labels";
import { milestoneName } from "../issues/milestones";
import { applyWrites, datedDescendants, moveWrites, type ParentAnswer } from "../issues/parentOps";
import { markOwnSave } from "../issues/seen";
import { SavedFilters } from "../issues/SavedFilters";
import { DEFAULT_SORT, issueComparator, nextSort, type IssueSort, type SortKey } from "../issues/sortIssues";
import { useIssues } from "../issues/useIssues";
import { datesAfterDrag, layoutGantt, MONTH_COUNTS, rangeFor, shiftMonth, type BarSegment, type DragMode, type GanttRow, type GroupBy, type MonthCount } from "./layoutGantt";
import "./gantt.css";
import { errorMessage, M } from "../messages";

const DAY_PX: Record<MonthCount, number> = { 1: 28, 2: 20, 3: 14, 6: 8 };
const LEFT_COL_WIDTHS_PX = [320, 90, 90, 100]; // 件名, 担当者, 状態, 期限日
const LEFT_WIDTH_PX = LEFT_COL_WIDTHS_PX.reduce((a, b) => a + b, 0);
const LEFT_OFFSETS_PX = LEFT_COL_WIDTHS_PX.map((_, i) => LEFT_COL_WIDTHS_PX.slice(0, i).reduce((a, b) => a + b, 0));
// Grid lines: the month and day headers take the first two rows; the day columns follow the left columns.
const MONTH_ROW = 1;
const DAY_ROW = 2;
const FIRST_BODY_ROW = 3;
const FIRST_DAY_COL = LEFT_COL_WIDTHS_PX.length + 1;
const BAR_INSET_PX = 2;
const INDENT_PX = 24;
/** From this many months on, the day header numbers Mondays only. */
const MONDAYS_ONLY_FROM_MONTHS = 3;
// Sort buttons per left column; the first column carries キー as well so the default order stays reachable.
const HEADERS: { key: SortKey; label: string }[][] = [
  [
    { key: "key", label: "キー" },
    { key: "summary", label: "件名" },
  ],
  [{ key: "assignee", label: "担当者" }],
  [{ key: "status", label: "状態" }],
  [{ key: "dueDate", label: "期限日" }],
];
const EDGE_GRAB_PX = 8;

interface Drag { key: string; mode: DragMode; originClientX: number; deltaDays: number }

const thisMonth = (): string => todayYmd().slice(0, 7);
const isFormField = (target: EventTarget | null): boolean => target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);

/** The bar as it is being dragged: the whole bar moves, or one edge does. */
function draggedSegment(seg: BarSegment, mode: DragMode, deltaDays: number): BarSegment {
  if (mode === "move") return { startCol: seg.startCol + deltaDays, span: seg.span };
  if (mode === "start") return { startCol: seg.startCol + Math.min(deltaDays, seg.span - 1), span: Math.max(1, seg.span - deltaDays) };
  return { startCol: seg.startCol, span: Math.max(1, seg.span + deltaDays) };
}

/** What a press `offsetPx` from the left of a bar `widthPx` wide grabs: an edge near either end, else the whole bar; a point always moves whole. */
function dragModeAt(row: GanttRow, offsetPx: number, widthPx: number): DragMode {
  if (row.kind === "point") return "move";
  const edgePx = Math.min(EDGE_GRAB_PX, widthPx / 3);
  if (offsetPx < edgePx) return "start";
  if (offsetPx > widthPx - edgePx) return "due";
  return "move";
}

export function Gantt(): React.JSX.Element {
  const { me, users, project } = useSession();
  const { issues, byKey, refreshOne } = useIssues();
  const [startMonth, setStartMonth] = useState(thisMonth());
  const [monthCount, setMonthCount] = useState<MonthCount>(1);
  const [filter, setFilter] = useState<IssueFilter>(() => defaultFilter(project.statuses));
  const [chosenGroupBy, setChosenGroupBy] = useState<GroupBy>("none");
  const [includeUndated, setIncludeUndated] = useState(false);
  const [sort, setSort] = useState<IssueSort>(DEFAULT_SORT);
  const [collapsed, toggleCollapsed] = useCollapsed();
  const [drag, setDrag] = useState<Drag | null>(null);
  const isDragging = drag !== null;
  // The bars being saved: a second drag of one of them, ended before the first is saved and re-read, would send the bar's old stamp and be refused as another member's change.
  const savingKeys = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const { ask, dialog } = useChoiceDialog();
  const today = todayYmd();
  const range = rangeFor(startMonth, monthCount);
  const dayPx = DAY_PX[monthCount];
  const nameOf = (u: string | null): string => displayNameOf(users, u);
  const milestones = project.milestones ?? [];
  // The マイルストーン option leaves the select once the project holds no milestone.
  const groupBy: GroupBy = chosenGroupBy === "milestone" && milestones.length === 0 ? "none" : chosenGroupBy;
  // A match keeps its ancestors as context rows, as in the issue list.
  const shown = withAncestors(issues, filterIssues(issues, filter, today, me.username, project.statuses, milestones));
  const layout = layoutGantt(shown.issues, range, {
    today,
    groupBy,
    collapsed,
    context: shown.context,
    includeUndated,
    statuses: project.statuses,
    compare: issueComparator(sort, nameOf, project.statuses, milestones),
    assigneeName: nameOf,
    milestones,
  });
  const dayCount = layout.dayCells.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // A month change mid-drag can take the dragged bar off the chart; its pointerup then never arrives and the drag stays on.
      if (isDragging || isFormField(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "n") setStartMonth((m) => shiftMonth(m, monthCount));
      if (e.key === "p") setStartMonth((m) => shiftMonth(m, -monthCount));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [monthCount, isDragging]);

  const finishDrag = async (ended: Drag): Promise<void> => {
    setDrag(null);
    if (ended.deltaDays === 0) {
      navigate(`/issues/${ended.key}`);
      return;
    }
    const issue = byKey.get(ended.key);
    if (!issue || savingKeys.current.has(issue.key)) return;
    setError(null);
    let touched = [issue.key];
    savingKeys.current.add(issue.key);
    try {
      try {
        // An edge drag moves one date of this issue only; a whole-bar move asks about the dated issues under it.
        const datedCount = ended.mode === "move" ? datedDescendants(issues, issue.key).length : 0;
        let answer: ParentAnswer = "only";
        if (datedCount > 0) answer = await ask(M.datedDescendants(datedCount), "配下も移動する");
        if (answer === "cancel") return;
        // Uses the bar position from when the drag started; the stale-write guard catches an edit made meanwhile.
        const writes = moveWrites(issues, issue, datesAfterDrag(issue, ended.mode, ended.deltaDays, range), ended.deltaDays, answer, { updatedAt: new Date().toISOString(), updatedBy: me.username });
        touched = writes.map((w) => w.next.key);
        for (const key of touched) savingKeys.current.add(key);
        await applyWrites(writes, (next, expected) => window.api.issues.put(next, expected), (next) => markOwnSave(byKey.get(next.key) ?? issue, next, me.username));
      } catch (e) {
        setError(errorMessage(e));
      }
      try {
        for (const key of touched) await refreshOne(key); // snaps a bar back to the record actually on disk after a failure
      } catch (e) {
        // a failed save's message stays; it names the first thing that went wrong
        setError((shownError) => shownError ?? errorMessage(e));
      }
    } finally {
      for (const key of touched) savingKeys.current.delete(key);
    }
  };

  const dragDeltaDays = (from: Drag, clientX: number): number => Math.round((clientX - from.originClientX) / dayPx);

  const renderBar = (row: GanttRow): React.JSX.Element | null => {
    if (row.bar === null) return null;
    const draggable = row.tone !== "muted" && row.kind !== "bracket" && !row.context;
    const tone = row.context ? "muted" : row.tone;
    const seg = drag && drag.key === row.key ? draggedSegment(row.bar, drag.mode, drag.deltaDays) : row.bar;
    const tooltip = `${row.key} ${row.summary}\n開始 ${row.startDate ?? ""} 期限 ${row.dueDate ?? ""}\n${displayNameOf(users, row.assignee)} ${statusName(project.statuses, row.status)}`;
    const onDown = (e: React.PointerEvent<HTMLDivElement>): void => {
      if (!draggable || e.button !== 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mode = dragModeAt(row, e.clientX - rect.left, rect.width);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // a synthetic event has no active pointer; moves still arrive while the pointer stays over the bar
      }
      setDrag({ key: row.key, mode, originClientX: e.clientX, deltaDays: 0 });
      e.preventDefault();
    };
    const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
      if (drag && drag.key === row.key) setDrag({ ...drag, deltaDays: dragDeltaDays(drag, e.clientX) });
    };
    // The pointerup can arrive before the last move has rendered, so the delta is measured on the pointerup itself.
    const onUp = (e: React.PointerEvent<HTMLDivElement>): void => {
      if (drag && drag.key === row.key) void finishDrag({ ...drag, deltaDays: dragDeltaDays(drag, e.clientX) });
    };
    const barClass = [
      "gantt__bar",
      `gantt__bar--${row.kind}`,
      tone !== "normal" && `gantt__bar--${tone}`,
      draggable && "gantt__bar--draggable",
      drag?.key === row.key && "gantt__bar--dragging",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <>
        <div
          className={barClass}
          style={{ left: seg.startCol * dayPx + BAR_INSET_PX, width: seg.span * dayPx - 2 * BAR_INSET_PX }}
          title={tooltip}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => setDrag(null)}
        />
        {row.late && !drag && <div className="gantt__late" style={{ left: row.late.startCol * dayPx + BAR_INSET_PX, width: row.late.span * dayPx - 2 * BAR_INSET_PX }} title={tooltip} />}
      </>
    );
  };

  const groupTitle = (label: string | null): string => {
    if (label === null) return "未設定";
    return groupBy === "milestone" ? milestoneName(milestones, label) : displayNameOf(users, label);
  };

  // Grid rows are fixed up front (the background spans them), so nothing depends on render order.
  const gridItems: ({ kind: "group"; label: string; gridRow: number } | { kind: "row"; row: GanttRow; gridRow: number })[] = [];
  let nextGridRow = FIRST_BODY_ROW;
  for (const group of layout.groups) {
    if (groupBy !== "none") gridItems.push({ kind: "group", label: groupTitle(group.label), gridRow: nextGridRow++ });
    for (const row of group.rows) gridItems.push({ kind: "row", row, gridRow: nextGridRow++ });
  }
  const bodyRows = gridItems.length;

  const renderRowCells = (row: GanttRow, gridRow: number): React.JSX.Element => {
    const cell = (colIndex: number, cls: string, content: React.ReactNode): React.JSX.Element => (
      <div
        key={colIndex}
        className={`gantt__cell ${cls}${row.context ? " gantt__cell--context" : ""}`}
        style={{
          gridRow,
          gridColumn: colIndex + 1,
          left: LEFT_OFFSETS_PX[colIndex],
          ...(colIndex === 0 && row.depth > 0 ? { paddingLeft: `calc(var(--space-2) + ${row.depth * INDENT_PX}px)` } : {}),
        }}
        onClick={() => navigate(`/issues/${row.key}`)}
      >
        {content}
      </div>
    );
    return (
      <div key={row.key} style={{ display: "contents" }}>
        {cell(
          0,
          "gantt__label",
          <>
            {row.hasChildren ? (
              <button
                type="button"
                className="gantt__toggle"
                aria-label={row.collapsed ? "開く" : "折りたたむ"}
                aria-expanded={!row.collapsed}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapsed(row.key);
                }}
              >
                {row.collapsed ? "▸" : "▾"}
              </button>
            ) : (
              <span className="gantt__toggle" />
            )}
            <span className="gantt__key">{row.key}</span>
            <span className="gantt__summary" title={row.summary}>
              {row.summary}
            </span>
          </>,
        )}
        {cell(1, "", displayNameOf(users, row.assignee))}
        {cell(2, "", <span className="pill" style={statusStyle(project.statuses, row.status)}>{statusName(project.statuses, row.status)}</span>)}
        {cell(3, row.tone === "overdue" ? "gantt__cell--overdue" : "", row.dueDate ?? "")}
        <div className="gantt__track" style={{ gridRow, gridColumn: `${FIRST_DAY_COL} / -1`, backgroundSize: `${dayPx}px 100%` }}>
          {renderBar(row)}
        </div>
      </div>
    );
  };

  const rangeText = `${range.start.replace(/-/g, "/")} – ${range.end.replace(/-/g, "/")}`;

  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">ガントチャート</h1>
        <div className="form-actions gantt__nav">
          <button type="button" onClick={() => setStartMonth((m) => shiftMonth(m, -monthCount))}>
            前へ
          </button>
          <button type="button" onClick={() => setStartMonth(thisMonth())}>
            今日
          </button>
          <button type="button" onClick={() => setStartMonth((m) => shiftMonth(m, monthCount))}>
            次へ
          </button>
          <label className="filter-bar__field">
            表示
            <select value={monthCount} onChange={(e) => setMonthCount(Number(e.target.value) as MonthCount)}>
              {MONTH_COUNTS.map((count) => (
                <option key={count} value={count}>
                  {count}か月
                </option>
              ))}
            </select>
          </label>
          <span className="gantt__range">{rangeText}</span>
        </div>
      </header>
      {dialog}
      <FilterBar filter={filter} onChange={setFilter} />
      <SavedFilters filter={filter} onChange={setFilter} />
      <div className="filter-bar gantt__options">
        <label className="filter-bar__field">
          グループ
          <select value={groupBy} onChange={(e) => setChosenGroupBy(e.target.value as GroupBy)}>
            <option value="none">なし</option>
            <option value="assignee">担当者</option>
            {milestones.length > 0 && <option value="milestone">マイルストーン</option>}
          </select>
        </label>
        <label className="filter-bar__check">
          <input type="checkbox" checked={includeUndated} onChange={(e) => setIncludeUndated(e.target.checked)} />
          期限なしを含む
        </label>
        {error && <span className="text--error">{error}</span>}
      </div>
      <div className="gantt__scroll">
        <div
          className="gantt"
          style={{ gridTemplateColumns: `${LEFT_COL_WIDTHS_PX.map((w) => `${w}px`).join(" ")} repeat(${dayCount}, ${dayPx}px)`, width: LEFT_WIDTH_PX + dayCount * dayPx }}
        >
          {HEADERS.map((buttons, colIndex) => {
            const active = buttons.find((b) => b.key === sort.key);
            return (
              <div
                key={colIndex}
                className="gantt__corner"
                role="columnheader"
                aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                style={{ gridRow: `${MONTH_ROW} / span 2`, gridColumn: colIndex + 1, left: LEFT_OFFSETS_PX[colIndex] }}
              >
                {buttons.map((button) => (
                  <button key={button.key} type="button" className="issue-table__sort" onClick={() => setSort((s) => nextSort(s, button.key))}>
                    {button.label}
                    {sort.key === button.key && <span className="issue-table__sort-mark">{sort.dir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                ))}
              </div>
            );
          })}
          {layout.monthCells.map((month) => (
            <div key={month.label} className="gantt__month" style={{ gridRow: MONTH_ROW, gridColumn: `${FIRST_DAY_COL + month.startCol} / span ${month.span}` }}>
              {month.label}
            </div>
          ))}
          {layout.dayCells.map((day) => {
            const isNumbered = monthCount < MONDAYS_ONLY_FROM_MONTHS || day.monday;
            return (
              <div key={day.day} className={`gantt__day${day.weekend ? " gantt__day--weekend" : ""}`} style={{ gridRow: DAY_ROW, gridColumn: FIRST_DAY_COL + day.col }}>
                {isNumbered ? Number(day.day.slice(8)) : ""}
              </div>
            );
          })}
          {bodyRows > 0 && (
            <div className="gantt__background" style={{ gridRow: `${FIRST_BODY_ROW} / span ${bodyRows}`, gridColumn: `${FIRST_DAY_COL} / -1` }} aria-hidden="true">
              {layout.dayCells.filter((day) => day.weekend).map((day) => (
                <div key={day.day} className="gantt__weekend" style={{ left: day.col * dayPx, width: dayPx }} />
              ))}
              {layout.todayCol !== null && <div className="gantt__today" style={{ left: layout.todayCol * dayPx, width: dayPx }} />}
            </div>
          )}
          {gridItems.map((item) =>
            item.kind === "group" ? (
              <div key={`group-${item.gridRow}`} className="gantt__group" style={{ gridRow: item.gridRow, gridColumn: "1 / -1" }}>
                {item.label}
              </div>
            ) : (
              renderRowCells(item.row, item.gridRow)
            ),
          )}
          {bodyRows === 0 && (
            <div className="gantt__empty" style={{ gridRow: FIRST_BODY_ROW, gridColumn: "1 / -1" }}>
              {M.noIssues}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
