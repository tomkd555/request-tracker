import type { Issue } from "../../shared/types";
import { groupByParent } from "../issues/groupByParent";

export type Tone = "normal" | "overdue" | "muted";
export type GanttRow = { key: string; summary: string; depth: 0 | 1; startCol: number; span: number; tone: Tone };
export type GanttLayout = { days: string[]; rows: GanttRow[]; todayCol: number | null };
export type DateRange = { start: string; end: string }; // YYYY-MM-DD, inclusive

const pad = (n: number): string => String(n).padStart(2, "0");
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = (s: string): Date => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const addDays = (s: string, n: number): string => {
  const d = fromYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const dayDiff = (a: string, b: string): number => Math.round((fromYmd(b).getTime() - fromYmd(a).getTime()) / 86400000);

/** First day of the month minus 7 days to last day plus 7 days. `month` is YYYY-MM. */
export function rangeForMonth(month: string): DateRange {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return { start: addDays(ymd(new Date(y, m - 1, 1)), -7), end: addDays(ymd(new Date(y, m, 0)), 7) };
}

export function daysOf(range: DateRange): string[] {
  const out: string[] = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) out.push(d);
  return out;
}

export const isWeekend = (day: string): boolean => [0, 6].includes(fromYmd(day).getDay());

/** Rows for issues with a due date whose bar touches the range; parents first, children indented. */
export function layoutGantt(issues: Issue[], range: DateRange, today: string): GanttLayout {
  const days = daysOf(range);
  const visible = issues.filter((i) => {
    if (i.dueDate === null) return false;
    const start = i.startDate ?? ymd(new Date(i.createdAt));
    return start <= range.end && i.dueDate >= range.start;
  });
  const rows: GanttRow[] = groupByParent(visible).map(({ issue: i, depth }) => {
    const due = i.dueDate as string;
    const start = i.startDate ?? ymd(new Date(i.createdAt));
    const from = start < range.start ? range.start : start;
    const to = due > range.end ? range.end : due;
    const tone: Tone =
      i.status === "closed" || i.status === "resolved" ? "muted" : due < today ? "overdue" : "normal";
    return { key: i.key, summary: i.summary, depth, startCol: dayDiff(range.start, from), span: dayDiff(from, to) + 1, tone };
  });
  const todayCol = today >= range.start && today <= range.end ? dayDiff(range.start, today) : null;
  return { days, rows, todayCol };
}
