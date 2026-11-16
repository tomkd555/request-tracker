import { rootedChildrenMap } from "../../shared/issueTree";
import type { Issue, IssueStatus, Milestone, StatusDef } from "../../shared/types";
import { byKeyAsc, byKeyDesc } from "../issues/compareKeys";
import { addDays, dayDiff, fromYmd, ymd } from "../issues/dates";
import { isActiveStatus } from "../issues/labels";
import { orderMilestones } from "../issues/milestones";

type Tone = "normal" | "overdue" | "muted";
/** bar: start to due; point: a start date alone; bracket: a parent's span taken from its children; none: listed without dates. */
type BarKind = "bar" | "point" | "bracket" | "none";
export interface BarSegment { startCol: number; span: number }
export interface GanttRow {
  key: string;
  summary: string;
  depth: number;
  assignee: string | null;
  status: IssueStatus;
  startDate: string | null;
  dueDate: string | null;
  kind: BarKind;
  bar: BarSegment | null;
  /** Days past the due date up to today, for an open issue. */
  late: BarSegment | null;
  tone: Tone;
  hasChildren: boolean;
  collapsed: boolean;
  /** Listed only to place a row below it: the issue itself fails the filter. */
  context: boolean;
}
interface GanttGroup { label: string | null; rows: GanttRow[] }
interface MonthCell { label: string; startCol: number; span: number }
interface DayCell { day: string; col: number; weekend: boolean; monday: boolean }
export interface GanttLayout { dayCells: DayCell[]; monthCells: MonthCell[]; groups: GanttGroup[]; todayCol: number | null }
export interface DateRange { start: string; end: string } // YYYY-MM-DD, inclusive

/** How many months a chart may span. */
export type MonthCount = 1 | 2 | 3 | 6;
export const MONTH_COUNTS: MonthCount[] = [1, 2, 3, 6];
export type GroupBy = "none" | "assignee" | "milestone";
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
  assigneeName?: (username: string) => string;
  /** The project's マイルストーン, which order the groups of `groupBy: "milestone"`; a group's label is the milestone id. An issue naming an id missing here has no milestone. */
  milestones?: Milestone[];
  /** Ancestors added around the filter's matches (withAncestors); each shows only above a row that shows. */
  context?: Set<string>;
}

/** The first and last day (YYYY-MM-DD) an issue's own bar covers before clipping. */
interface DrawnDates { from: string; to: string; kind: "bar" | "point" }

/** Whole months: the first day of `month` (YYYY-MM) to the last day of the month `monthCount - 1` later. */
export function rangeFor(month: string, monthCount: MonthCount): DateRange {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return { start: ymd(new Date(year, monthNumber - 1, 1)), end: ymd(new Date(year, monthNumber - 1 + monthCount, 0)) };
}

export const shiftMonth = (month: string, by: number): string => {
  const firstDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1);
  return ymd(firstDay).slice(0, 7);
};

export function dayCellsOf(range: DateRange): DayCell[] {
  const out: DayCell[] = [];
  for (let day = range.start, col = 0; day <= range.end; day = addDays(day, 1), col++) {
    const weekday = fromYmd(day).getDay();
    out.push({ day, col, weekend: weekday === 0 || weekday === 6, monday: weekday === 1 });
  }
  return out;
}

export function monthCellsOf(dayCells: DayCell[]): MonthCell[] {
  const out: MonthCell[] = [];
  for (const cell of dayCells) {
    const label = `${Number(cell.day.slice(0, 4))}年${Number(cell.day.slice(5, 7))}月`;
    const last = out[out.length - 1];
    if (last && last.label === label) last.span++;
    else out.push({ label, startCol: cell.col, span: 1 });
  }
  return out;
}

/** Days the bar covers before clipping: start (or the created day when only a due date is set) to due (or start alone). */
function drawnDatesOf(issue: Issue): DrawnDates | null {
  if (issue.startDate === null && issue.dueDate === null) return null;
  if (issue.dueDate === null) return { from: issue.startDate as string, to: issue.startDate as string, kind: "point" };
  const from = issue.startDate ?? ymd(new Date(issue.createdAt));
  // a due date before the start date (stored before the screens refused it) still draws a one-day bar
  return { from, to: issue.dueDate < from ? from : issue.dueDate, kind: "bar" };
}

