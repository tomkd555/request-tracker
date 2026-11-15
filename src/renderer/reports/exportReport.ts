import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { displayNameOf } from "../app/UserContext";
import { COLUMN_LABEL, dateLabel, EMPTY_ROWS, expandVariables, monthLabel, parseBody, termOf, type ReportContent, type ReportContext } from "./blocks";
import { ganttLayout } from "./GanttSvg";
import { cutLine, issuesTableRows, type IssuesRow } from "./IssuesTable";
import { REPORT_CSS } from "./reportCss";
import { ReportDocument } from "./ReportDocument";
import { summaryData } from "./SummaryTables";

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** A self-contained HTML document: the report rendered once, with its stylesheet inlined. */
export function reportToHtml(report: ReportContent, ctx: ReportContext): string {
  const body = renderToStaticMarkup(createElement(ReportDocument, { report, ctx, withInvalid: false }));
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title><style>${REPORT_CSS}</style></head><body>${body}</body></html>`;
}

/** A table cell that prints `s` as text: Markdown and HTML punctuation is escaped, a line break becomes a space. */
export const mdCell = (s: string): string =>
  s
    .replace(/\r?\n/g, " ")
    .replace(/[\\|*_`[\]<>]/g, "\\$&")
    .replace(/^(\s*)#/, "$1\\#");
const mdRow = (cells: string[]): string => `| ${cells.map(mdCell).join(" | ")} |`;
const mdTable = (headers: string[], rows: string[][]): string => [mdRow(headers), mdRow(headers.map(() => "---")), ...rows.map(mdRow)].join("\n");

/** The cell rows of a grouped block: a row holding only the label before the first row of each group. */
export function withGroupRows(rows: IssuesRow[], columnCount: number): string[][] {
  const out: string[][] = [];
  let last: string | null = null;
  for (const r of rows) {
    if (r.group !== null && r.group !== last) out.push([r.group, ...Array<string>(columnCount - 1).fill("")]);
    last = r.group;
    out.push(r.values);
  }
  return out;
}

/** A GFM Markdown rendering of the same body: each block becomes a table (a picture has no Markdown form, so `::gantt` lists its rows); a line the author has yet to fix is left out. */
export function reportToMarkdown(report: ReportContent, ctx: ReportContext): string {
  const parts = parseBody(report.body).map((seg) => {
    if (seg.kind === "markdown") return expandVariables(seg.text, ctx, report.terms).trim();
    if (seg.kind === "invalid") return "";
    if (seg.block.kind === "issues") {
      const { columns, rows, total } = issuesTableRows(seg.block, report, ctx);
      if (rows.length === 0) return EMPTY_ROWS;
      const headers = columns.map((c) => termOf(report.terms, COLUMN_LABEL[c]));
      const cut = cutLine(rows.length, total);
      return mdTable(headers, withGroupRows(rows, columns.length)) + (cut === null ? "" : `\n\n${cut}`);
    }
    if (seg.block.kind === "summary") {
      const data = summaryData(seg.block, report, ctx);
      const tables = data.tables.map((t) => mdTable([t.heading, "件数"], [...t.rows.map((r) => [r.name, String(r.count)]), ["合計", String(t.total)]]));
      return data.month === null ? tables.join("\n\n") : [monthLabel(data.month), ...tables].join("\n\n");
    }
    const layout = ganttLayout(seg.block, ctx);
    const rows = layout.groups.flatMap((g) => g.rows);
    if (rows.length === 0) return EMPTY_ROWS;
    const headers = ([COLUMN_LABEL.key, COLUMN_LABEL.summary, COLUMN_LABEL.assignee, COLUMN_LABEL.startDate, COLUMN_LABEL.dueDate]).map((l) => termOf(report.terms, l));
    const body = rows.map((r) => [
      r.key,
      report.issueNotes[r.key]?.summary || r.summary,
      termOf(report.terms, r.assignee === null ? "未設定" : displayNameOf(ctx.users, r.assignee)),
      r.startDate === null ? "" : dateLabel(r.startDate),
      r.dueDate === null ? "" : dateLabel(r.dueDate),
    ]);
    return mdTable(headers, body);
  });
  return parts.filter((p) => p !== "").join("\n\n") + "\n";
}

const WINDOWS_INVALID = /[\\/:*?"<>|]/g;

/** A safe file name for the export: the title with characters Windows refuses replaced, today's date, and the extension. */
export function reportFileName(report: ReportContent, ext: string): string {
  const safeTitle = report.title.replace(WINDOWS_INVALID, "_");
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${safeTitle}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.${ext}`;
}
