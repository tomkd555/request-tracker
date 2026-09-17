import { useEffect, useState } from "react";
import { displayNameOf, useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { ymd } from "../issues/dates";
import { FilterBar } from "../issues/FilterBar";
import { DEFAULT_FILTER, filterIssues, type IssueFilter } from "../issues/filterIssues";
import { STATUS_LABEL, statusClass } from "../issues/labels";
import { SavedFilters } from "../issues/SavedFilters";
import { staleMessage } from "../issues/saveError";
import { DEFAULT_SORT, issueComparator, nextSort, type IssueSort, type SortKey } from "../issues/sortIssues";
import { useIssues } from "../issues/useIssues";
import { datesAfterDrag, layoutGantt, rangeFor, shiftMonth, type DragMode, type GanttRow, type GroupBy, type Months, type Segment } from "./layoutGantt";
import "./gantt.css";

const DAY_PX: Record<Months, number> = { 1: 28, 2: 20, 3: 14, 6: 8 };
const MONTH_OPTIONS: Months[] = [1, 2, 3, 6];
const LEFT_COLS = [320, 90, 90, 100]; // 件名, 担当者, 状態, 期限日
const LEFT_TOTAL = LEFT_COLS.reduce((a, b) => a + b, 0);
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
const EDGE_PX = 8;

interface Drag { key: string; mode: DragMode; originX: number; delta: number; pointerId: number }

const thisMonth = (): string => ymd(new Date()).slice(0, 7);
const isEditable = (t: EventTarget | null): boolean => t instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);

/** The bar as it is being dragged: the whole bar moves, or one edge does. */
function dragged(seg: Segment, mode: DragMode, delta: number): Segment {
  if (mode === "move") return { startCol: seg.startCol + delta, span: seg.span };
  if (mode === "start") return { startCol: seg.startCol + Math.min(delta, seg.span - 1), span: Math.max(1, seg.span - delta) };
  return { startCol: seg.startCol, span: Math.max(1, seg.span + delta) };
}

