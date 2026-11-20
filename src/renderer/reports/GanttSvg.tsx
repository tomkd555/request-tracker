import { displayNameOf } from "../app/SessionContext";
import { layoutGantt, rangeFor, type GanttLayout, type GanttRow, type MonthCount } from "../gantt/layoutGantt";
import { byKeyAsc } from "../issues/compareKeys";
import type { StatusKind } from "../../shared/types";
import {
  assigneeLabel,
  BLOCK_LABEL,
  DEFAULT_GANTT_MONTHS,
  DEFAULT_GROUP_BY,
  NO_ISSUES_TEXT,
  reportSummaryOf,
  resolveMonth,
  scopeIssues,
  termOf,
  type GanttBlock,
  type GanttGroupBy,
  type ReportContent,
  type ReportContext,
} from "./blocks";

type Props = { block: GanttBlock; report: ReportContent; ctx: ReportContext };

// Per-day widths chosen so every range comes out near 730px wide: the editor's preview pane at its narrowest, with no scaling.
const DAY_WIDTH_PX: Record<MonthCount, number> = { 1: 17, 2: 8.8, 3: 5.8, 6: 2.9 };
const LABEL_WIDTH_PX = 200;
const ROW_HEIGHT_PX = 24;
const MONTH_ROW_HEIGHT_PX = 20;
const HEADER_HEIGHT_PX = MONTH_ROW_HEIGHT_PX * 2;
const BAR_HEIGHT_PX = 14;
const LABEL_MAX_CHARS = 17;
const LABEL_PAD_PX = 4;
const INDENT_PER_DEPTH_PX = 12;
const GROUP_LABEL_PAD_PX = 8;
/** A parent's bracket sits this far above the bottom of its row. */
const BRACKET_OFFSET_PX = 9;
const BRACKET_HEIGHT_PX = 5;

// ponytail: a fixed character budget stands in for measuring the rendered text width; tighten it or measure for real if labels still clip
const truncate = (s: string, max: number): string => {
  const chars = Array.from(s); // by code point: slicing UTF-16 units can split a surrogate pair
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : s;
};

const TONE_CLASS: Record<GanttRow["tone"], string> = {
  normal: "report-doc__gantt-bar",
  overdue: "report-doc__gantt-bar report-doc__gantt-bar--overdue",
  muted: "report-doc__gantt-bar report-doc__gantt-bar--muted",
};

type ChartLine = { kind: "group"; label: string } | { kind: "row"; row: GanttRow };
type ChartDay = GanttLayout["dayCells"][number];

const dayOfMonth = (d: ChartDay): number => Number(d.day.slice(8));
/**
 * Every day carries its number over one month, and the Mondays over two or three. Over six months only every other Monday
 * has room: the ones on days 1-6, 14-20 and 28-31 of the month.
 */
const hasDayLabel = (d: ChartDay, months: MonthCount): boolean => months === 1 || (d.monday && (months < 6 || dayOfMonth(d) % 14 < 7));

/** The block's month count and grouping with their defaults, read alike by the chart and its layout. */
const chartOptionsOf = (block: GanttBlock): { months: MonthCount; groupBy: GanttGroupBy } => ({ months: block.months ?? DEFAULT_GANTT_MONTHS, groupBy: block.groupBy ?? DEFAULT_GROUP_BY });

/** The chart's layout for a `::gantt` block, shared by the svg and the Markdown export. */
export function ganttBlockLayout(block: GanttBlock, ctx: ReportContext): GanttLayout {
  const { months, groupBy } = chartOptionsOf(block);
  const month = resolveMonth(block.month, ctx.today);
  const scoped = scopeIssues(block, ctx);
  return layoutGantt(scoped, rangeFor(month, months), {
    today: ctx.today,
    groupBy,
    collapsed: new Set(),
    includeUndated: block.includeUndated ?? false,
    statuses: ctx.project.statuses,
    compare: byKeyAsc, // the issue table above it runs ascending
    assigneeName: (u) => displayNameOf(ctx.users, u),
  });
}

