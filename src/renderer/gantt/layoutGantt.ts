import type { Issue, IssueStatus, StatusDef } from "../../shared/types";
import { addDays, dayDiff, fromYmd, ymd } from "../issues/dates";
import { isActiveStatus } from "../issues/labels";

export type Tone = "normal" | "overdue" | "muted";
/** bar: start to due; point: a start date alone; bracket: a parent's span taken from its children; none: listed without dates. */
export type BarKind = "bar" | "point" | "bracket" | "none";
export interface Segment { startCol: number; span: number }
export interface GanttRow {
  key: string;
  summary: string;
  depth: 0 | 1;
  assignee: string | null;
  status: IssueStatus;
  startDate: string | null;
  dueDate: string | null;
  kind: BarKind;
  bar: Segment | null;
  /** Days past the due date up to today, for an open issue. */
  late: Segment | null;
  tone: Tone;
  hasChildren: boolean;
  collapsed: boolean;
}
export interface GanttGroup { label: string | null; rows: GanttRow[] }
export interface MonthCell { label: string; startCol: number; span: number }
export interface DayCell { day: string; col: number; weekend: boolean; monday: boolean }
export interface GanttLayout { days: DayCell[]; months: MonthCell[]; groups: GanttGroup[]; todayCol: number | null }
export interface DateRange { start: string; end: string } // YYYY-MM-DD, inclusive

export type Months = 1 | 2 | 3 | 6;
export type GroupBy = "none" | "assignee";
export type DragMode = "move" | "start" | "due";

export interface LayoutOptions {
  today: string;
  groupBy: GroupBy;
  /** Parents whose children are hidden. */
  collapsed: Set<string>;
  /** Also list issues with no dates, without a bar. */
  includeUndated: boolean;
  /** The project's stages; an issue past the active ones draws muted. */
  statuses: StatusDef[];
  /** Order of the top-level rows; default key descending. Children always follow their parent in key order. */
  compare?: (a: Issue, b: Issue) => number;
  /** Display name of an assignee, which orders the 担当者 groups; default: the username itself. */
  groupLabel?: (username: string) => string;
}

/** Whole months: the first day of `month` (YYYY-MM) to the last day of the month `months - 1` later. */
export function rangeFor(month: string, months: Months): DateRange {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return { start: ymd(new Date(y, m - 1, 1)), end: ymd(new Date(y, m - 1 + months, 0)) };
}

export const shiftMonth = (month: string, by: number): string => {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1);
  return ymd(d).slice(0, 7);
};

export function daysOf(range: DateRange): DayCell[] {
  const out: DayCell[] = [];
  for (let d = range.start, col = 0; d <= range.end; d = addDays(d, 1), col++) {
    const dow = fromYmd(d).getDay();
    out.push({ day: d, col, weekend: dow === 0 || dow === 6, monday: dow === 1 });
  }
  return out;
}

export function monthsOf(days: DayCell[]): MonthCell[] {
  const out: MonthCell[] = [];
  for (const d of days) {
    const label = `${Number(d.day.slice(0, 4))}年${Number(d.day.slice(5, 7))}月`;
    const last = out[out.length - 1];
    if (last && last.label === label) last.span++;
    else out.push({ label, startCol: d.col, span: 1 });
  }
  return out;
}

/** Days the bar covers before clipping: start (or the created day when only a due date is set) to due (or start alone). */
function spanOf(i: Issue): { from: string; to: string; kind: "bar" | "point" } | null {
  if (i.startDate === null && i.dueDate === null) return null;
  if (i.dueDate === null) return { from: i.startDate as string, to: i.startDate as string, kind: "point" };
  const from = i.startDate ?? ymd(new Date(i.createdAt));
  // a due date before the start date (each field saves on its own) still draws a one-day bar
  return { from, to: i.dueDate < from ? from : i.dueDate, kind: "bar" };
}

function clip(from: string, to: string, range: DateRange): Segment | null {
  if (from > range.end || to < range.start) return null;
  const a = from < range.start ? range.start : from;
  const b = to > range.end ? range.end : to;
  return { startCol: dayDiff(range.start, a), span: dayDiff(a, b) + 1 };
}

const toneOf = (i: Issue, today: string, statuses: StatusDef[]): Tone =>
  !isActiveStatus(statuses, i.status) ? "muted" : i.dueDate !== null && i.dueDate < today ? "overdue" : "normal";

