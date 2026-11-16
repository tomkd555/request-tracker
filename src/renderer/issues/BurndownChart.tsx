import type { BurndownRow } from "./burndown";
import { chartGeometry, type BurndownMeasure } from "./burndownGeometry";
import "./burndown.css";

const WIDTH = 720;
const HEIGHT = 280;
const TITLE = "バーンダウンチャート";
const Y_LABEL_GAP = 8;
const X_LABEL_OFFSET = 20;
const DOT_RADIUS = 3;

export const MEASURE_LABEL: Record<BurndownMeasure, string> = { open: "未完了の課題数", hours: "残りの予定時間" };

interface Props { rows: BurndownRow[]; measure: BurndownMeasure; today: string; dueDay: string | null }

/** The burndown as an inline svg line chart with the table of the same numbers below it. */
export function BurndownChart({ rows, measure, today, dueDay }: Props): React.JSX.Element {
  const geometry = chartGeometry(rows, measure, { width: WIDTH, height: HEIGHT, today, dueDay });
  const { left, right, bottom } = geometry.plot;
  return (
    <div>
      <div className="burndown__scroll">
        <svg className="burndown__svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} role="img">
          <title>{TITLE}</title>
          {geometry.yTicks.map((t) => (
            <g key={t.y}>
              <line className="burndown__grid" x1={left} x2={right} y1={t.y} y2={t.y} />
              <text className="burndown__text" x={left - Y_LABEL_GAP} y={t.y} textAnchor="end" dominantBaseline="middle">
                {t.label}
              </text>
            </g>
          ))}
          {geometry.xTicks.map((t) => (
            <text key={t.x} className="burndown__text" x={t.x} y={bottom + X_LABEL_OFFSET} textAnchor="middle">
              {t.label}
            </text>
          ))}
          {geometry.ideal && <line className="burndown__ideal" x1={geometry.ideal.x1} y1={geometry.ideal.y1} x2={geometry.ideal.x2} y2={geometry.ideal.y2} />}
          <polyline className="burndown__line" fill="none" points={geometry.measured.map((p) => `${p.x},${p.y}`).join(" ")} />
          {geometry.measured.map((p) => (
            <circle key={p.day} className="burndown__dot" cx={p.x} cy={p.y} r={DOT_RADIUS} />
          ))}
        </svg>
      </div>
      <table className="issue-table">
        <thead>
          <tr>
            <th className="issue-table__header">日付</th>
            <th className="issue-table__header issue-table__header--num">{MEASURE_LABEL.open}</th>
            <th className="issue-table__header issue-table__header--num">{MEASURE_LABEL.hours}</th>
          </tr>
        </thead>
        <tbody>
          {rows.filter((r) => r.day <= today).map((r) => (
            <tr key={r.day} className="summary__row">
              <td className="issue-table__cell">{r.day}</td>
              <td className="issue-table__cell issue-table__cell--num">{r.open}</td>
              <td className="issue-table__cell issue-table__cell--num">{r.hours}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
