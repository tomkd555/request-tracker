import type { BurndownRow } from "./burndown";
import { chartGeometry, type BurndownMeasure } from "./burndownGeometry";
import "./burndown.css";

const WIDTH = 720;
const HEIGHT = 280;
const TITLE = "バーンダウンチャート";

export const MEASURE_LABEL: Record<BurndownMeasure, string> = { open: "未完了の課題数", hours: "残りの予定時間" };

interface Props { rows: BurndownRow[]; measure: BurndownMeasure; today: string; dueDay: string | null }

/** The burndown as an inline svg line chart with the table of the same numbers below it. */
export function BurndownChart({ rows, measure, today, dueDay }: Props): React.JSX.Element {
  const g = chartGeometry(rows, measure, { width: WIDTH, height: HEIGHT, today, dueDay });
  const { left, right, bottom } = g.plot;
  return (
    <div>
      <div className="burndown__scroll">
        <svg className="burndown__svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} role="img">
          <title>{TITLE}</title>
          {g.yTicks.map((t) => (
            <g key={t.y}>
              <line className="burndown__grid" x1={left} x2={right} y1={t.y} y2={t.y} />
              <text className="burndown__text" x={left - 8} y={t.y} textAnchor="end" dominantBaseline="middle">
                {t.label}
              </text>
            </g>
          ))}
          {g.xTicks.map((t) => (
            <text key={t.x} className="burndown__text" x={t.x} y={bottom + 20} textAnchor="middle">
              {t.label}
            </text>
          ))}
          {g.ideal && <line className="burndown__ideal" x1={g.ideal.x1} y1={g.ideal.y1} x2={g.ideal.x2} y2={g.ideal.y2} />}
          <polyline className="burndown__line" fill="none" points={g.measured.map((p) => `${p.x},${p.y}`).join(" ")} />
          {g.measured.map((p) => (
            <circle key={p.day} className="burndown__dot" cx={p.x} cy={p.y} r={3} />
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
