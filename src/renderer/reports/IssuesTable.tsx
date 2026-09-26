import type { Issue } from "../../shared/types";
import { displayNameOf } from "../app/UserContext";
import { formatDate, PRIORITY_LABEL, statusName } from "../issues/labels";
import { issueComparator, type IssueSort } from "../issues/sortIssues";
import { COLUMN_LABEL, DEFAULT_COLUMNS, dateLabel, EMPTY_ROWS, scopeIssues, termOf, type IssueColumn, type IssuesBlock, type IssuesGroupBy, type ReportContent, type ReportContext } from "./blocks";

type Props = { block: IssuesBlock; report: ReportContent; ctx: ReportContext };

export interface IssuesRow { key: string; values: string[] }
const NOWRAP: ReadonlySet<IssueColumn> = new Set(["key", "status", "startDate", "dueDate", "updatedAt", "createdAt"]);
const cellClass = (c: IssueColumn): string | undefined => (NOWRAP.has(c) ? "report-doc__nowrap" : undefined);
export interface IssuesTableData { columns: IssueColumn[]; rows: IssuesRow[]; total: number }
interface Group { label: string | null; rows: Issue[] }

function cellValue(col: IssueColumn, issue: Issue, report: ReportContent, ctx: ReportContext): string {
  const { terms, issueNotes } = report;
  const { users, project } = ctx;
  switch (col) {
    case "key":
      return issue.key;
    case "summary":
      return issueNotes[issue.key]?.summary || issue.summary;
    case "note":
      return issueNotes[issue.key]?.note ?? "";
    case "category":
      return termOf(terms, issue.category || "未設定");
    case "labels":
      return issue.labels.map((l) => termOf(terms, l)).join(" ");
    case "assignee":
      return termOf(terms, issue.assignee === null ? "未設定" : displayNameOf(users, issue.assignee));
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
      return formatDate(issue.updatedAt);
    case "createdAt":
      return formatDate(issue.createdAt);
  }
}

/** Scoped, sorted and limited, the way the table and its groups read them; `total` counts the rows before the limit. */
function sortedRows(block: IssuesBlock, ctx: ReportContext): { rows: Issue[]; total: number } {
  const scoped = scopeIssues(ctx.issues, block, ctx);
  const sort: IssueSort = { key: block.sort ?? "key", dir: block.desc ? "desc" : "asc" };
  const sorted = [...scoped].sort(issueComparator(sort, (u) => displayNameOf(ctx.users, u), ctx.project.statuses));
  return { rows: block.limit === undefined ? sorted : sorted.slice(0, block.limit), total: sorted.length };
}

/** The line under a table the limit cut: which part of the whole it shows. */
export const cutLine = (shown: number, total: number): string | null => (shown < total ? `該当${total}件のうち${shown}件` : null);

/** The rows of an `::issues` block, one string per column; shared by the on-screen table and the Markdown export. */
export function issuesTableRows(block: IssuesBlock, report: ReportContent, ctx: ReportContext): IssuesTableData {
  const columns = block.columns ?? DEFAULT_COLUMNS;
  const { rows, total } = sortedRows(block, ctx);
  return { columns, rows: rows.map((issue) => ({ key: issue.key, values: columns.map((c) => cellValue(c, issue, report, ctx)) })), total };
}

function groupLabelOf(groupBy: Exclude<IssuesGroupBy, "none">, issue: Issue, report: ReportContent, ctx: ReportContext): string {
  const raw =
    groupBy === "assignee"
      ? issue.assignee === null
        ? "未設定"
        : displayNameOf(ctx.users, issue.assignee)
      : groupBy === "status"
        ? statusName(ctx.project.statuses, issue.status)
        : issue.category || "未設定";
  return termOf(report.terms, raw);
}

function groupRows(issues: Issue[], groupBy: IssuesGroupBy, report: ReportContent, ctx: ReportContext): Group[] {
  if (groupBy === "none") return [{ label: null, rows: issues }];
  const map = new Map<string, Issue[]>();
  for (const issue of issues) {
    const label = groupLabelOf(groupBy, issue, report, ctx);
    map.set(label, [...(map.get(label) ?? []), issue]);
  }
  const unset = termOf(report.terms, "未設定");
  const labels = [...map.keys()].sort((a, b) => (a === unset ? 1 : b === unset ? -1 : a.localeCompare(b, "ja")));
  return labels.map((label) => ({ label, rows: map.get(label) ?? [] }));
}

/** A table of the issues an `::issues` block covers, grouped into one tbody per `groupBy` value. */
export function IssuesTable({ block, report, ctx }: Props): React.JSX.Element {
  const columns = block.columns ?? DEFAULT_COLUMNS;
  const { rows, total } = sortedRows(block, ctx);
  const groups = groupRows(rows, block.groupBy ?? "none", report, ctx);
  const cut = cutLine(rows.length, total);

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
      {rows.length === 0 ? (
        <tbody>
          <tr>
            <td colSpan={columns.length}>{EMPTY_ROWS}</td>
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
            {g.rows.map((issue) => (
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
    {cut !== null && <p className="report-doc__cut">{cut}</p>}
    </div>
  );
}
