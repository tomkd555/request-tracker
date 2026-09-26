import { displayNameOf } from "../app/UserContext";
import { layoutGantt, rangeFor, type GanttLayout, type GanttRow, type Months } from "../gantt/layoutGantt";
import type { StatusKind } from "../../shared/types";
import { BLOCK_LABEL, EMPTY_ROWS, resolveMonth, scopeIssues, termOf, type GanttBlock, type ReportContent, type ReportContext } from "./blocks";

type Props = { block: GanttBlock; report: ReportContent; ctx: ReportContext };

// Per-day widths chosen so every range comes out near 730px wide: the editor's preview pane at its narrowest, with no scaling.
const DAY_W: Record<Months, number> = { 1: 17, 2: 8.8, 3: 5.8, 6: 2.9 };
const LABEL_W = 200;
const ROW_H = 24;
const MONTH_ROW_H = 20;
const HEADER_H = MONTH_ROW_H * 2;
const BAR_H = 14;
const LABEL_CHARS = 17;

// ponytail: a fixed character budget stands in for measuring the rendered text width; tighten it or measure for real if labels still clip
const truncate = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const TONE_CLASS: Record<GanttRow["tone"], string> = {
  normal: "report-doc__gantt-bar",
  overdue: "report-doc__gantt-bar report-doc__gantt-bar--overdue",
  muted: "report-doc__gantt-bar report-doc__gantt-bar--muted",
};

type Line = { kind: "group"; label: string } | { kind: "row"; row: GanttRow };

/** The chart's layout for a `::gantt` block, shared by the svg and the Markdown export. */
export function ganttLayout(block: GanttBlock, ctx: ReportContext): GanttLayout {
  const month = resolveMonth(block.month, ctx.today);
  const months = block.months ?? 1;
  const scoped = scopeIssues(ctx.issues, block, ctx);
  return layoutGantt(scoped, rangeFor(month, months), {
    today: ctx.today,
    groupBy: block.groupBy ?? "none",
    collapsed: new Set(),
    includeUndated: block.includeUndated ?? false,
    statuses: ctx.project.statuses,
    compare: (a, b) => a.key.localeCompare(b.key), // the issue table above it runs ascending
    groupLabel: (u) => displayNameOf(ctx.users, u),
  });
}

/** The `::gantt` block's chart, as one inline, self-contained svg; every colour is a class from reportCss.ts. */
export function GanttSvg({ block, report, ctx }: Props): React.JSX.Element {
  const months = block.months ?? 1;
  const groupBy = block.groupBy ?? "none";
  const layout = ganttLayout(block, ctx);
  const totalRows = layout.groups.reduce((n, g) => n + g.rows.length, 0);
  if (totalRows === 0) return <p className="report-doc__empty">{EMPTY_ROWS}</p>;

  const dayW = DAY_W[months];
  const x = (col: number): number => LABEL_W + col * dayW;
  const width = LABEL_W + layout.days.length * dayW;

  const lines: Line[] = [];
  for (const g of layout.groups) {
    if (groupBy === "assignee") lines.push({ kind: "group", label: termOf(report.terms, g.label === null ? "未設定" : displayNameOf(ctx.users, g.label)) });
    for (const r of g.rows) lines.push({ kind: "row", row: r });
  }
  const height = HEADER_H + lines.length * ROW_H;

  const t = (name: string): string => termOf(report.terms, name);
  const stageNames = (pick: (kind: StatusKind) => boolean): string =>
    ctx.project.statuses
      .filter((s) => pick(s.kind))
      .map((s) => t(s.name))
      .join("・");
  return (
    <div className="report-doc__scroll">
    <svg className="report-doc__gantt" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={BLOCK_LABEL.gantt}>
      {layout.days
        .filter((d) => d.weekend)
        .map((d) => (
          <rect key={d.day} className="report-doc__gantt-weekend" x={x(d.col)} y={0} width={dayW} height={height} />
        ))}
      {layout.todayCol !== null && <rect className="report-doc__gantt-today" x={x(layout.todayCol)} y={0} width={dayW} height={height} />}
      {layout.months.map((m) => (
        <text key={m.label} className="report-doc__gantt-month" x={x(m.startCol) + (m.span * dayW) / 2} y={MONTH_ROW_H / 2} textAnchor="middle" dominantBaseline="middle">
          {m.label}
        </text>
      ))}
      {layout.days
        .filter((d) => months === 1 || (d.monday && (months < 6 || Number(d.day.slice(8)) % 14 < 7)))
        .map((d) => (
          <text key={d.day} className="report-doc__gantt-day" x={x(d.col) + dayW / 2} y={MONTH_ROW_H + MONTH_ROW_H / 2} textAnchor="middle" dominantBaseline="middle">
            {Number(d.day.slice(8))}
          </text>
        ))}
      {lines.map((line, i) => {
        const y = HEADER_H + i * ROW_H;
        if (line.kind === "group") {
          return (
            <g key={`group-${i}`}>
              <rect className="report-doc__gantt-group" x={0} y={y} width={width} height={ROW_H} />
              <text className="report-doc__gantt-group-label" x={8} y={y + ROW_H / 2} dominantBaseline="middle">
                {line.label}
              </text>
            </g>
          );
        }
        const r = line.row;
        const barY = y + (ROW_H - BAR_H) / 2;
        const label = truncate(`${r.key} ${report.issueNotes[r.key]?.summary || r.summary}`, LABEL_CHARS);
        return (
          <g key={r.key}>
            <text className="report-doc__gantt-label" x={4 + r.depth * 12} y={y + ROW_H / 2} dominantBaseline="middle">
              {label}
            </text>
            {r.bar && r.kind === "bracket" && <rect className="report-doc__gantt-bracket" x={x(r.bar.startCol)} y={y + ROW_H - 9} width={r.bar.span * dayW} height={5} />}
            {r.bar && r.kind !== "bracket" && <rect className={TONE_CLASS[r.tone]} x={x(r.bar.startCol)} y={barY} width={r.bar.span * dayW} height={BAR_H} />}
            {r.late && <rect className="report-doc__gantt-late" x={x(r.late.startCol)} y={barY} width={r.late.span * dayW} height={BAR_H} />}
          </g>
        );
      })}
    </svg>
    <p className="report-doc__key">
      <span className="report-doc__key-swatch report-doc__gantt-bar" /> {stageNames((k) => k === "active")}
      <span className="report-doc__key-swatch report-doc__gantt-bar--overdue" /> 期限超過
      <span className="report-doc__key-swatch report-doc__gantt-late" /> 超過日数
      <span className="report-doc__key-swatch report-doc__gantt-bar--muted" /> {stageNames((k) => k !== "active")}
      <span className="report-doc__key-swatch report-doc__gantt-today" /> 今日
    </p>
    </div>
  );
}
