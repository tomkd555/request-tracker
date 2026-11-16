import type { Issue, StatusDef } from "../../shared/types";
import { countByMonth, tally, type Count, type MonthlyCounts } from "../issues/countByMonth";
import { isDoneStatus, statusName } from "../issues/labels";
import {
  assigneeLabel,
  categoryLabel,
  DEFAULT_SUMMARY_MODE,
  DEFAULT_SUMMARY_TABLES,
  monthLabel,
  resolveMonth,
  scopeIssues,
  termOf,
  SUMMARY_TABLE_LABEL,
  type ReportContent,
  type ReportContext,
  type SummaryBlock,
  type SummaryTable,
} from "./blocks";

type Props = { block: SummaryBlock; report: ReportContent; ctx: ReportContext };

type Counts = Omit<MonthlyCounts, "month">;
interface SummaryRow { key: string; name: string; count: number }
interface SummaryTableData { table: SummaryTable; heading: string; rows: SummaryRow[]; total: number }
export interface SummaryData { month: string | null; tables: SummaryTableData[] }

/** The scoped issues as they stand, tallied the way `mode: "now"` reads them (see countByMonth.ts for the `mode: "month"` counterpart). */
function currentCounts(issues: Issue[], statuses: StatusDef[]): Counts {
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

function countsOf(table: SummaryTable, counts: Counts): Count[] {
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
  const stageIndex = (id: string): number => ctx.project.statuses.findIndex((s) => s.id === id);
  return [...rows].sort((a, b) => stageIndex(a.key) - stageIndex(b.key));
}

/** The name a row prints; the tallies count an issue with no assignee under "". */
function rowName(table: SummaryTable, key: string, report: ReportContent, ctx: ReportContext): string {
  switch (table) {
    case "status":
      return termOf(report.terms, statusName(ctx.project.statuses, key));
    case "category":
      return termOf(report.terms, categoryLabel(key));
    case "assignee":
    case "reporter":
    case "closed":
      return termOf(report.terms, assigneeLabel(ctx.users, key === "" ? null : key));
  }
}

/** The counted tables of a `::summary` block, shared by the on-screen tables and the Markdown export. */
export function summaryData(block: SummaryBlock, report: ReportContent, ctx: ReportContext): SummaryData {
  const scoped = scopeIssues(block, ctx);
  const mode = block.mode ?? DEFAULT_SUMMARY_MODE;
  const month = mode === "month" ? resolveMonth(block.month, ctx.today) : null;
  const counts: Counts = month !== null ? countByMonth(scoped, month, ctx.project.statuses) : currentCounts(scoped, ctx.project.statuses);
  const tables = (block.tables ?? DEFAULT_SUMMARY_TABLES).map((table) => ({
    table,
    heading: termOf(report.terms, SUMMARY_TABLE_LABEL[table]),
    rows: orderRows(table, countsOf(table, counts), ctx).map((r) => ({ key: r.key, name: rowName(table, r.key, report, ctx), count: r.count })),
    total: table === "closed" ? counts.closedTotal : counts.total,
  }));
  return { month, tables };
}

/** The 集計 tables of a `::summary` block: one two-column table per requested `tables` entry, plus a 合計 row. */
export function SummaryTables({ block, report, ctx }: Props): React.JSX.Element {
  const summary = summaryData(block, report, ctx);
  return (
    <div className="report-doc__summary">
      {summary.month !== null && <p className="report-doc__month">{monthLabel(summary.month)}</p>}
      {summary.tables.map((tableData) => (
        <table key={tableData.table} className="report-doc__summary-table">
          <thead>
            <tr>
              <th>{tableData.heading}</th>
              <th className="report-doc__num">件数</th>
            </tr>
          </thead>
          <tbody>
            {tableData.rows.map((r) => (
              <tr key={r.key}>
                <td>{r.name}</td>
                <td className="report-doc__num">{r.count}</td>
              </tr>
            ))}
            <tr>
              <th>合計</th>
              <td className="report-doc__num">{tableData.total}</td>
            </tr>
          </tbody>
        </table>
      ))}
    </div>
  );
}