const overlaps = (from: string, to: string, range: DateRange): boolean => from <= range.end && to >= range.start;

function clipToRange(from: string, to: string, range: DateRange): BarSegment | null {
  if (!overlaps(from, to, range)) return null;
  const visibleFrom = from < range.start ? range.start : from;
  const visibleTo = to > range.end ? range.end : to;
  return { startCol: dayDiff(range.start, visibleFrom), span: dayDiff(visibleFrom, visibleTo) + 1 };
}

const toneOf = (issue: Issue, today: string, statuses: StatusDef[]): Tone =>
  !isActiveStatus(statuses, issue.status) ? "muted" : issue.dueDate !== null && issue.dueDate < today ? "overdue" : "normal";

/** The rows bucketed by the key `groupKeyOf` gives their top-level row, so a child stays in its parent's group; keys in order of first appearance. */
function rowsByTopRow(rows: GanttRow[], groupKeyOf: (top: GanttRow) => string | null): Map<string | null, GanttRow[]> {
  const rowsByGroup = new Map<string | null, GanttRow[]>();
  let groupKey: string | null = null;
  for (const row of rows) {
    if (row.depth === 0) groupKey = groupKeyOf(row);
    const groupRows = rowsByGroup.get(groupKey);
    if (groupRows) groupRows.push(row);
    else rowsByGroup.set(groupKey, [row]);
  }
  return rowsByGroup;
}