export function Gantt(): React.JSX.Element {
  const { me, users } = useSession();
  const { issues, byKey, refreshOne } = useIssues();
  const [month, setMonth] = useState(thisMonth());
  const [months, setMonths] = useState<Months>(1);
  const [filter, setFilter] = useState<IssueFilter>(DEFAULT_FILTER);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [includeUndated, setIncludeUndated] = useState(false);
  const [sort, setSort] = useState<IssueSort>(DEFAULT_SORT);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const today = ymd(new Date());
  const range = rangeFor(month, months);
  const dayPx = DAY_PX[months];
  const nameOf = (u: string | null): string => displayNameOf(users, u);
  const layout = layoutGantt(filterIssues(issues, filter, today, me.username), range, {
    today,
    groupBy,
    collapsed,
    includeUndated,
    compare: issueComparator(sort, nameOf),
    groupLabel: nameOf,
  });
  const dayCount = layout.days.length;
  const bodyRows = layout.groups.reduce((n, g) => n + g.rows.length + (g.label !== null || groupBy === "assignee" ? 1 : 0), 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "n") setMonth((m) => shiftMonth(m, months));
      if (e.key === "p") setMonth((m) => shiftMonth(m, -months));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [months]);

  const toggle = (key: string): void =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const finishDrag = async (d: Drag): Promise<void> => {
    setDrag(null);
    if (d.delta === 0) {
      navigate(`/issues/${d.key}`);
      return;
    }
    const issue = byKey.get(d.key);
    if (!issue) return;
    setMessage(null);
    try {
      // Uses the bar position from when the drag started; the stale-write guard catches an edit made meanwhile.
      await window.api.issues.put({ ...issue, ...datesAfterDrag(issue, d.mode, d.delta, range), updatedAt: new Date().toISOString(), updatedBy: me.username }, issue.updatedAt);
      await refreshOne(issue.key);
    } catch (e) {
      setMessage(staleMessage(e));
      await refreshOne(issue.key); // snaps the bar back to the record actually on disk
    }
  };

  const barFor = (r: GanttRow): React.JSX.Element | null => {
    if (r.bar === null) return null;
    const draggable = r.tone !== "muted" && r.kind !== "bracket";
    const seg = drag && drag.key === r.key ? dragged(r.bar, drag.mode, drag.delta) : r.bar;
    const tip = `${r.key} ${r.summary}\n開始 ${r.startDate ?? ""} 期限 ${r.dueDate ?? ""}\n${displayNameOf(users, r.assignee)} ${STATUS_LABEL[r.status]}`;
    const onDown = (e: React.PointerEvent<HTMLDivElement>): void => {
      if (!draggable || e.button !== 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const edge = Math.min(EDGE_PX, rect.width / 3);
      const mode: DragMode = r.kind === "point" ? "move" : x < edge ? "start" : x > rect.width - edge ? "due" : "move";
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // a synthetic event has no active pointer; moves still arrive while the pointer stays over the bar
      }
      setDrag({ key: r.key, mode, originX: e.clientX, delta: 0, pointerId: e.pointerId });
      e.preventDefault();
    };
    const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
      if (drag && drag.key === r.key) setDrag({ ...drag, delta: Math.round((e.clientX - drag.originX) / dayPx) });
    };
    const onUp = (): void => {
      if (drag && drag.key === r.key) void finishDrag(drag);
    };
    return (
      <>
        <div
          className={`gantt__bar gantt__bar--${r.kind}${r.tone !== "normal" ? ` gantt__bar--${r.tone}` : ""}${draggable ? " gantt__bar--draggable" : ""}${drag?.key === r.key ? " gantt__bar--dragging" : ""}`}
          style={{ left: seg.startCol * dayPx + 2, width: seg.span * dayPx - 4 }}
          title={tip}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => setDrag(null)}
        />
        {r.late && !drag && <div className="gantt__late" style={{ left: r.late.startCol * dayPx + 2, width: r.late.span * dayPx - 4 }} title={tip} />}
      </>
    );
  };

  // Grid rows are fixed up front (the background spans them), so nothing depends on render order.
  const items: ({ kind: "group"; label: string; row: number } | { kind: "row"; r: GanttRow; row: number })[] = [];
  let nextRow = 3;
  for (const g of layout.groups) {
    if (groupBy === "assignee") items.push({ kind: "group", label: g.label === null ? "未設定" : displayNameOf(users, g.label), row: nextRow++ });
    for (const r of g.rows) items.push({ kind: "row", r, row: nextRow++ });
  }

  const rowCells = (r: GanttRow, row: number): React.JSX.Element => {
    const cell = (i: number, cls: string, content: React.ReactNode): React.JSX.Element => (
      <div
        key={i}
        className={`gantt__cell ${cls}`}
        style={{ gridRow: row, gridColumn: i + 1, left: LEFT_COLS.slice(0, i).reduce((a, b) => a + b, 0) }}
        onClick={() => navigate(`/issues/${r.key}`)}
      >
        {content}
      </div>
    );
    return (
      <div key={r.key} style={{ display: "contents" }}>
        {cell(
          0,
          `gantt__label${r.depth === 1 ? " gantt__label--child" : ""}`,
          <>
            {r.hasChildren ? (
              <button
                type="button"
                className="gantt__toggle"
                aria-label={r.collapsed ? "開く" : "折りたたむ"}
                aria-expanded={!r.collapsed}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(r.key);
                }}
              >
                {r.collapsed ? "▸" : "▾"}
              </button>
            ) : (
              <span className="gantt__toggle" />
            )}
            <span className="gantt__key">{r.key}</span>
            <span className="gantt__summary" title={r.summary}>
              {r.summary}
            </span>
          </>,
        )}
        {cell(1, "", displayNameOf(users, r.assignee))}
        {cell(2, "", <span className={statusClass(r.status)}>{STATUS_LABEL[r.status]}</span>)}
        {cell(3, r.tone === "overdue" ? "gantt__cell--overdue" : "", r.dueDate ?? "")}
        <div className="gantt__track" style={{ gridRow: row, gridColumn: `5 / -1`, backgroundSize: `${dayPx}px 100%` }}>
          {barFor(r)}
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
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -months))}>
            前へ
          </button>
          <button type="button" onClick={() => setMonth(thisMonth())}>
            今日
          </button>
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, months))}>
            次へ
          </button>
          <label className="filter-bar__field">
            表示
            <select value={months} onChange={(e) => setMonths(Number(e.target.value) as Months)}>
              {MONTH_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}か月
                </option>
              ))}
            </select>
          </label>
          <span className="gantt__range">{rangeText}</span>
        </div>
      </header>
      <FilterBar filter={filter} users={users} onChange={setFilter} />
      <SavedFilters filter={filter} onChange={setFilter} />
      <div className="filter-bar gantt__options">
        <label className="filter-bar__field">
          グループ
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            <option value="none">なし</option>
            <option value="assignee">担当者</option>
          </select>
        </label>
        <label className="filter-bar__check">
          <input type="checkbox" checked={includeUndated} onChange={(e) => setIncludeUndated(e.target.checked)} />
          期限なしを含む
        </label>
        {message && <span className="text--error">{message}</span>}
      </div>
      <div className="gantt__scroll">
        <div
          className="gantt"
          style={{ gridTemplateColumns: `${LEFT_COLS.map((w) => `${w}px`).join(" ")} repeat(${dayCount}, ${dayPx}px)`, width: LEFT_TOTAL + dayCount * dayPx }}
        >
          {HEADERS.map((buttons, i) => {
            const active = buttons.find((b) => b.key === sort.key);
            return (
              <div
                key={i}
                className="gantt__corner"
                role="columnheader"
                aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                style={{ gridRow: "1 / span 2", gridColumn: i + 1, left: LEFT_COLS.slice(0, i).reduce((a, b) => a + b, 0) }}
              >
                {buttons.map((b) => (
                  <button key={b.key} type="button" className="issue-table__sort" onClick={() => setSort((s) => nextSort(s, b.key))}>
                    {b.label}
                    {sort.key === b.key && <span className="issue-table__sort-mark">{sort.dir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                ))}
              </div>
            );
          })}
          {layout.months.map((m) => (
            <div key={m.label} className="gantt__month" style={{ gridRow: 1, gridColumn: `${5 + m.startCol} / span ${m.span}` }}>
              {m.label}
            </div>
          ))}
          {layout.days.map((d) => (
            <div key={d.day} className={`gantt__day${d.weekend ? " gantt__day--weekend" : ""}`} style={{ gridRow: 2, gridColumn: 5 + d.col }}>
              {months >= 3 ? (d.monday ? Number(d.day.slice(8)) : "") : Number(d.day.slice(8))}
            </div>
          ))}
          {bodyRows > 0 && (
            <div className="gantt__background" style={{ gridRow: `3 / span ${bodyRows}`, gridColumn: "5 / -1" }} aria-hidden="true">
              {layout.days.filter((d) => d.weekend).map((d) => (
                <div key={d.day} className="gantt__weekend" style={{ left: d.col * dayPx, width: dayPx }} />
              ))}
              {layout.todayCol !== null && <div className="gantt__today" style={{ left: layout.todayCol * dayPx, width: dayPx }} />}
            </div>
          )}
          {items.map((it) =>
            it.kind === "group" ? (
              <div key={`group-${it.row}`} className="gantt__group" style={{ gridRow: it.row, gridColumn: "1 / -1" }}>
                {it.label}
              </div>
            ) : (
              rowCells(it.r, it.row)
            ),
          )}
          {bodyRows === 0 && (
            <div className="gantt__empty" style={{ gridRow: 3, gridColumn: "1 / -1" }}>
              該当する課題はありません
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
