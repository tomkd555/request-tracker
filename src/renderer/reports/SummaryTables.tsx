import type { Issue, StatusDef } from "../../shared/types";
import { displayNameOf } from "../app/UserContext";
import { countByMonth, tally, type Count } from "../issues/countByMonth";
import { isDoneStatus, statusName } from "../issues/labels";
import { monthLabel, resolveMonth, scopeIssues, termOf, SUMMARY_TABLE_LABEL, type ReportContent, type ReportContext, type SummaryBlock, type SummaryTable } from "./blocks";

type Props = { block: SummaryBlock; report: ReportContent; ctx: ReportContext };

interface Counts {
  byStatus: Count[];
  byAssignee: Count[];
  byCategory: Count[];
  byReporter: Count[];
  closedByAssignee: Count[];
  total: number;
  closedTotal: number;
}
export interface SummaryRow { key: string; name: string; count: number }
export interface SummaryTableData { table: SummaryTable; heading: string; rows: SummaryRow[]; total: number }
export interface SummaryData { month: string | null; tables: SummaryTableData[] }

/** The scoped issues as they stand, tallied the way `mode: "now"` reads them (see countByMonth.ts for the `mode: "month"` counterpart). */
function countsNow(issues: Issue[], statuses: StatusDef[]): Counts {
  const closed = issues.filter((i) => isDoneStatus(statuses, i.status));
  return {
    byStatus: tally(issues.map((i) => i.status)),
    byAssignee: tally(issues.map((i) => i.assignee ?? "")),
    byCategory: tally(issues.map((i) => i.category)),
    byReporter: tally(issues.map((i) => i.reporter)),
    closedByAssignee: tally(closed.map((i) => i.assignee ?? "")),
    total: issues.length,
    closedTotal: closed.length,
  };
}

function rowsOf(table: SummaryTable, counts: Counts): Count[] {
  switch (table) {
    case "status":
      return counts.byStatus;
    case "assignee":
      return counts.byAssignee;
    case "category":
      return counts.byCategory;
    case "reporter":
      return counts.byReporter;
    case "closed":
      return counts.closedByAssignee;
  }
}

/** Status rows follow the project's stage order; every other table stays by count. */
function orderRows(table: SummaryTable, rows: Count[], ctx: ReportContext): Count[] {
  if (table !== "status") return rows;
  const index = (id: string): number => ctx.project.statuses.findIndex((s) => s.id === id);
  return [...rows].sort((a, b) => index(a.key) - index(b.key));
}

function nameOf(table: SummaryTable, key: string, report: ReportContent, ctx: ReportContext): string {
  const raw =
    table === "status" ? statusName(ctx.project.statuses, key) : table === "category" ? key || "未設定" : key === "" ? "未設定" : displayNameOf(ctx.users, key);
  return termOf(report.terms, raw);
}

/** The counted tables of a `::summary` block, shared by the on-screen tables and the Markdown export. */
export function summaryData(block: SummaryBlock, report: ReportContent, ctx: ReportContext): SummaryData {
  const scoped = scopeIssues(ctx.issues, block, ctx);
  const mode = block.mode ?? "month";
  const month = mode === "month" ? resolveMonth(block.month, ctx.today) : null;
  const counts: Counts = month !== null ? countByMonth(scoped, month, ctx.project.statuses) : countsNow(scoped, ctx.project.statuses);
  const tables = (block.tables ?? ["status"]).map((t) => ({
    table: t,
    heading: termOf(report.terms, SUMMARY_TABLE_LABEL[t]),
    rows: orderRows(t, rowsOf(t, counts), ctx).map((r) => ({ key: r.key, name: nameOf(t, r.key, report, ctx), count: r.count })),
    total: t === "closed" ? counts.closedTotal : counts.total,
  }));
  return { month, tables };
}

/** The 集計 tables of a `::summary` block: one two-column table per requested `tables` entry, plus a 合計 row. */
export function SummaryTables({ block, report, ctx }: Props): React.JSX.Element {
  const data = summaryData(block, report, ctx);
  return (
    <div className="report-doc__summary">
      {data.month !== null && <p className="report-doc__month">{monthLabel(data.month)}</p>}
      {data.tables.map((t) => (
        <table key={t.table} className="report-doc__summary-table">
          <thead>
            <tr>
              <th>{t.heading}</th>
              <th className="report-doc__num">件数</th>
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.key}>
                <td>{r.name}</td>
                <td className="report-doc__num">{r.count}</td>
              </tr>
            ))}
            <tr>
              <th>合計</th>
              <td className="report-doc__num">{t.total}</td>
            </tr>
          </tbody>
        </table>
      ))}
    </div>
  );
}