/** Rows for the range: dated issues, the parents holding them, and (when asked) undated ones; parents first, children indented. */
export function layoutGantt(issues: Issue[], range: DateRange, opts: LayoutOptions): GanttLayout {
  const dayCells = dayCellsOf(range);
  const drawnDates = new Map<string, DrawnDates>();
  for (const issue of issues) {
    const dates = drawnDatesOf(issue);
    if (dates) drawnDates.set(issue.key, dates);
  }
  const inRange = (key: string): boolean => {
    const dates = drawnDates.get(key);
    return dates !== undefined && overlaps(dates.from, dates.to, range);
  };
  const children = rootedChildrenMap(issues);
  const childrenOf = (key: string): Issue[] => children.get(key) ?? [];

  // A parent with no dates of its own takes its descendants' span (OpenProject's clamp): each child's own span, or its bracket.
  const bracketOf = (parent: Issue): { from: string; to: string } | null => {
    const kids = childrenOf(parent.key)
      .map((child) => drawnDates.get(child.key) ?? bracketOf(child))
      .filter((s): s is NonNullable<typeof s> => s !== null && s !== undefined);
    if (kids.length === 0) return null;
    return {
      from: kids.reduce((earliest, kid) => (kid.from < earliest ? kid.from : earliest), kids[0].from),
      to: kids.reduce((latest, kid) => (kid.to > latest ? kid.to : latest), kids[0].to),
    };
  };

  const context = opts.context ?? new Set<string>();
  const visible = (issue: Issue): boolean => {
    if (context.has(issue.key)) return childrenOf(issue.key).some(visible);
    if (inRange(issue.key)) return true;
    // Only an issue without dates of its own draws its bracket.
    if (!drawnDates.has(issue.key)) {
      const bracket = bracketOf(issue);
      if (bracket !== null && overlaps(bracket.from, bracket.to, range)) return true;
    }
    if (childrenOf(issue.key).some(visible)) return true;
    return opts.includeUndated && !drawnDates.has(issue.key);
  };

  const row = (issue: Issue, depth: number): GanttRow => {
    const kids = childrenOf(issue.key);
    const dates = drawnDates.get(issue.key);
    let kind: BarKind = "none";
    let bar: BarSegment | null = null;
    if (dates) {
      kind = dates.kind;
      bar = clipToRange(dates.from, dates.to, range);
    } else {
      const bracket = bracketOf(issue);
      if (bracket) {
        kind = "bracket";
        bar = clipToRange(bracket.from, bracket.to, range);
      }
    }
    const tone = toneOf(issue, opts.today, opts.statuses);
    const late = tone === "overdue" && issue.dueDate !== null ? clipToRange(addDays(issue.dueDate, 1), opts.today, range) : null;
    return {
      key: issue.key,
      summary: issue.summary,
      depth,
      assignee: issue.assignee,
      status: issue.status,
      startDate: issue.startDate,
      dueDate: issue.dueDate,
      kind,
      bar,
      late,
      tone,
      hasChildren: kids.some(visible),
      collapsed: opts.collapsed.has(issue.key),
      context: context.has(issue.key),
    };
  };

  const topIssues = (children.get(null) ?? []).filter(visible).sort(opts.compare ?? byKeyDesc);
  const rows: GanttRow[] = [];
  const walk = (parent: Issue, depth: number): void => {
    if (opts.collapsed.has(parent.key)) return;
    for (const child of childrenOf(parent.key).filter(visible).sort(byKeyAsc)) {
      rows.push(row(child, depth));
      walk(child, depth + 1);
    }
  };
  for (const top of topIssues) {
    rows.push(row(top, 0));
    walk(top, 1);
  }

  let groups: GanttGroup[];
  if (opts.groupBy === "assignee") {
    const rowsByGroup = rowsByTopRow(rows, (top) => top.assignee);
    const label = opts.assigneeName ?? ((username: string): string => username);
    const assignees = [...rowsByGroup.keys()].filter((k): k is string => k !== null).sort((a, b) => label(a).localeCompare(label(b), "ja"));
    groups = assignees.map((assignee) => ({ label: assignee, rows: rowsByGroup.get(assignee) ?? [] }));
    if (rowsByGroup.has(null)) groups.push({ label: null, rows: rowsByGroup.get(null) ?? [] });
  } else if (opts.groupBy === "milestone") {
    const byKey = new Map(issues.map((issue) => [issue.key, issue]));
    const milestones = opts.milestones ?? [];
    const listed = new Set(milestones.map((m) => m.id));
    const rowsByGroup = rowsByTopRow(rows, (top) => {
      const id = byKey.get(top.key)?.milestone ?? null;
      return id !== null && listed.has(id) ? id : null;
    });
    groups = orderMilestones(milestones).filter((m) => rowsByGroup.has(m.id)).map((m) => ({ label: m.id, rows: rowsByGroup.get(m.id) ?? [] }));
    if (rowsByGroup.has(null)) groups.push({ label: null, rows: rowsByGroup.get(null) ?? [] });
  } else {
    groups = [{ label: null, rows }];
  }

  const todayCol = opts.today >= range.start && opts.today <= range.end ? dayDiff(range.start, opts.today) : null;
  return { dayCells, monthCells: monthCellsOf(dayCells), groups, todayCol };
}

/**
 * New dates after a drag of `deltaDays` days, measured on the bar as drawn: an edge clipped at the range moves from the
 * visible edge, a bar drawn from the created day gets that day as its start, and the two dates never cross.
 */
export function datesAfterDrag(issue: Issue, mode: DragMode, deltaDays: number, range: DateRange): { startDate: string | null; dueDate: string | null } {
  let { startDate, dueDate } = issue;
  const drawnStart = startDate ?? ymd(new Date(issue.createdAt));
  if (dueDate !== null && dueDate < drawnStart) dueDate = drawnStart; // drawn as one day on `drawnStart` (drawnDatesOf), so every mode measures from that day
  if (mode === "move") {
    if (dueDate === null) return { startDate: addDays(drawnStart, deltaDays), dueDate: null };
    startDate = addDays(drawnStart, deltaDays);
    dueDate = addDays(dueDate, deltaDays);
  } else if (mode === "start") {
    startDate = addDays(drawnStart < range.start ? range.start : drawnStart, deltaDays);
    if (dueDate !== null && startDate > dueDate) startDate = dueDate;
  } else if (dueDate !== null) {
    dueDate = addDays(dueDate > range.end ? range.end : dueDate, deltaDays);
    if (dueDate < drawnStart) dueDate = drawnStart;
  }
  return { startDate, dueDate };
}
