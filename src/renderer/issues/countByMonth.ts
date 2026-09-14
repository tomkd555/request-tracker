import type { Issue, IssueStatus } from "../../shared/types";

export interface Count { key: string; count: number }
export interface MonthlyCounts {
  month: string;
  total: number;
  byReporter: Count[];
  byAssignee: Count[];
  byStatus: Count[];
  byCategory: Count[]; // "" = 未設定
  /** Issues closed in the month: status closed and updatedAt in the month. */
  closedTotal: number;
  closedByAssignee: Count[];
}

/** "YYYY-MM" of an ISO timestamp in local time. */
export function monthOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function tally(keys: string[]): Count[] {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * Counts of issues created in `month` (YYYY-MM) by reporter, assignee ("" = unassigned) and status, plus issues closed in the month.
 * ponytail: updatedAt approximates the closing date; an edit after closing moves the issue to that month.
 */
export function countByMonth(issues: Issue[], month: string): MonthlyCounts {
  const inMonth = issues.filter((i) => monthOf(i.createdAt) === month);
  const closed = issues.filter((i) => i.status === "closed" && monthOf(i.updatedAt) === month);
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

export const cell = (v: string | number): string => {
  const raw = String(v);
  const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw; // a display name starting with "=" must never run as a spreadsheet formula
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV body (no BOM) with three sections; `nameOf` renders usernames and status ids for display. */
export function toCsv(
  c: MonthlyCounts,
  nameOf: { user(username: string): string; status(status: IssueStatus): string },
): string {
  const lines: string[] = [[cell("対象月"), cell(c.month)].join(","), [cell("合計"), cell(c.total)].join(","), ""];
  const section = (title: string, rows: Count[], label: (k: string) => string): void => {
    lines.push(cell(title) + ",件数");
    for (const r of rows) lines.push([cell(label(r.key)), cell(r.count)].join(","));
    lines.push("");
  };
  section("登録者", c.byReporter, nameOf.user);
  section("担当者", c.byAssignee, (k) => (k === "" ? "未設定" : nameOf.user(k)));
  section("状態", c.byStatus, (k) => nameOf.status(k as IssueStatus));
  section("種別", c.byCategory, (k) => k || "未設定");
  lines.push([cell("完了件数"), cell(c.closedTotal)].join(","), "");
  section("完了 担当者別", c.closedByAssignee, (k) => (k === "" ? "未設定" : nameOf.user(k)));
  return lines.join("\r\n");
}
