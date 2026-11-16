import type { Issue, IssueStatus, StatusDef } from "../../shared/types";
import { csvCell } from "./csv";
import { isDoneStatus } from "./labels";

export interface Count { key: string; count: number }
export interface MonthlyCounts {
  month: string;
  total: number;
  byReporter: Count[];
  byAssignee: Count[];
  byStatus: Count[];
  byCategory: Count[]; // "" = 未設定
  /** Issues closed in the month: a 完了 stage and updatedAt in the month. */
  closedTotal: number;
  closedByAssignee: Count[];
}

/** "YYYY-MM" of an ISO timestamp in local time. */
export function monthOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Counts per distinct key, most frequent first, ties by key. */
export function tally(keys: string[]): Count[] {
  const countByKey = new Map<string, number>();
  for (const k of keys) countByKey.set(k, (countByKey.get(k) ?? 0) + 1);
  return [...countByKey.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** The issues created in `month` (YYYY-MM), which the 集計 counts and totals cover. */
export const createdInMonth = (issues: Issue[], month: string): Issue[] => issues.filter((i) => monthOf(i.createdAt) === month);

/**
 * Counts of issues created in `month` (YYYY-MM) by reporter, assignee ("" = unassigned), status and 種別, plus issues closed in the month.
 * ponytail: updatedAt approximates the closing date; an edit after closing moves the issue to that month.
 */
export function countByMonth(issues: Issue[], month: string, statuses: StatusDef[]): MonthlyCounts {
  const inMonth = createdInMonth(issues, month);
  const closed = issues.filter((i) => isDoneStatus(statuses, i.status) && monthOf(i.updatedAt) === month);
  return {
    month,
    total: inMonth.length,
    byReporter: tally(inMonth.map((i) => i.reporter)),
    byAssignee: tally(inMonth.map((i) => i.assignee ?? "")),
    byStatus: tally(inMonth.map((i) => i.status)),
    byCategory: tally(inMonth.map((i) => i.category)),
    closedTotal: closed.length,
    closedByAssignee: tally(closed.map((i) => i.assignee ?? "")),
  };
}

/** CSV body (no BOM): month and total, five count tables and the closed total; `nameOf` renders usernames and status ids for display. */
export function monthlyCountsToCsv(
  counts: MonthlyCounts,
  nameOf: { user(username: string): string; status(status: IssueStatus): string },
): string {
  const lines: string[] = [[csvCell("対象月"), csvCell(counts.month)].join(","), [csvCell("合計"), csvCell(counts.total)].join(","), ""];
  const section = (title: string, rows: Count[], label: (k: string) => string): void => {
    lines.push(csvCell(title) + ",件数");
    for (const r of rows) lines.push([csvCell(label(r.key)), csvCell(r.count)].join(","));
    lines.push("");
  };
  const assigneeName = (k: string): string => (k === "" ? "未設定" : nameOf.user(k));
  section("登録者", counts.byReporter, nameOf.user);
  section("担当者", counts.byAssignee, assigneeName);
  section("状態", counts.byStatus, (k) => nameOf.status(k));
  section("種別", counts.byCategory, (k) => k || "未設定");
  lines.push([csvCell("完了件数"), csvCell(counts.closedTotal)].join(","), "");
  section("完了 担当者別", counts.closedByAssignee, assigneeName);
  return lines.join("\r\n");
}