/** Rows for the range: dated issues, the parents holding them, and (when asked) undated ones; parents first, children indented. */
export function layoutGantt(issues: Issue[], range: DateRange, opts: LayoutOptions): GanttLayout {
  const days = daysOf(range);
  const byKey = new Map(issues.map((i) => [i.key, i]));
  const spans = new Map<string, { from: string; to: string; kind: "bar" | "point" }>();
  for (const i of issues) {
    const s = spanOf(i);
    if (s) spans.set(i.key, s);
  }
  const inRange = (key: string): boolean => {
    const s = spans.get(key);
    return s !== undefined && s.from <= range.end && s.to >= range.start;
  };
  const childrenOf = new Map<string, Issue[]>();
  for (const i of issues) if (i.parentKey !== null && byKey.has(i.parentKey)) childrenOf.set(i.parentKey, [...(childrenOf.get(i.parentKey) ?? []), i]);

  // A parent with no dates of its own takes its children's span (OpenProject's clamp).
  const bracketOf = (parent: Issue): { from: string; to: string } | null => {
    const kids = (childrenOf.get(parent.key) ?? []).map((c) => spans.get(c.key)).filter((s): s is NonNullable<typeof s> => s !== undefined);
    if (kids.length === 0) return null;
    return { from: kids.reduce((m, s) => (s.from < m ? s.from : m), kids[0].from), to: kids.reduce((m, s) => (s.to > m ? s.to : m), kids[0].to) };
  };

  const visible = (i: Issue): boolean => {
    if (inRange(i.key)) return true;
    if (i.parentKey === null) {
      const b = bracketOf(i);
      if (b !== null && b.from <= range.end && b.to >= range.start) return true;
      if ((childrenOf.get(i.key) ?? []).some((c) => inRange(c.key))) return true;
    }
    return opts.includeUndated && spans.get(i.key) === undefined;
  };

  const row = (i: Issue, depth: 0 | 1): GanttRow => {
    const kids = childrenOf.get(i.key) ?? [];
    const s = spans.get(i.key);
    let kind: BarKind = "none";
    let bar: Segment | null = null;
    if (s) {
      kind = s.kind;
      bar = clip(s.from, s.to, range);
    } else {
      const b = bracketOf(i);
      if (b) {
        kind = "bracket";
        bar = clip(b.from, b.to, range);
      }
    }
    const late = s && isActiveStatus(opts.statuses, i.status) && i.dueDate !== null && i.dueDate < opts.today ? clip(addDays(i.dueDate, 1), opts.today, range) : null;
    return {
      key: i.key,
      summary: i.summary,
      depth,
      assignee: i.assignee,
      status: i.status,
      startDate: i.startDate,
      dueDate: i.dueDate,
      kind,
      bar,
      late,
      tone: toneOf(i, opts.today, opts.statuses),
      hasChildren: kids.length > 0,
      collapsed: opts.collapsed.has(i.key),
    };
  };

  const desc = (a: Issue, b: Issue): number => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0);
  const tops = issues.filter((i) => (i.parentKey === null || !byKey.has(i.parentKey)) && (visible(i) || (childrenOf.get(i.key) ?? []).some(visible))).sort(opts.compare ?? desc);
  const rows: GanttRow[] = [];
  for (const top of tops) {
    rows.push(row(top, 0));
    if (opts.collapsed.has(top.key)) continue;
    for (const c of (childrenOf.get(top.key) ?? []).filter(visible).sort((a, b) => -desc(a, b))) rows.push(row(c, 1));
  }

  let groups: GanttGroup[];
  if (opts.groupBy === "assignee") {
    const map = new Map<string | null, GanttRow[]>();
    let current: string | null = null;
    for (const r of rows) {
      if (r.depth === 0) current = r.assignee;
      map.set(current, [...(map.get(current) ?? []), r]);
    }
    const label = opts.groupLabel ?? ((k: string): string => k);
    const keys = [...map.keys()].filter((k): k is string => k !== null).sort((a, b) => label(a).localeCompare(label(b), "ja"));
    groups = keys.map((k) => ({ label: k, rows: map.get(k) ?? [] }));
    if (map.has(null)) groups.push({ label: null, rows: map.get(null) ?? [] });
  } else {
    groups = [{ label: null, rows }];
  }

  const todayCol = opts.today >= range.start && opts.today <= range.end ? dayDiff(range.start, opts.today) : null;
  return { days, months: monthsOf(days), groups, todayCol };
}

/**
 * New dates after a drag of `delta` days, measured on the bar as drawn: an edge clipped at the range moves from the
 * visible edge, a bar drawn from the created day gets that day as its start, and the two dates never cross.
 */
export function datesAfterDrag(issue: Issue, mode: DragMode, delta: number, range: DateRange): { startDate: string | null; dueDate: string | null } {
  let { startDate, dueDate } = issue;
  const from = startDate ?? ymd(new Date(issue.createdAt));
  if (mode === "move") {
    if (dueDate === null) return { startDate: addDays(from, delta), dueDate: null };
    startDate = addDays(from, delta);
    dueDate = addDays(dueDate < from ? from : dueDate, delta);
  } else if (mode === "start") {
    startDate = addDays(from < range.start ? range.start : from, delta);
    if (dueDate !== null && startDate > dueDate) startDate = dueDate;
  } else if (dueDate !== null) {
    dueDate = addDays(dueDate > range.end ? range.end : dueDate, delta);
    if (dueDate < from) dueDate = from;
  }
  return { startDate, dueDate };
}
