import type { Issue } from "../../shared/types";
import { displayNameOf } from "../app/SessionContext";
import { formatTimestampDate, PRIORITY_LABEL, statusName } from "../issues/labels";
import { issueComparator, type IssueSort } from "../issues/sortIssues";
import {
  assigneeLabel,
  categoryLabel,
  COLUMN_LABEL,
  dateLabel,
  DEFAULT_COLUMNS,
  DEFAULT_GROUP_BY,
  DEFAULT_SORT_KEY,
  NO_ISSUES_TEXT,
  reportSummaryOf,
  scopeIssues,
  termOf,
  UNSET_LABEL,
  type IssueColumn,
  type IssuesBlock,
  type IssuesGroupBy,
  type ReportContent,
  type ReportContext,
} from "./blocks";

type Props = { block: IssuesBlock; report: ReportContent; ctx: ReportContext };

/** `group` is the label of the group the row sits in, null when the block has no grouping. */
export interface IssuesRow { key: string; group: string | null; values: string[] }
export interface IssuesTableData { columns: IssueColumn[]; rows: IssuesRow[]; total: number }
interface IssueGroup { label: string | null; issues: Issue[] }

const NOWRAP_COLUMNS: ReadonlySet<IssueColumn> = new Set(["key", "status", "startDate", "dueDate", "updatedAt", "createdAt"]);
const cellClass = (c: IssueColumn): string | undefined => (NOWRAP_COLUMNS.has(c) ? "report-doc__nowrap" : undefined);

function cellValue(col: IssueColumn, issue: Issue, report: ReportContent, ctx: ReportContext): string {
  const { terms, issueNotes } = report;
  const { users, project } = ctx;
  switch (col) {
    case "key":
      return issue.key;
    case "summary":
      return reportSummaryOf(report, issue.key, issue.summary);
    case "note":
      return issueNotes[issue.key]?.note ?? "";
    case "category":
      return termOf(terms, categoryLabel(issue.category));
    case "labels":
      return issue.labels.map((l) => termOf(terms, l)).join(" ");
    case "assignee":
      return termOf(terms, assigneeLabel(users, issue.assignee));
    case "reporter":
      return termOf(terms, displayNameOf(users, issue.reporter));
    case "status":
      return termOf(terms, statusName(project.statuses, issue.status));
    case "priority":
      return termOf(terms, PRIORITY_LABEL[issue.priority]);
    case "startDate":
      return issue.startDate === null ? "" : dateLabel(issue.startDate);
    case "dueDate":
      return issue.dueDate === null ? "" : dateLabel(issue.dueDate);
    case "updatedAt":
      return dateLabel(formatTimestampDate(issue.updatedAt));
    case "createdAt":
      return dateLabel(formatTimestampDate(issue.createdAt));
  }
}

/** Scoped, sorted and limited, the way the table and its groups read them; `total` counts the issues before the limit. */
function limitedIssues(block: IssuesBlock, ctx: ReportContext): { issues: Issue[]; total: number } {
  const scoped = scopeIssues(block, ctx);
  const sort: IssueSort = { key: block.sort ?? DEFAULT_SORT_KEY, dir: block.desc ? "desc" : "asc" };
  const sorted = [...scoped].sort(issueComparator(sort, (u) => displayNameOf(ctx.users, u), ctx.project.statuses, ctx.project.milestones));
  return { issues: block.limit === undefined ? sorted : sorted.slice(0, block.limit), total: sorted.length };
}

/** The columns, the groups of the issues shown, and the count before the limit, as the table and the Markdown export read them. */
function issuesTableLayout(block: IssuesBlock, report: ReportContent, ctx: ReportContext): { columns: IssueColumn[]; groups: IssueGroup[]; shownCount: number; total: number } {
  const { issues, total } = limitedIssues(block, ctx);
  return { columns: block.columns ?? DEFAULT_COLUMNS, groups: groupIssues(issues, block.groupBy ?? DEFAULT_GROUP_BY, report, ctx), shownCount: issues.length, total };
}

/** The line under a table the limit cut: which part of the whole it shows. */
export const limitNote = (shown: number, total: number): string | null => (shown < total ? `該当${total}件のうち${shown}件` : null);

/** The rows of an `::issues` block, one string per column; shared by the on-screen table and the Markdown export. */
export function issuesTableRows(block: IssuesBlock, report: ReportContent, ctx: ReportContext): IssuesTableData {
  const { columns, groups, total } = issuesTableLayout(block, report, ctx);
  const rows = groups.flatMap((g) => g.issues.map((issue) => ({ key: issue.key, group: g.label, values: columns.map((c) => cellValue(c, issue, report, ctx)) })));
  return { columns, rows, total };
}

function groupLabelOf(groupBy: Exclude<IssuesGroupBy, "none">, issue: Issue, report: ReportContent, ctx: ReportContext): string {
  switch (groupBy) {
    case "assignee":
      return termOf(report.terms, assigneeLabel(ctx.users, issue.assignee));
    case "status":
      return termOf(report.terms, statusName(ctx.project.statuses, issue.status));
    case "category":
      return termOf(report.terms, categoryLabel(issue.category));
  }
}

/** Groups in label order; 状態 groups follow the stage order, as the summary tables do, and 未設定 comes last. */
export function groupIssues(issues: Issue[], groupBy: IssuesGroupBy, report: ReportContent, ctx: ReportContext): IssueGroup[] {
  if (groupBy === "none") return [{ label: null, issues }];
  const map = new Map<string, Issue[]>();
  const stage = new Map<string, number>();
  for (const issue of issues) {
    const label = groupLabelOf(groupBy, issue, report, ctx);
    map.set(label, [...(map.get(label) ?? []), issue]);
    const at = ctx.project.statuses.findIndex((s) => s.id === issue.status);
    stage.set(label, Math.min(stage.get(label) ?? Infinity, at === -1 ? ctx.project.statuses.length : at));
  }
  const unsetLabel = termOf(report.terms, UNSET_LABEL);
  const byLabel = (a: string, b: string): number => (groupBy === "status" ? (stage.get(a) ?? 0) - (stage.get(b) ?? 0) : 0) || a.localeCompare(b, "ja");
  const labels = [...map.keys()].sort((a, b) => (a === unsetLabel ? 1 : b === unsetLabel ? -1 : byLabel(a, b)));
  return labels.map((label) => ({ label, issues: map.get(label) ?? [] }));
}

/** A table of the issues an `::issues` block covers, grouped into one tbody per `groupBy` value. */
export function IssuesTable({ block, report, ctx }: Props): React.JSX.Element {
  const { columns, groups, shownCount, total } = issuesTableLayout(block, report, ctx);
  const note = limitNote(shownCount, total);

  return (
    <div className="report-doc__scroll">
      <table className="report-doc__issues">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{termOf(report.terms, COLUMN_LABEL[c])}</th>
            ))}
          </tr>
        </thead>
        {shownCount === 0 ? (
          <tbody>
            <tr>
              <td colSpan={columns.length}>{NO_ISSUES_TEXT}</td>
            </tr>
          </tbody>
        ) : (
          groups.map((g, i) => (
            <tbody key={g.label ?? i}>
              {g.label !== null && (
                <tr>
                  <th colSpan={columns.length}>{g.label}</th>
                </tr>
              )}
              {g.issues.map((issue) => (
                <tr key={issue.key}>
                  {columns.map((c) => (
                    <td key={c} className={cellClass(c)}>
                      {cellValue(c, issue, report, ctx)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))
        )}
      </table>
      {note !== null && <p className="report-doc__cut">{note}</p>}
    </div>
  );
}