/** The `::gantt` block's chart, as one inline, self-contained svg; every colour is a class from reportCss.ts. */
export function GanttSvg({ block, report, ctx }: Props): React.JSX.Element {
  const { months, groupBy } = chartOptionsOf(block);
  const layout = ganttBlockLayout(block, ctx);
  const rowCount = layout.groups.reduce((n, g) => n + g.rows.length, 0);
  if (rowCount === 0) return <p className="report-doc__empty">{NO_ISSUES_TEXT}</p>;

  const dayWidthPx = DAY_WIDTH_PX[months];
  const colX = (col: number): number => LABEL_WIDTH_PX + col * dayWidthPx;
  const width = LABEL_WIDTH_PX + layout.dayCells.length * dayWidthPx;
  const term = (name: string): string => termOf(report.terms, name);

  const chartLines: ChartLine[] = [];
  for (const g of layout.groups) {
    if (groupBy === "assignee") chartLines.push({ kind: "group", label: term(assigneeLabel(ctx.users, g.label)) });
    for (const r of g.rows) chartLines.push({ kind: "row", row: r });
  }
  const height = HEADER_HEIGHT_PX + chartLines.length * ROW_HEIGHT_PX;

  const stageNames = (pick: (kind: StatusKind) => boolean): string =>
    ctx.project.statuses
      .filter((s) => pick(s.kind))
      .map((s) => term(s.name))
      .join("・");
  return (
    <div className="report-doc__scroll">
    <svg className="report-doc__gantt" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={BLOCK_LABEL.gantt}>
      {layout.dayCells
        .filter((d) => d.weekend)
        .map((d) => (
          <rect key={d.day} className="report-doc__gantt-weekend" x={colX(d.col)} y={0} width={dayWidthPx} height={height} />
        ))}
      {layout.todayCol !== null && <rect className="report-doc__gantt-today" x={colX(layout.todayCol)} y={0} width={dayWidthPx} height={height} />}
      {layout.monthCells.map((m) => (
        <text key={m.label} className="report-doc__gantt-month" x={colX(m.startCol) + (m.span * dayWidthPx) / 2} y={MONTH_ROW_HEIGHT_PX / 2} textAnchor="middle" dominantBaseline="middle">
          {m.label}
        </text>
      ))}
      {layout.dayCells
        .filter((d) => hasDayLabel(d, months))
        .map((d) => (
          <text key={d.day} className="report-doc__gantt-day" x={colX(d.col) + dayWidthPx / 2} y={MONTH_ROW_HEIGHT_PX + MONTH_ROW_HEIGHT_PX / 2} textAnchor="middle" dominantBaseline="middle">
            {dayOfMonth(d)}
          </text>
        ))}
      {chartLines.map((line, i) => {
        const y = HEADER_HEIGHT_PX + i * ROW_HEIGHT_PX;
        if (line.kind === "group") {
          return (
            <g key={`group-${i}`}>
              <rect className="report-doc__gantt-group" x={0} y={y} width={width} height={ROW_HEIGHT_PX} />
              <text className="report-doc__gantt-group-label" x={GROUP_LABEL_PAD_PX} y={y + ROW_HEIGHT_PX / 2} dominantBaseline="middle">
                {line.label}
              </text>
            </g>
          );
        }
        const r = line.row;
        const barY = y + (ROW_HEIGHT_PX - BAR_HEIGHT_PX) / 2;
        const label = truncate(`${r.key} ${reportSummaryOf(report, r.key, r.summary)}`, LABEL_MAX_CHARS);
        return (
          <g key={r.key}>
            <text className="report-doc__gantt-label" x={LABEL_PAD_PX + r.depth * INDENT_PER_DEPTH_PX} y={y + ROW_HEIGHT_PX / 2} dominantBaseline="middle">
              {label}
            </text>
            {r.bar && r.kind === "bracket" && (
              <rect className="report-doc__gantt-bracket" x={colX(r.bar.startCol)} y={y + ROW_HEIGHT_PX - BRACKET_OFFSET_PX} width={r.bar.span * dayWidthPx} height={BRACKET_HEIGHT_PX} />
            )}
            {r.bar && r.kind !== "bracket" && <rect className={TONE_CLASS[r.tone]} x={colX(r.bar.startCol)} y={barY} width={r.bar.span * dayWidthPx} height={BAR_HEIGHT_PX} />}
            {r.late && <rect className="report-doc__gantt-late" x={colX(r.late.startCol)} y={barY} width={r.late.span * dayWidthPx} height={BAR_HEIGHT_PX} />}
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
